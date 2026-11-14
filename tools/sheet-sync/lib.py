# Shared helpers for the record steps.
import openpyxl, re, json, hashlib, os, datetime as dt
D = os.path.dirname(os.path.abspath(__file__)); S = os.environ.get('SRC', D + '/src/'); O = os.environ.get('OUT', D)
MP = json.load(open(O + '/umang-masters-import.json'))['rows']
def tab(f, name):
    ws = openpyxl.load_workbook(S + f, read_only=True, data_only=True)[name]
    rows = [[('' if c is None else str(c).strip()) for c in r] for r in ws.iter_rows(values_only=True)]
    h = rows[0]; return [dict(zip(h, r + [''] * (len(h) - len(r)))) for r in rows[1:] if any(r)]
def nid(coll, legacy): return hashlib.sha1((coll + '|' + legacy).encode()).hexdigest()[:24]
def key(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def norm(x): x = (x or '').strip(); m = re.fullmatch(r'(\d+)\.0', x); return m.group(1) if m else x
def num(x):
    try: return round(float(str(x).replace(',', '')), 2)
    except: return 0
def day(x):
    if not x: return ''
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', x)
    if m: return m.group(0)
    m = re.match(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', x)
    return '%s-%02d-%02d' % (m.group(3), int(m.group(2)), int(m.group(1))) if m else ''
def iso(x):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?', x or '')
    if not m: return ''
    return (dt.datetime(*[int(v or 0) for v in m.groups()]) - dt.timedelta(hours=5, minutes=30)).strftime('%Y-%m-%dT%H:%M:%SZ')
def fy(d): y, m = int(d[:4]), int(d[5:7]); s = y if m >= 4 else y - 1; return '%02d-%02d' % (s % 100, (s + 1) % 100)
def legset(c): return {norm(l) for b in MP[c] for l in b['legacy_ids']}
def U(x): return '@ref:users:' + norm(x) if norm(x) else ''
def fileobj(path, url=''):
    path = (path or '').split('::')[-1]
    if not path and not url: return None
    o = {'name': (path or url).split('/')[-1]}
    if path: o['legacy_path'] = path
    if (url or '').startswith('https://'): o['url'] = url
    return o
CUST = legset('customers')
for c in json.load(open(O + '/data-1-leads.json'))['rows']['masters/customers/rows']: CUST.add(c['legacy_ids'][0])
NEWC = []
def cust(cid, name, r=None):
    c = norm(cid)
    if not c: return ''
    if c in CUST: return '@ref:customers:' + c
    if not name: return ''
    NEWC.append({'id': nid('customers', c), 'name': name, 'address': (r or {}).get('Address', ''), 'city_id': '', 'category_id': '', 'subcategory_ids': [], 'state_id': '', 'mobile': '', 'email_id': '', 'contacts': [],
                 'legacy_ids': [c], 'status': 'Active', 'incomplete': ['added from an old record']}); CUST.add(c)
    return '@ref:customers:' + c
