"""Step 2b: Designs (Design Master + Design Worked) -> app 'designs' and 'design_updates'.

Design Master: one row per design job. Design Worked: one row per update (completed / canceled / approved).
Needs data-1-leads.json and data-3-projects.json from the same run (for lead and project links).
"""
import collections, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib as L

leads = {(q.get('legacy') or {}).get('id'): q for q in json.load(open(L.O + '/data-1-leads.json'))['rows']['leads']}
projects = {p['id'] for p in json.load(open(L.O + '/data-3-projects.json'))['rows']['projects']}
rep = collections.Counter()
rows = collections.OrderedDict((k, []) for k in ['designs', 'design_updates'])
n = lambda v: int(round(L.num(v)))

master = sorted(L.tab('designs.xlsx', 'Design Master'), key=lambda r: (r['Assignment Timestamp'], r['Design ID']))
worked = collections.defaultdict(list)
for w in L.tab('designs.xlsx', 'Design Worked'): worked[w['Design ID']].append(w)
seqs = collections.Counter()
for r in master:
    did = r['Design ID']; D = L.nid('designs', did)
    d = L.day(r['Assignment Date']) or L.day(r['Assignment Timestamp']); f = L.fy(d); seqs[f] += 1
    lid = L.norm(r['Lead ID']); lead = leads.get(lid)
    pid = L.norm(r['Project Id']); P = L.nid('projects', pid) if pid else ''
    if P and P not in projects: rep['designs whose project is not in the projects sheet'] += 1; P = ''
    if lid and not lead: rep['designs whose lead is not in the leads sheet'] += 1
    count, comp, can, appr = n(r['Design Assigned']), n(r['Designs Completed']), n(r['Designs Canceled']), n(r['Designs Approved'])
    if comp + can > count: rep['designs with more done than assigned (count raised to match)'] += 1; count = comp + can
    # Approvals are often recorded only on the Design Worked rows, with the master still at 0: use whichever is higher.
    appr = max(appr, sum(n(w['Designs Approved']) for w in worked[did]))
    appr = min(appr, comp)
    pending0 = max(0, count - comp - can)
    approval = appr > 0 or pending0 > 0  # open designs wait for client approval; finished old ones without any approval recorded don't
    pending = max(0, count - comp - can)
    status = 'In Progress' if pending > 0 else ('Pending Approval' if approval and appr < comp else 'Completed')
    remarks = ' | '.join(x for x in [r['Design Remarks'], ('Client feedback: ' + r['Client Feedback']) if r['Client Feedback'] else '', r['Remarks']] if x)
    body = {'id': D, 'date': d, 'fy': f, 'seq': seqs[f], 'no': 'DSN-%s/%d' % (f, seqs[f]),
            'lead_id': lead['id'] if lead else '', 'project_id': P, 'customer_id': L.cust(r['Customer ID'], r['Customer Name']),
            'count': count, 'due': L.day(r['Target Date']) or d, 'designer': L.U(r['Assigned To ID']),
            'vendor_id': ('@ref:vendors:' + r['Outsourced To ID']) if r['Outsourced To ID'] and not r['Assigned To ID'] else '',
            'approval_required': approval, 'doc': L.fileobj(r['Sample Design Image']), 'remarks': remarks,
            'done': {'completed': comp, 'cancel': can, 'approved': appr}, 'status': status, 'source_locked': True,
            'createdAt': L.iso(r['Assignment Timestamp']) or d + 'T04:30:00Z', 'legacy': {'id': did, 'lead_id': lid, 'project_id': pid}}
    if not body['lead_id'] and not P: rep['designs without lead or project'] += 1
    rows['designs'].append(body); rep['designs'] += 1; rep['designs ' + status] += 1
    for w in sorted(worked[did], key=lambda w: (w['Update Date'], w['Id'])):
        c, x, a = n(w['Designs Completed']), n(w['Designs Canceled']), n(w['Designs Approved'])
        if not (c or x or a or w['Design Remarks'] or w['Client Feedback']): continue
        u = {'id': L.nid('design_updates', w['Id']), 'design_id': D, 'kind': 'work', 'completed': c, 'cancel': x,
             'by': L.U(w['Assigned To ID']), 'remarks': ' | '.join(v for v in [w['Design Remarks'], ('Client feedback: ' + w['Client Feedback']) if w['Client Feedback'] else ''] if v),
             'createdAt': (L.day(w['Update Date']) or d) + 'T06:30:00Z'}
        if c or x or not a: rows['design_updates'].append(u); rep['design updates (work)'] += 1
        if a:
            rows['design_updates'].append({'id': L.nid('design_updates', w['Id'] + '|approval'), 'design_id': D, 'kind': 'approval', 'approved': a,
                'by': L.U(w['Assigned To ID']), 'remarks': ('Client feedback: ' + w['Client Feedback']) if w['Client Feedback'] else '', 'createdAt': u['createdAt']})
            rep['design updates (client approval)'] += 1

json.dump({'kind': 'umang-data-import', 'phase': '2b-designs', 'clear': [], 'rows': rows}, open(L.O + '/data-2b-designs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for k, v in sorted(rep.items()): print(f'{k}: {v}')
