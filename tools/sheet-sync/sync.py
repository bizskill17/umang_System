#!/usr/bin/env python3
"""Hourly Google Sheets -> app sync (see README.md).

  python3 sync.py build  SRC_DIR   # build records from fresh sheet exports, compare with the last sync,
                                   # and write a sealed file of only the new/changed records into api/migration/
  python3 sync.py confirm          # after the server applied it: remember these records as synced

Nothing customer-related is stored in this folder: state/baseline.json.gz holds only record ids and
one-way fingerprints of what was last synced. Sheet exports and built files stay in the temporary folder.
"""
import gzip, hashlib, json, os, subprocess, sys, tempfile, time, glob, csv, shutil, datetime as dt, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
STATE = os.path.join(HERE, 'state'); BASE = os.path.join(STATE, 'baseline.json.gz'); PEND = os.path.join(STATE, 'pending.json.gz')
SITE = 'https://system.umangcommunications.com'
DATA = ['data-1-leads', 'data-2-recce', 'data-3-projects', 'data-5a-jobs', 'data-5b-assign', 'data-5c-qc', 'data-6-delivery', 'data-7-invoices', 'data-8-complaints']
NEED = ['customers.xlsx', 'leads.xlsx', 'users.xlsx', 'vendors.xlsx', 'projects.xlsx', 'recce.xlsx', 'dc.xlsx', 'invoices.xlsx', 'complaint.xlsx', 'jobs.csv']
MAX_CHANGES = 6000  # more than this in one hour means something is wrong with an export: stop and report


def fp(doc):
    d = {k: v for k, v in doc.items() if k != 'imported_at'}
    return hashlib.sha1(json.dumps(d, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def load_gz(p):
    return json.load(gzip.open(p, 'rt')) if os.path.exists(p) else None


def save_gz(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with gzip.open(p + '.tmp', 'wt') as f: json.dump(obj, f, separators=(',', ':'), sort_keys=True)
    os.replace(p + '.tmp', p)


def collect(src):
    """jobs.csv (Drive CSV export of the Jobs tab) and jobitems*.txt (Sheets get_values results, in order) -> json."""
    rows = list(csv.reader(open(os.path.join(src, 'jobs.csv'), encoding='utf-8')))
    json.dump(rows, open(os.path.join(src, 'jobs.json'), 'w'))
    parts = sorted(glob.glob(os.path.join(src, 'jobitems*.txt')), key=lambda p: int(''.join(c for c in os.path.basename(p) if c.isdigit()) or 0))
    if not parts: sys.exit('Missing Job Items exports (jobitems01.txt, jobitems02.txt, ...).')
    items = []
    for p in parts: items += json.load(open(p))['values']
    if not items or items[0][0] != 'Job Item ID': sys.exit('Job Items export does not start with the header row.')
    ids = [r[0] for r in items[1:] if r and r[0]]
    if len(ids) != len(set(ids)): sys.exit('Job Items export has repeated rows (chunks overlap).')
    json.dump(items, open(os.path.join(src, 'jobitems.json'), 'w'))
    return len(rows) - 1, len(items) - 1


def docs_of(out):
    """Every record the builders made, keyed 'path|id'. Only new people (users) and customers among the masters."""
    d = {}
    m = json.load(open(os.path.join(out, 'umang-masters-import.json')))['rows']
    for c, rows in m.items():
        if c != 'firm':  # firms are matched by name in the app and kept as they are
            for r in rows: d['masters/' + c + '/rows|' + r['id']] = r
    for n in DATA:
        for p, rows in json.load(open(os.path.join(out, n + '.json')))['rows'].items():
            for r in rows: d[p + '|' + r['id']] = r
    return d


def build(src):
    src = os.path.abspath(src)
    missing = [f for f in NEED if not os.path.exists(os.path.join(src, f))]
    if missing: sys.exit('Missing exports: ' + ', '.join(missing))
    nj, ni = collect(src)
    out = tempfile.mkdtemp(prefix='umang-sync-')
    env = dict(os.environ, SRC=src + '/', OUT=out)
    for s in ['build.py', 'build_leads.py', 'build_rp.py', 'build_ops.py']:
        r = subprocess.run([sys.executable, os.path.join(HERE, s)], env=env, capture_output=True, text=True)
        if r.returncode: sys.exit(s + ' failed:\n' + r.stderr[-3000:])
    now = docs_of(out)
    base = load_gz(BASE)
    if base is None: sys.exit('No baseline yet (state/baseline.json.gz).')
    send, counts = {}, {}
    for k, doc in now.items():
        h = fp(doc); old = base.get(k)
        if old == h: continue
        p = k.split('|', 1)[0]
        if p.startswith('masters/') and p != 'masters/customers/rows' and old is not None: continue  # existing master entries are never changed by the sync
        kind = 'new' if old is None else 'changed'
        label = 'lead followups' if p.startswith('leads/') else p.replace('masters/', '').replace('/rows', '')
        counts[(label, kind)] = counts.get((label, kind), 0) + 1
        send.setdefault(p, []).append(doc)
    gone = {}
    for k in base:
        if k not in now and not k.startswith('masters/'): p = k.split('|', 1)[0]; gone[p] = gone.get(p, 0) + 1
    total = sum(len(v) for v in send.values())
    print(f'Sheets read: {nj} jobs, {ni} job items.')
    for (label, kind), n in sorted(counts.items()): print(f'  {label:22} {kind:8} {n}')
    if gone: print('  Records no longer in the sheets (left unchanged in the app):', gone)
    if not total:
        print('RESULT: nothing new or changed since the last sync.'); shutil.rmtree(out, True); return 0
    if total > MAX_CHANGES: sys.exit(f'RESULT: stopped - {total} records changed in one hour, which looks wrong. Nothing was sent.')
    order = ['masters/state/rows', 'masters/city/rows', 'masters/designation/rows', 'masters/users/rows', 'masters/customer-category/rows', 'masters/customer-subcategory/rows', 'masters/lead-category/rows', 'masters/lead-subcategory/rows', 'masters/lead-sources/rows', 'masters/vendors/rows', 'masters/machines/rows', 'masters/vehicles/rows', 'masters/customers/rows']
    rows = {p: send[p] for p in order if p in send}; rows.update({p: v for p, v in send.items() if p not in order})
    phase = 'sync-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M')
    pkg = {'kind': 'umang-data-import', 'phase': phase, 'clear': [], 'rows': rows}
    pj = os.path.join(out, 'pkg.json'); json.dump(pkg, open(pj, 'w'), ensure_ascii=False, separators=(',', ':'))
    key = json.load(urllib.request.urlopen(SITE + '/api/index.php?action=migkey', timeout=60))['public_key']
    pem = os.path.join(out, 'pub.pem'); open(pem, 'w').write(key)
    mig = os.path.join(REPO, 'api', 'migration')
    for old in glob.glob(os.path.join(mig, 'data-*.enc')): os.remove(old)  # earlier files already ran
    enc = os.path.join(mig, 'data-' + phase + '.enc')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'seal.py'), pem, pj, enc], capture_output=True, text=True)
    if r.returncode: sys.exit('seal failed: ' + r.stderr[-2000:])
    newbase = dict(base)
    for k, doc in now.items():
        if k.startswith('masters/') and not k.startswith('masters/customers/') and k in base: continue
        newbase[k] = fp(doc)
    save_gz(PEND, {'phase': phase, 'baseline': newbase})
    shutil.rmtree(out, True)
    print(f'RESULT: {total} records to send. Sealed file: api/migration/data-{phase}.enc  phase={phase}')
    return 0


def confirm():
    p = load_gz(PEND)
    if not p: sys.exit('Nothing pending.')
    run = None
    for _ in range(4):  # one step runs per call
        res = json.load(urllib.request.urlopen(SITE + '/api/index.php?action=automigrate', timeout=700))
        run = (res.get('runs') or {}).get(p['phase'])
        if run and 'waiting' not in run: break
        time.sleep(5)
    if not run or 'waiting' in run or 'result' not in run:
        sys.exit('RESULT: the server has not applied ' + p['phase'] + ' (is the deploy finished?): ' + json.dumps(res)[:800])
    print('Applied:', json.dumps(run['result'], ensure_ascii=False)[:1500])
    save_gz(BASE, p['baseline']); os.remove(PEND)
    print('RESULT: baseline updated.')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'build': sys.exit(build(sys.argv[2]))
    if len(sys.argv) == 2 and sys.argv[1] == 'confirm': sys.exit(confirm())
    sys.exit(__doc__)
