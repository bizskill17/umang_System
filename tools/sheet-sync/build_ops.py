# Steps 5-8: Jobs (+assignments, QC), Delivery challans, Invoices (+payments), Complaints.
import re, json, collections, os, importlib.util, datetime as dt
D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('lib', D + '/lib.py'); L = importlib.util.module_from_spec(spec); spec.loader.exec_module(L)
PJ = {p['legacy']['id']: p for p in json.load(open(L.O + '/data-3-projects.json'))['rows']['projects']}
rep = collections.Counter()
def us_day(x):  # Sheets API values are M/D/YYYY
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', x or '')
    return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2))) if m else L.day(x)
def us_iso(x):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?', x or '')
    if not m: return L.iso(x)
    t = dt.datetime(int(m.group(3)), int(m.group(1)), int(m.group(2)), int(m.group(4)), int(m.group(5)), int(m.group(6) or 0)) - dt.timedelta(hours=5, minutes=30)
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')
def sheet(name):
    v = json.load(open(L.S + name)); h = v[0]
    return [dict(zip(h, [str(x).strip() for x in r] + [''] * (len(h) - len(r)))) for r in v[1:] if r and str(r[0]).strip()]
def proj(pid):
    p = PJ.get(L.norm(pid)); return p
ALIAS = {'niren': 'NIREN SAIKIA', 'deepanita': 'Deepanita'}
UN = lambda x: ('@name:users:' + ALIAS.get(x.strip().lower(), x.strip())) if x and x.strip() and x.strip().upper() != 'ABC' else ''
VN = lambda x: ('@name:vendors:' + x.strip()) if x and x.strip() else ''
STEP = {'print': 'Printing', 'laser': 'Laser', 'cnc cutting': 'Cutting', 'cnc': 'Cutting', 'fabrication': 'Fabrication'}
COLS = {'Printing': ('Print', 'Print Quantity', 'Printing Left', 'Update Print Date', 'Print Status Updated By', 'Print Wastage'),
        'Laser': ('Laser', 'Laser Quantity', 'Laser Left', 'Update Laser Date', 'Laser Status Updated By', 'Laser Wastage'),
        'Cutting': ('CNC Cutting', 'CNC Cutting Quantity', 'CNC Cutting Left', 'Update CNC Cutting Date', 'CNC Status Updated By', 'CNC Cutting Wastage'),
        'Fabrication': ('Fabrication', 'Fabrication Quantity', 'Fabrication Left', 'Update Fabrication Date', 'Fabrication Status Updated By', 'Fabrication Wastage')}
# ---------- Jobs ----------
DELIVERED = collections.defaultdict(float)
for x in L.tab('dc.xlsx', 'Delivery Challan Items'):
    if x['Delivery Challan Id'] and x['Job Item ID']: DELIVERED[L.norm(x['Job Item ID'])] += L.num(x['Qty Delivered']) or L.num(x['Quantity'])
# ---------- Jobs ----------
items_by_job = collections.defaultdict(list)
for it in sheet('jobitems.json'): items_by_job[it['Job ID']].append(it)
J = collections.OrderedDict((k, []) for k in ['jobs', 'job_assign', 'qc'])
JOBREF = {}  # job item id -> (job id, lid, qty, project id)
for j in sheet('jobs.json'):
    jid = j['Job ID']; JI = L.nid('jobs', jid); p = proj(j['Project ID'])
    d = us_day(j['Created Timestamp']); fyv = (j['FY'].replace('FY', '').strip() or L.fy(d)); seqv = int(L.num(j['Job Order No.']) or 0)
    items, canceled = [], []
    for it in sorted(items_by_job.get(jid, []), key=lambda x: L.num(x['Sl. No']) or 0):
        lid = L.norm(it['Job Item ID']); qty = L.num(it['Quantity'])
        steps = []
        for s in re.split(r'\s*,\s*', it['Steps Applicable (Print, Laser, CNC Cutting, Fabrication, Packing)'] or ''):
            st = STEP.get(s.strip().lower())
            if st and st not in steps: steps.append(st)
        body = {'lid': lid, 'src': '', 'item_id': '', 'description': ' '.join(x for x in [it['Job Type'], ('(' + it['Specification'] + ')') if it['Specification'] else ''] if x), 'location': it['Location'],
                'width': it['Width'], 'height': it['Height'], 'uom': it['Unit'], 'qty': qty, 'steps': steps, 'remarks': it['Remarks'], 'legacy': {'id': lid}}
        if it['Cancel (Yes)'] == 'Yes' and lid in DELIVERED: body['qty'] = DELIVERED[lid]; body['remarks'] = (body['remarks'] + ' | ' if body['remarks'] else '') + 'Canceled in AppSheet after part delivery'; rep['canceled items kept because they were delivered'] += 1; it = dict(it, **{'Cancel (Yes)': ''}); qty = body['qty']
        if it['Cancel (Yes)'] == 'Yes': body['cancel'] = {'date': us_day(it['Cancel Timestamp']), 'by': UN(it['Cancel By']), 'reason': it['FOC/Cancel Reason']}; canceled.append(body); rep['job items canceled'] += 1; continue
        items.append(body); JOBREF[lid] = (JI, lid, qty, p['id'] if p else '')
        for st in steps:
            pre, qk, lk, uk, bk, wk = COLS[st]
            done, left = L.num(it[qk]), L.num(it[lk]); adate = us_day(it[pre + ' Assign Date']) if (pre + ' Assign Date') in it else ''
            mach, vend = it.get(pre + ' Machinery Id', ''), it.get(pre + ' Outsourced To Id', '')
            if not (done or left or adate or mach or vend):
                if it['Quality Check Status (Ok/Hold)'] == 'OK': done = qty; rep['steps without step data, done because QC passed'] += 1
                else: continue
            aq = round(done + left, 3) or qty
            J['job_assign'].append({'id': L.nid('job_assign', lid + '|' + st), 'job_id': JI, 'lid': lid, 'stage': st, 'qty': aq, 'date': adate or d, 'machine_id': ('@ref:machines:' + mach) if mach else '',
                'vendor_id': ('@ref:vendors:' + vend) if vend and not mach else '', 'assignee': '', 'target': '', 'remarks': it.get(wk, '') and ('Wastage: ' + it[wk]) or '', 'completed': done, 'closed': left <= 0 and done > 0,
                'log': [{'date': us_day(it[uk]) or adate or d, 'at': us_iso(it[pre + ' Assign Timestamp']) if (pre + ' Assign Timestamp') in it else '', 'qty': done, 'by': UN(it[bk]), 'remarks': 'From AppSheet'}] if done else [],
                'createdAt': us_iso(it.get(pre + ' Assign Timestamp', '')) or (d + 'T05:00:00Z')}); rep['job assignments'] += 1
        if it['Quality Check Status (Ok/Hold)'] in ('OK', 'Hold'):
            ok = it['Quality Check Status (Ok/Hold)'] == 'OK'
            J['qc'].append({'id': L.nid('qc', lid), 'job_id': JI, 'lid': lid, 'date': us_day(it['Quality Check Date']) or d, 'by': '', 'passed': qty if ok else 0, 'hold': 0 if ok else qty, 'checked': qty, 'result': 'OK' if ok else 'Hold', 'remarks': it['Quality Check Remarks'], 'createdAt': us_iso(it['Quality Check Timestamp']) or (d + 'T06:00:00Z')}); rep['QC records'] += 1
    passed_all = all(any(q['lid'] == x['lid'] and q['result'] == 'OK' for q in J['qc'][-len(items) - 5:]) for x in items) if items else False
    status = 'Canceled' if not items and canceled else 'Completed' if passed_all else 'In Progress' if any(a['job_id'] == JI for a in J['job_assign'][-60:]) else 'Pending'
    J['jobs'].append({'id': JI, 'date': d, 'designer': L.U(j['Designer Id']), 'owner': L.U(j['Project Owner Id']), 'project_id': p['id'] if p else '', 'quotation_id': (p or {}).get('quotation_id', ''), 'customer_id': (p or {}).get('customer_id', ''),
                      'items': items, 'canceled_items': canceled, 'fy': fyv, 'seq': seqv, 'no': fyv.replace('-', '/') + ' - ' + str(seqv), 'status': status, 'remarks': '', 'createdAt': us_iso(j['Created Timestamp']) or (d + 'T04:30:00Z'), 'legacy': {'id': jid, 'no': j['Job Order No.']}})
    rep['jobs'] += 1; rep['jobs ' + status] += 1
    if not p: rep['jobs whose project is missing'] += 1
# ---------- Delivery ----------
Dp = collections.OrderedDict([('dispatches', [])])
dcitems = collections.defaultdict(list)
for x in L.tab('dc.xlsx', 'Delivery Challan Items'): dcitems[L.norm(x['Delivery Challan Id'])].append(x)
extra_passed = collections.defaultdict(float)
for dc in L.tab('dc.xlsx', 'Delivery Challans'):
    did = L.norm(dc['Delivery Challan Id']); p = proj(dc['Project Id']); d = L.day(dc['Date'])
    m = re.match(r'(\d{2})-(\d{2})/(\d+)', dc['DC Number'] or ''); fyv, seqv = (m.group(1) + '-' + m.group(2), int(m.group(3))) if m else (L.fy(d), 0)
    lines = []
    for x in dcitems.get(did, []):
        ref = JOBREF.get(L.norm(x['Job Item ID']))
        if not ref:
            if not x['Job Item ID']: rep['DC lines with no job item (blank rows)'] += 1; continue
            lines.append({'job_id': '', 'lid': L.norm(x['Job Item ID']), 'qty': L.num(x['Qty Delivered']) or L.num(x['Quantity']), 'description': x['Job Item'] or x['Items'], 'location': x['Location'], 'uom': x['Unit'],
                          'received_by': x['Received By'], 'delivered_by_name': x['Delivered By'], 'note': 'Job item deleted in AppSheet', 'legacy_id': x['Delivery Challan Item Id']})
            rep['DC lines kept without a job item (job item deleted in AppSheet)'] += 1; continue
        q = L.num(x['Qty Delivered']) or L.num(x['Quantity'])
        photos = [o for o in [L.fileobj(x['Installation Photograph %d' % k]) for k in range(1, 6)] if o]
        lines.append({'job_id': ref[0], 'lid': ref[1], 'qty': q, 'received_by': x['Received By'], 'delivered_by_name': x['Delivered By'], 'install_qty': L.num(x['Qty Installation']), 'install_date': L.day(x['Installation Date']),
                      'install_remarks': x['Installation Remarks'], 'install_photos': photos, 'latlong': x['Installation LatLong'], 'install_address': x['Installation Address'], 'defect': x['Installation Defect Detected (Yes/No)'],
                      'defect_resolved': L.day(x['Installation Defected Resolved Date']), 'defect_remark': x['Installation Defected Resolved Remark'], 'legacy_id': x['Delivery Challan Item Id']})
        extra_passed[ref[1]] += q; rep['DC lines'] += 1
    outs = bool(dc['Outsourced To'])
    inst = [l for l in lines if l.get('install_qty')]
    Dp['dispatches'].append({'id': L.nid('dispatches', did), 'date': d, 'project_id': p['id'] if p else '', 'customer_id': (p or {}).get('customer_id', '') or ('@ref:customers:' + L.norm(dc['Client Id']) if dc['Client Id'] else ''),
        'delivered_by': UN(dc['Prepared By']), 'mode_type': 'Outsource' if outs else 'In House', 'party_user': '' if outs else UN(dc['Assigned To']), 'party_vendor': VN(dc['Outsourced To']) if outs else '',
        'party': VN(dc['Outsourced To']) if outs else UN(dc['Assigned To']), 'transporter': '', 'vehicle': ('@ref:vehicles:' + dc['Vehicle No.']) if dc['Vehicle No.'] else '', 'vehicle_type': dc['Vechile Type'], 'driver': UN(dc['Driver']),
        'installation': dc['Installation Applicable'] == 'Yes' or bool(inst), 'install_by': UN(dc['Installation Assigned To'] or dc['Installation Assignee']), 'install_vendor': VN(dc['Installation Outsourced To']),
        'install_date': max([l['install_date'] for l in inst if l['install_date']], default=''), 'remarks': dc['Remarks'], 'pdf': L.fileobj(dc['DC Pdf']),
        'fy': fyv, 'seq': seqv, 'no': 'DSP - %s - %04d' % (fyv.replace('-', '/'), seqv) if m else 'DC ' + dc['DC Number'], 'items': lines, 'createdAt': d + 'T06:00:00Z', 'legacy': {'id': did, 'no': dc['DC Number']}})
    rep['dispatches'] += 1
    if not lines: rep['dispatches without any line'] += 1
# make QC passed cover what was delivered (old data delivered some items without a QC entry)
qcl = {q['lid']: q for q in J['qc']}
for lid, q in extra_passed.items():
    ref = next((r for r in [JOBREF.get(lid)] if r), None); have = qcl.get(lid)
    if have and have['passed'] >= q - 1e-6: continue
    if have: have['passed'] = max(have['passed'], q); have['result'] = 'OK'; rep['QC raised to delivered qty'] += 1
    else: J['qc'].append({'id': L.nid('qc', lid), 'job_id': ref[0], 'lid': lid, 'date': '', 'by': '', 'passed': q, 'hold': 0, 'checked': q, 'result': 'OK', 'remarks': 'Delivered in AppSheet without a QC entry', 'createdAt': ''}); rep['QC added for delivered items'] += 1
# job status from the final QC and assignments
qcp = collections.defaultdict(float)
for q in J['qc']: qcp[q['lid']] += q['passed']
asg = {a['job_id'] for a in J['job_assign']}
rep2 = collections.Counter()
for jb in J['jobs']:
    if jb['status'] == 'Canceled': rep2['Canceled'] += 1; continue
    jb['status'] = 'Completed' if jb['items'] and all(qcp[x['lid']] >= x['qty'] - 1e-6 for x in jb['items']) else 'In Progress' if jb['id'] in asg else 'Pending'
    rep2[jb['status']] += 1
print('job status after QC:', dict(rep2))
# ---------- Invoices ----------
I = collections.OrderedDict([('invoices', []), ('payments', [])])
inv = L.tab('invoices.xlsx', 'Invoices'); last = {}
for r in sorted(inv, key=lambda r: (L.day(r['Invoice Date']), r['Created Timestamp'])): last[L.norm(r['Project ID'])] = r['Invoice ID']
for r in inv:
    p = proj(r['Project ID']); before, gst, after = L.num(r['Invoice Amount (Before GST)']), L.num(r['GST Amount']), L.num(r['Invoice Amount (After GST)'])
    paid = r['Update Status'] == 'Paid'; full = p and p['status'] == 'Completed' and last.get(L.norm(r['Project ID'])) == r['Invoice ID']
    b = {'id': L.nid('invoices', r['Invoice ID']), 'date': L.day(r['Invoice Date']), 'no': r['Invoice Number'], 'project_id': p['id'] if p else '', 'customer_id': (p or {}).get('customer_id', '') or ('@ref:customers:' + L.norm(r['Client ID'])),
         'bill_type': 'Full' if full else 'Part', 'before': before, 'gst': gst, 'after': after or round(before + gst, 2), 'follow_required': 'No' if r['Follow Up Required'] == 'Not Required' else 'Yes' if r['Follow Up Required'] == 'Yes' else ('No' if paid else 'Yes'),
         'pdf': L.fileobj(r['Invoice Pdf']), 'notes': r['Invoice Remarks'], 'paid': after if paid else 0, 'payment': 'Fully Paid' if paid else 'Not Yet Paid', 'status': 'Active',
         'eway_applicable': bool(r['E-Way Bill No']), 'eway_no': r['E-Way Bill No'], 'eway_date': L.day(r['E-Way Bill Date']), 'eway_doc': L.fileobj(r['E-Way Bill PDF']),
         'sent': {'date': L.day(r['Invoice Date']), 'by': '', 'proof': L.fileobj(r['Send Proof']), 'mode': r['Send Mode'] or 'Before migration'}, 'next_fu': L.day(r['Next Follow Up Date']), 'fu_by': UN(r['Follow Up By']),
         'createdAt': L.iso(r['Created Timestamp']) or '', 'legacy': {'id': r['Invoice ID'], 'created_by': r['Created By']}}
    if paid: b['paid_date'] = L.day(r['Follow Up Date']) or L.day(r['Last Update Timestamp']); I['payments'].append({'id': L.nid('payments', r['Invoice ID']), 'invoice_id': b['id'], 'date': b['paid_date'] or b['date'], 'status': 'Fully Paid', 'amount': b['after'], 'mode': '', 'remarks': 'Marked Paid in AppSheet', 'createdAt': L.iso(r['Last Update Timestamp']) or ''})
    I['invoices'].append(b); rep['invoices'] += 1; rep['invoices ' + b['payment']] += 1
    if not p: rep['invoices whose project is missing'] += 1
# ---------- Complaints ----------
C = collections.OrderedDict([('complaints', []), ('complaint_updates', [])]); seqs = collections.Counter()
for r in sorted(L.tab('complaint.xlsx', 'Complaint Master'), key=lambda r: r['Timestamp']):
    p = proj(r['Project Id']); d = L.day(r['Date']); ym = d[2:4] + d[5:7]; seqs[ym] += 1; done = r['Status'] == 'Completed'
    who = r['Assign To'] or ''
    b = {'id': L.nid('complaints', r['Id']), 'date': d, 'project_id': p['id'] if p else '', 'customer_id': (p or {}).get('customer_id', ''), 'priority': 'Medium', 'complaint_type_id': '@name:complaint-types:Other',
         'docs': [o for o in [L.fileobj(r['Photo']), L.fileobj(r['Document'])] if o], 'details': r['Issue'], 'ym': ym, 'seq': seqs[ym], 'no': 'CMP-%s-%05d' % (ym, seqs[ym]), 'punched_by': UN(r['Punch By']),
         'assigned_to': UN(who), 'outsource': VN(r['Outsource']), 'target': L.day(r['Next Action Date']), 'assigned_at': L.day(r['Assign Date']),
         'status': 'Resolved' if done else 'Assigned' if (who or r['Outsource']) else 'New', 'createdAt': L.iso(r['Timestamp']), 'legacy': {'id': r['Id'], 'client': r['Client Name']}}
    if done: b.update({'resolution_date': L.day(r['Action Date']) or d, 'resolution_remarks': r['Remarks'] or 'Completed', 'resolution_docs': [o for o in [L.fileobj(r['Update Photo']), L.fileobj(r['Update Document'])] if o]})
    if r['Update By']:
        C['complaint_updates'].append({'id': L.nid('complaint_updates', r['Id']), 'complaint_id': b['id'], 'status': 'Resolved' if done else 'In Progress', 'date': L.day(r['Action Date']) or d, 'by': UN(r['Update By']), 'remarks': r['Remarks'], 'photos': b.get('resolution_docs', []), 'createdAt': L.iso(r['Timestamp'])})
        b['last_update'] = {'at': '', 'by': UN(r['Update By']), 'remarks': r['Remarks'], 'status': 'Resolved' if done else 'In Progress'}; b['update_count'] = 1
    C['complaints'].append(b); rep['complaints ' + b['status']] += 1
    if re.search(r'test', r['Issue'], re.I) or r['Client Name'] == 'Bizskill': rep['complaints that look like tests (kept)'] += 1
for name, phase, rows, clear in [('data-5a-jobs', '5a-jobs', {'jobs': J['jobs']}, ['jobs', 'job_assign', 'qc', 'wastage']), ('data-5b-assign', '5b-assign', {'job_assign': J['job_assign']}, []), ('data-5c-qc', '5c-qc', {'qc': J['qc']}, []), ('data-6-delivery', '6-delivery', Dp, ['dispatches']), ('data-7-invoices', '7-invoices', I, ['invoices', 'payments']), ('data-8-complaints', '8-complaints', C, ['complaints', 'complaint_updates'])]:
    if phase == '6-delivery': rows['masters/customers/rows'] = L.NEWC
    json.dump({'kind': 'umang-data-import', 'phase': phase, 'clear': clear, 'rows': rows}, open(L.O + '/' + name + '.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for k, v in sorted(rep.items()): print(' ', k, v)
for n in ['data-5a-jobs', 'data-5b-assign', 'data-5c-qc', 'data-6-delivery', 'data-7-invoices', 'data-8-complaints']: print(n, os.path.getsize(L.O + '/' + n + '.json') // 1024, 'KB')
