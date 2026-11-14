# Step 1: Leads sheet -> leads, lead follow-ups, quotations (upload type), quotation follow-ups, missing customers.
import openpyxl, re, json, hashlib, collections, os, datetime as dt
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
    try: return round(float(x), 2)
    except: return 0
def day(x):
    if not x: return ''
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', x)
    if m: return m.group(0)
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', x)
    return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2))) if m else ''
def iso(x):  # sheet times are India time
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?', x or '')
    if not m: return ''
    t = dt.datetime(*[int(v or 0) for v in m.groups()]) - dt.timedelta(hours=5, minutes=30)
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')
def fy(d): y, m = int(d[:4]), int(d[5:7]); s = y if m >= 4 else y - 1; return '%02d-%02d' % (s % 100, (s + 1) % 100)
def legset(c): return {norm(l) for b in MP[c] for l in b['legacy_ids']}
CUST, LCAT = legset('customers'), legset('lead-category')
SUBS = collections.defaultdict(dict)
for b in MP['lead-subcategory']: SUBS[b['lead_category_id']][key(b['name'])] = b['legacy_ids'][0]
SUB_ANY = {key(b['name']): b['legacy_ids'][0] for b in MP['lead-subcategory']}
LCAT_ID = {norm(l): b['id'] for b in MP['lead-category'] for l in b['legacy_ids']}
def U(x): return '@ref:users:' + norm(x) if norm(x) else ''
def fileobj(path, url=''):
    if not path and not url: return None
    o = {'name': (path or url).split('/')[-1]}
    if path: o['legacy_path'] = path
    if url.startswith('https://'): o['url'] = url
    return o
rows = collections.OrderedDict((k, []) for k in ['masters/customers/rows', 'leads', 'quotations', 'quote_followups'])
rep = collections.Counter(); review = []
# customers added to the sheet after the master import, and customers that only exist on leads
newc = {}
for r in tab('customers.xlsx', 'Customers'):
    lid = norm(r['Customer ID'])
    if lid and lid not in CUST and r['Customer Name']: newc[lid] = {'name': r['Customer Name'], 'address': r['Address'], 'city': r['City ID'], 'cat': r['Category ID'], 'mobile': r['Contact Number'], 'person': r['Contact Person'], 'email': r['Email ID']}
def mob(s):
    m = re.sub(r'\D', '', s or '');  m = m[2:] if len(m) == 12 and m.startswith('91') else m
    return m if len(m) == 10 and m[0] in '6789' and len(set(m)) > 1 else ''
made = set()
def customer(r):
    c = norm(r['Customer ID'])
    if c in CUST or c in made: return '@ref:customers:' + c
    src = newc.get(c) or {'name': r['Customer Name'], 'address': r['Address'], 'city': '', 'cat': '', 'mobile': r['Contact Number'], 'person': r['Contact Person'], 'email': r['Email ID']}
    if not src['name']: rep['lead without customer'] += 1; return ''
    ph = mob(src['mobile']); body = {'id': nid('customers', c), 'name': src['name'], 'address': src['address'], 'city_id': '@ref:city:' + src['city'] if src['city'] else '', 'category_id': '@ref:customer-category:' + src['cat'] if src['cat'] else '', 'subcategory_ids': [], 'state_id': '', 'mobile': ph, 'email_id': '', 'contacts': [{'name': src['person'], 'mobile': ph, 'email': '', 'designation_id': ''}] if src['person'] else [], 'legacy_ids': [c], 'status': 'Active', 'incomplete': ['added from the leads sheet']}
    rows['masters/customers/rows'].append(body); made.add(c); CUST.add(c); rep['customers added (new or only on leads)'] += 1
    return '@ref:customers:' + c
for r in tab('leads.xlsx', 'Leads'):
    lid = norm(r['Lead ID']); 
    if not lid: continue
    L = nid('leads', lid); d = day(r['Lead Creation Date']) or day(r['Lead Timestamp']); created = iso(r['Lead Timestamp']) or (d + 'T04:30:00Z')
    no = norm(r['Lead No']); f = fy(d)
    canceled = r['Cancel Lead'] == 'Yes' or r['Lead Status'] == 'Fail' or r['Status'] == 'Cancel Leads'
    approved = r['Client Quotation Approval Status'] == 'Approved'
    completed = not canceled and (r['Lead Status'] == 'Complete' or r['Status'] == 'Project Created' or approved)
    cat = norm(r['Lead Category ID'])
    catref = '@ref:lead-category:' + cat if cat in LCAT else ('@name:lead-category:' + r['Lead Category Name'] if r['Lead Category Name'] else '@name:lead-category:Others')
    if cat not in LCAT: rep['lead category matched by name or put under Others'] += 1
    first = (r['Lead Sub-Category Name'] or '').split(',')[0].strip()
    subleg = SUBS.get(LCAT_ID.get(cat, ''), {}).get(key(first)) or SUB_ANY.get(key(first)) or (norm(r['Lead Sub-Category ID']) if r['Lead Sub-Category ID'] else '')
    if not subleg: rep['lead without sub-category'] += 1
    lead = {'id': L, 'date': d, 'received_time': (r['Lead Timestamp'][11:16] if len(r['Lead Timestamp']) > 15 else ''), 'createdAt': created, 'updatedAt': iso(r['Last Update Timestamp']) or created,
            'fy': (no.split('/')[0] if '/' in no else f), 'seq': int(re.sub(r'\D', '', no.split('/')[-1]) or 0), 'lead_no': no if '/' in no else f + '/' + no, 'firm_id': '@ref:firm:' + (r['Firm Name'] or 'Umang Communications Pvt Ltd'),
            'customer_id': customer(r), 'lead_category_id': catref, 'lead_subcategory_id': '@ref:lead-subcategory:' + subleg if subleg else '', 'lead_source_id': '@ref:lead-sources:' + norm(r['Lead Source ID']) if r['Lead Source ID'] else '',
            'owner_id': U(r['Lead Owner ID']), 'assigned_to': U(r['Lead Assigned To ID']), 'assigned_at': created if r['Lead Assigned To ID'] else '', 'priority': r['Lead Priority Name'] if r['Lead Priority Name'] in ('Urgent', 'High', 'Medium', 'Low') else '',
            'estimate': num(r['Estimate Value']), 'remarks': ' | '.join(x for x in [r['Lead Remarks'], r['Overall Lead Remarks']] if x),
            'wo_no': r['Work Order No.'], 'wo_date': day(r['Work Order Date']), 'wo_amount': num(r['Work Order Amount']), 'wo_file': fileobj(r['Client Work Order File']),
            'legacy': {'id': lid, 'no': no, 'status': r['Status'], 'lead_status': r['Lead Status'], 'project': r['Project']}, 'status': 'Canceled' if canceled else 'Completed' if completed else 'In Progress'}
    if canceled:
        lead.update({'cancel_reason': r['Cancel Remark'] or 'Canceled in AppSheet', 'cancel_reason_id': '@name:lost-reasons:Other', 'canceled_at': day(r['Cancel Date']) or d, 'canceled_time': iso(r['Cancel Timestamp']), 'canceled_by': U(r['Cancel By Id'])})
    if completed: lead['completed_at'] = day(r['Client Approval Date']) or day(r['Quotation Sent On']) or d
    fu = None
    if r['Follow-up Date'] or r['Next Follow Up Date']:
        fu = {'status': 'Follow Up Again' if r['Next Follow Up Date'] else 'Pending Follow Up', 'date': day(r['Follow-up Date']), 'next_date': day(r['Next Follow Up Date']), 'remarks': r['Follow-up Remarks'], 'by': U(r['Follow-up By ID']), 'auto': False}
    elif lead['status'] == 'In Progress' and lead['assigned_to']: fu = {'status': 'Pending Follow Up', 'date': '', 'next_date': '', 'remarks': '1st Follow-up', 'by': '', 'auto': True}
    if fu:
        lead['last_fu'] = fu; rows.setdefault('leads/%s/followups' % L, []).append(dict(fu, id=nid('lfu', lid), createdAt=iso(r['Follow-up Timestamp']) or created))
    rows['leads'].append(lead); rep['leads'] += 1
    # quotation
    qno = norm(r['Quotation Number'])
    if not (r['Quotation Assigned To ID'] or qno): continue
    Q = nid('quotations', lid); qd = day(r['Quotation Preparation Date']) or day(r['Quotation Assignment Date']) or d
    sent = day(r['Quotation Sent On']); st = r['Client Quotation Approval Status']
    if st == 'Approved': status = 'Approved'
    elif st == 'Rejected': status = 'Rejected'
    elif sent: status = 'Rejected' if canceled else 'Pending Approval'
    elif canceled: status = 'Canceled'
    elif r['Check Status'] == 'Ok': status = 'Pending Sending'
    elif qno: status = 'Pending Checking'
    else: status = 'Pending Prepare Quotation'
    amt = num(r['Quotation Amount'])
    q = {'id': Q, 'lead_id': L, 'lead_no': lead['lead_no'], 'firm_id': lead['firm_id'], 'customer_id': lead['customer_id'], 'sales_person': lead['owner_id'], 'mode': 'upload', 'items': [],
         'no': qno, 'fy': fy(qd), 'seq': int(qno) if qno.isdigit() else 0, 'date': qd, 'expiry': qd, 'subtotal': amt, 'discount': 0, 'gst': 0, 'round_off': 0, 'total': amt, 'amount_note': 'Amount from the old sheet (GST not split)',
         'assigned_to': U(r['Quotation Assigned To ID']), 'assigned_date': day(r['Quotation Assignment Date']), 'assigned_at': iso(r['Quotation Assignment Timestamp']), 'made_by': U(r['Quotation Assigned To ID']),
         'prepared_at': iso(r['Quotation Preparation Timestamp']), 'prepared_by': U(r['Quotation Assigned To ID']) if qno else '',
         'file': fileobj(r['Quotation File'], r['Quotation Drive Link']), 'status': status, 'createdAt': iso(r['Quotation Assignment Timestamp']) or created, 'updatedAt': lead['updatedAt'], 'legacy': {'lead_id': lid, 'no': qno}}
    if r['Check Status'] == 'Ok' or r['Quotation Check Date']: q['checked'] = {'by': U(r['Quotation Checked By ID']), 'date': day(r['Quotation Check Date']), 'at': iso(r['Quotation Check Timestamp']), 'remarks': r['Quotation Check Remarks']}
    if sent: q['sent'] = {'date': sent, 'at': iso(r['Quotation Sent Timestamp']), 'mode': '', 'by': U(r['Quotation Sent By ID']), 'proof': None, 'remarks': ''}
    if status == 'Approved': q.update({'approved_at': day(r['Client Approval Date']) or sent, 'approved_time': iso(r['Client Approval Timestamp']), 'approved_by': U(r['Quotation Sent By ID'])})
    if status == 'Rejected': q.update({'rejected_at': day(r['Client Approval Date']) or lead.get('canceled_at') or sent, 'reject_reason': r['Client Feedback on Quotation'] or lead.get('cancel_reason', ''), 'reject_reason_id': '@name:lost-reasons:Other'})
    if status == 'Pending Approval' and sent and sent < (dt.date(2026, 11, 14) - dt.timedelta(days=90)).isoformat(): q['review_old'] = True; rep['quotations pending > 90 days (review list)'] += 1
    if not q['file']: rep['quotations without a file'] += 1
    rows['quotations'].append(q); rep['quotations: ' + status] += 1
    if sent: rows['quote_followups'].append({'id': nid('qfu-sent', lid), 'quotation_id': Q, 'lead_id': L, 'date': sent, 'by': q['sent']['by'], 'status': 'Quotation Sent', 'mode': '', 'next_date': '', 'remarks': '', 'createdAt': q['sent']['at'] or created})
    if status in ('Approved', 'Rejected') and st: rows['quote_followups'].append({'id': nid('qfu-dec', lid), 'quotation_id': Q, 'lead_id': L, 'date': q.get('approved_at') or q.get('rejected_at') or '', 'by': U(r['Quotation Sent By ID']), 'status': 'Quotation ' + status, 'next_date': '', 'remarks': r['Client Feedback on Quotation'], 'createdAt': iso(r['Client Approval Timestamp']) or created})
pkg = {'kind': 'umang-data-import', 'phase': '1-leads', 'built': dt.datetime.now().isoformat(timespec='seconds'), 'clear': ['leads', 'leads/%/followups', 'quotations', 'quote_followups'], 'rows': rows}
json.dump(pkg, open(O + '/data-1-leads.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print({k if not k.startswith('leads/') else k: len(v) for k, v in rows.items() if not k.startswith('leads/')}, 'followup paths', sum(1 for k in rows if k.startswith('leads/')))
for k, v in sorted(rep.items()): print(' ', k, v)
print('size KB', os.path.getsize(O + '/data-1-leads.json') // 1024)
