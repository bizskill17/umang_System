# Step 2: Recce (Recce Master + Recce Worked). Step 3: Projects (+ quotations linked or created from project rows).
import openpyxl, re, json, collections, os, datetime as dt, importlib.util
D = os.path.dirname(os.path.abspath(__file__)); S = os.environ.get('SRC', D + '/src/'); O = os.environ.get('OUT', D)
spec = importlib.util.spec_from_file_location('bl', D + '/lib.py'); L = importlib.util.module_from_spec(spec); spec.loader.exec_module(L)
from_leads = json.load(open(O + '/data-1-leads.json'))['rows']
LEADS = {l['legacy']['id']: l for l in from_leads['leads']}
QUOTES = {q['lead_id']: q for q in from_leads['quotations']}
rep = collections.Counter()
# ---------- Recce ----------
rows = collections.OrderedDict((k, []) for k in ['recce', 'recce_updates'])
master = sorted(L.tab('recce.xlsx', 'Recce Master'), key=lambda r: (r['Assignment Timestamp'], r['Recce ID']))
seqs = collections.Counter()
worked = collections.defaultdict(list)
for w in L.tab('recce.xlsx', 'Recce Worked'): worked[w['Recce ID']].append(w)
for r in master:
    rid = r['Recce ID']; R = L.nid('recce', rid); d = L.day(r['Assignment Date']) or L.day(r['Assignment Timestamp']); f = L.fy(d); seqs[f] += 1
    lid = L.norm(r['Lead ID']); lead = LEADS.get(lid)
    pids = [L.norm(w['Project Id']) for w in worked[rid] if L.norm(w['Project Id'])]
    pid = L.nid('projects', pids[0]) if pids else ''
    units = int(L.num(r['Units Assigned'])); comp = int(L.num(r['Units Completed'])); den = int(L.num(r['Units Denied'])); can = int(L.num(r['Cancel']))
    pend = max(0, units - comp - den - can); note = ''
    if r['Cancel Lead / Project'] and pend: can += pend; note = 'Lead or project canceled in AppSheet'; pend = 0; rep['recce: pending sites closed as cancel (lead/project canceled)'] += 1
    body = {'id': R, 'date': d, 'fy': f, 'seq': seqs[f], 'no': 'REC-%s/%d' % (f, seqs[f]), 'lead_id': lead['id'] if lead else '', 'project_id': pid, 'customer_id': L.cust(r['Customer ID'], r['Customer Name']),
            'site_contact': '', 'units': units, 'target': L.day(r['Target Date']) or d, 'assigned_to': L.U(r['Assigned To ID']), 'vendor_id': ('@ref:vendors:' + r['Outsourced To ID']) if r['Outsourced To ID'] and not r['Assigned To ID'] else '',
            'ppt_by': L.U(r['Assigned To ID']) if r['Assigned To ID'] else '', 'site_address': r['Location'], 'doc': L.fileobj(r['Recce List']), 'remarks': r['Recce Remarks'] + (' | ' + note if note else ''),
            'done': {'completed': comp, 'denied': den, 'cancel': can}, 'status': 'In Progress' if pend > 0 else 'Completed', 'completed_at': L.day(r['Completion Date']) if pend == 0 else '',
            'createdAt': L.iso(r['Assignment Timestamp']) or d + 'T04:30:00Z', 'legacy': {'id': rid, 'lead_id': lid}}
    if not lead and lid: rep['recce whose lead is not in the leads sheet'] += 1
    if not body['lead_id'] and not pid: rep['recce without lead or project'] += 1
    rows['recce'].append(body); rep['recce'] += 1; rep['recce ' + body['status']] += 1
    for w in sorted(worked[rid], key=lambda w: w['Completion Timestamp']):
        c, dn, x = int(L.num(w['Units Completed'])), int(L.num(w['Units Denied'])), int(L.num(w['Cancel']))
        rows['recce_updates'].append({'id': L.nid('recce_updates', w['Id']), 'recce_id': R, 'completed': c, 'denied': dn, 'cancel': x, 'pending_after': int(L.num(w['Pending'])),
            'by': L.U(w['Assigned To ID']), 'vendor_id': ('@ref:vendors:' + w['Outsourced To ID']) if w['Outsourced To ID'] else '', 'remarks': w['Recce Remarks'], 'doc': L.fileobj(w['Update Document']),
            'createdAt': L.iso(w['Completion Timestamp']) or (L.day(w['Completion Date']) + 'T06:30:00Z')}); rep['recce updates'] += 1
recce_rows = rows
# ---------- Projects ----------
rows = collections.OrderedDict((k, []) for k in ['projects', 'quotations'])
LCAT = L.legset('lead-category'); SUBN = {L.key(b['name']): b['legacy_ids'][0] for b in L.MP['lead-subcategory']}
qrows = {}
YES = lambda x: 'Yes' if (x or '').strip().lower() in ('yes', 'y') else 'No' if x else ''
for r in L.tab('projects.xlsx', 'Projects'):
    pid = L.norm(r['Project ID']); P = L.nid('projects', pid); d = L.day(r['Date']) or L.day(r['Created Timestamp'])
    m = re.match(r'\s*(\d{2})\s*/\s*(\d{2})\s*-\s*(\d+)', r['Project Number'])
    f, s = (m.group(1) + '-' + m.group(2), int(m.group(3))) if m else (L.fy(d), 0)
    if not m: rep['project number not in "25/26 - 1" form'] += 1
    lid = L.norm(r['Lead ID']); lead = LEADS.get(lid); q = QUOTES.get(lead['id']) if lead else None
    cat = L.norm(r['Project Category Id'])
    sub = SUBN.get(L.key((r['Lead Sub-Category Name'] or '').split(',')[0]))
    canceled = bool(r['Cancel Timestamp']); complete = r['Project Complete'] == 'Yes'
    status = 'Canceled' if canceled else 'Completed' if complete else 'In Progress'
    body = {'id': P, 'date': d, 'due': L.day(r['Target Date']) or d, 'fy': f, 'seq': s, 'no': f + '/' + str(s) if m else 'OLD/' + L.norm(r['Project Number']), 'name': r['Project Name'],
            'firm_id': '@ref:firm:' + (r['Firm Name'] or 'Umang Communications Pvt Ltd'), 'lead_category_id': ('@ref:lead-category:' + cat) if cat in LCAT else ('@name:lead-category:' + r['Project Category'] if r['Project Category'] else ''),
            'lead_subcategory_id': '@ref:lead-subcategory:' + sub if sub else '', 'lead_source_id': '@ref:lead-sources:' + L.norm(r['Source Id']) if r['Source Id'] else '',
            'customer_id': L.cust(r['Customer ID'], r['Customer Name'], r), 'owner': L.U(r['Project Owner Id']), 'controller': L.U(r['Project Controller ID']),
            'cert_applicable': YES(r['Completion Certificate Aplicable']) or 'No', 'lead_id': lead['id'] if lead else '', 'status': status,
            'amt_before': L.num(r['Amount Before GST']), 'amt_gst': L.num(r['GST Amount']), 'amt_after': L.num(r['Amount after GST']), 'remarks': r['Project Remarks'],
            'wo_no': r['Work Order Number'], 'wo_date': L.day(r['Work Order Date']), 'wo_amount': L.num(r['Work Order Amount']), 'wo_file': L.fileobj(r['Work Order PDF']),
            'billing_name': r['BILLING NAME'], 'outsource': r['OUTSOURCE APPLICABLE (YES/NO)'], 'outsource_to': r['OUTSOURCE TO'], 'outsource_job': r['OUTSOURCED JOB TYPE'], 'recce': r['RECCE'], 'job_type': r['JOB TYPE'],
            'delivery_head': r['DELIVERY HEAD'], 'installation': r['INSTALLATION'], 'install_cert': r['INSTALLATION CERTIFICATE REQUIRED OR NOT'], 'billing_type': r['BILLING TYPE (CASH OR GST BILL)'],
            'material': r['MATERIAL DETAILS (IF ANY SPECIAL OR SPECIFIC CLIENT REQUIREMENT)'], 'vendor_id': r['Vendor Name'], 'notes': ' | '.join(x for x in [r['ADDITIONAL NOTES'], r['Remarks'], ('Tentative delivery ' + r['TENTATIVE DELIVERY DATE']) if r['TENTATIVE DELIVERY DATE'] else ''] if x),
            'sheet_documents': [x for x in [L.fileobj(r['Project Sheet Pdf'])] if x], 'createdAt': L.iso(r['Created Timestamp']) or d + 'T04:30:00Z', 'updatedAt': L.iso(r['Last Update Timestamp']) or '',
            'legacy': {'id': pid, 'no': r['Project Number'], 'lead_id': lid, 'job_numbers': r['Job Numbers'], 'bill_numbers': r['Bill Numbers'], 'dc_number': r['DC Number']}}
    body['sheet_status'] = 'Submitted' if r['Create Project Sheet'] == 'Yes' or any(r[k] for k in ['BILLING NAME', 'JOB TYPE', 'OUTSOURCE APPLICABLE (YES/NO)']) else 'Submitted' if status != 'In Progress' else 'Pending'
    if canceled: body['cancel'] = {'by': '', 'date': L.day(r['Cancel Timestamp']), 'reason': r['Cancel Reason'] or 'Canceled in AppSheet', 'by_email': r['Cancel By']}
    if complete and not canceled: body['completion'] = {'date': (L.day(r['Last Update Timestamp']) or d), 'by': '', 'cert': L.fileobj(r['Upload Completion Certificate']), 'remarks': 'Completed in AppSheet'}
    if q:
        qq = dict(qrows.get(q['id']) or q); qq['project_id'] = P; qq['status'] = 'Approved' if qq['status'] in ('Approved', 'Pending Approval', 'Rejected') and not canceled else qq['status']
        qrows[q['id']] = qq; body['quotation_id'] = q['id']; rep['projects linked to a lead quotation'] += 1
    elif r['Quotation Number'] or L.num(r['Quotation Amount']):
        Q = L.nid('quotations', 'P:' + pid); qd = L.day(r['Quotation Date']) or d; amt = L.num(r['Quotation Amount']); qno = L.norm(r['Quotation Number'])
        qrows[Q] = {'id': Q, 'lead_id': body['lead_id'], 'lead_no': lead['lead_no'] if lead else '', 'project_id': P, 'firm_id': body['firm_id'], 'customer_id': body['customer_id'], 'sales_person': body['owner'], 'mode': 'upload', 'items': [],
                    'no': qno, 'fy': L.fy(qd), 'seq': int(qno) if qno.isdigit() else 0, 'date': qd, 'expiry': qd, 'subtotal': amt, 'discount': 0, 'gst': 0, 'round_off': 0, 'total': amt, 'amount_note': 'Amount from the old Projects sheet (GST not split)',
                    'made_by': body['owner'], 'assigned_to': body['owner'], 'file': L.fileobj(r['Quotation PDF'], r['Quotation Link']), 'status': 'Approved', 'approved_at': qd, 'createdAt': body['createdAt'], 'legacy': {'project_id': pid, 'no': qno}}
        body['quotation_id'] = Q; rep['projects with a quotation made from the project row'] += 1
    else: rep['projects without any quotation'] += 1
    rows['projects'].append(body); rep['projects'] += 1; rep['projects ' + status] += 1
rows['quotations'] = list(qrows.values())
recce_rows = collections.OrderedDict([('masters/customers/rows', L.NEWC)] + list(recce_rows.items()))
json.dump({'kind': 'umang-data-import', 'phase': '2-recce', 'clear': ['recce', 'recce_updates'], 'rows': recce_rows}, open(O + '/data-2-recce.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'kind': 'umang-data-import', 'phase': '3-projects', 'clear': ['projects'], 'rows': rows}, open(O + '/data-3-projects.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for k, v in sorted(rep.items()): print(' ', k, v)
print('new customers', len(L.NEWC))
