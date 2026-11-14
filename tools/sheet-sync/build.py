# Builds the cleaned master import file from the sheet exports (read-only).
import openpyxl, re, json, hashlib, collections, sys, os
D = os.path.dirname(os.path.abspath(__file__)); S = os.environ.get('SRC', D + '/src/'); O = os.environ.get('OUT', D)
def tab(f, name):
    ws = openpyxl.load_workbook(S + f, read_only=True, data_only=True)[name]
    rows = [[('' if c is None else str(c).strip()) for c in r] for r in ws.iter_rows(values_only=True)]
    h = rows[0]; out = []
    for r in rows[1:]:
        r = r + [''] * (len(h) - len(r))
        if any(r): out.append(dict(zip(h, r)))
    return out
def nid(coll, legacy): return hashlib.sha1((coll + '|' + legacy).encode()).hexdigest()[:24]
def key(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def title(s): s = re.sub(r'\s+', ' ', s or '').strip(); return s
FAKE = re.compile(r'^(\d)\1+$')
def mob(s):
    m = re.sub(r'\D', '', s or '')
    if len(m) == 12 and m.startswith('91'): m = m[2:]
    if len(m) == 11 and m.startswith('0'): m = m[1:]
    return m if len(m) == 10 and not FAKE.match(m) and m[0] in '6789' else ''
EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[a-z]{2,}$', re.I)
def mail(s): s = (s or '').strip().lower(); return s if EMAIL.match(s) and s not in ('xyz@gmail.com', 'lol@gmail.com') else ''
out = collections.OrderedDict(); review = collections.defaultdict(list)
def add(coll, legacy, body, aliases=()):
    body = dict(body); body['legacy_ids'] = sorted(set([legacy] + [a for a in aliases if a]))
    body.setdefault('status', 'Active'); i = nid(coll, legacy); out.setdefault(coll, []).append(dict(body, id=i)); return i

# ---------- States ----------
STATE_FIX = {'assam': 'Assam', 'assamin': 'Assam', 'assaam': 'Assam', 'bengal': 'West Bengal', 'westbengal': 'West Bengal', 'mumbai': 'Maharashtra',
  'imphal': 'Manipur', 'chennai': 'Tamil Nadu', 'meghalaya': 'Meghalaya', 'gujrat': 'Gujarat', 'tripura': 'Tripura', 'hariyana': 'Haryana'}
def state_name(s):
    k = key(s); return STATE_FIX.get(k, title(s)) if k else ''
states = {}  # key -> id
def state_id(name, legacy=None):
    n = state_name(name)
    if not n or key(n) in ('elloramam', 'eloramam'): return ''
    k = key(n)
    if k not in states:
        states[k] = add('state', 'S:' + n, {'name': n}); review['States'].append([legacy or '', name, n, 'created'])
    elif legacy: review['States'].append([legacy, name, n, 'merged' if name != n else 'kept'])
    return states[k]
for r in tab('customers.xlsx', 'States'): state_id(r['State Name'], r['State ID'])

# ---------- Cities ----------
CITY_STATE = {'tezpur': 'Assam', 'kharupetia': 'Assam', 'jagiroad': 'Assam', 'dhuva': 'Assam', 'delhi': 'Delhi', 'hariyana': 'Haryana', 'bengaluru': 'Karnataka', 'ghaziabad': 'Uttar Pradesh',
  'meghalaya': 'Meghalaya', 'dimapur': 'Nagaland', 'shillong': 'Meghalaya', 'tinsukia': 'Assam', 'agartala': 'Tripura', 'arunachalpradesh': 'Arunachal Pradesh', 'pasighat': 'Arunachal Pradesh',
  'tamilnadu': 'Tamil Nadu', 'manipur': 'Manipur', 'westbengal': 'West Bengal', 'mumbai': 'Maharashtra'}
NOT_CITY = {'assam', 'northeast', 'nothEast'.lower(), 'uppereassam', 'upperassam', 'lowerassam', 'westbengal', 'arunachalpradesh', 'uttarpradesh', 'meghalaya', 'mizoram', 'tamilnadu', 'manipur', 'hariyana', 'bhutan'}
cities = {}; city_of_legacy = {}; city_state_of = {}
for r in tab('customers.xlsx', 'Cities'):
    nm = title(r['City Name']); lid = r['City ID']
    if not nm: review['Cities'].append([lid, '', '', '', 'skipped: no name']); continue
    st = r.get('State Name') or r.get('State ID') or ''
    if key(st) in ('', ) or (re.fullmatch(r'[0-9a-f]{8}', st or '') ): st = r.get('State Name', '') or ''
    if r.get('State ID') == '0f528c28': st = r.get('State Name') or 'Assam'
    st = state_name(st) or CITY_STATE.get(key(nm), '')
    if key(nm) in CITY_STATE and key(nm) in NOT_CITY: st = CITY_STATE[key(nm)]
    sid = state_id(st) if st else ''
    k = (key(nm), sid)
    note = 'review: region/state name, not a city' if key(nm) in NOT_CITY or ',' in nm or '&' in nm else ''
    if not sid: note = (note + '; ' if note else '') + 'no state'
    if k in cities:
        city_of_legacy[lid] = cities[k]; review['Cities'].append([lid, nm, st, '', 'merged with same city']); continue
    cid = add('city', lid, {'name': nm, 'state_id': sid}); cities[k] = cid; city_of_legacy[lid] = cid; city_state_of[cid] = sid
    review['Cities'].append([lid, nm, st, cid, note or 'imported'])
# aliases on merged rows
def push_alias(coll, rid, legacy):
    for b in out.get(coll, []):
        if b['id'] == rid and legacy not in b['legacy_ids']: b['legacy_ids'].append(legacy)
for lid, cid in city_of_legacy.items(): push_alias('city', cid, lid)

# ---------- simple name masters ----------
def simple(coll, rows, idk, nk, label, fix=None):
    m = {}; seen = {}
    for r in rows:
        lid = r.get(idk, ''); nm = title(r.get(nk, ''))
        if fix: nm = fix(nm)
        if not nm: review[label].append([lid, '', '', 'skipped: no name']); continue
        k = key(nm)
        if k in seen: m[lid] = seen[k]; push_alias(coll, seen[k], lid); review[label].append([lid, nm, seen[k], 'merged (same name)']); continue
        seen[k] = m[lid] = add(coll, lid or 'N:' + nm, {'name': nm}); review[label].append([lid, nm, m[lid], 'imported'])
    return m, seen
ccat, _ = simple('customer-category', tab('customers.xlsx', 'Customer Categories'), 'Category ID', 'Category Name', 'Customer Categories')
csub, csub_by_name = simple('customer-subcategory', tab('customers.xlsx', 'Customer Sub Categories'), 'Sub-Category ID', 'Sub-Category Name', 'Customer Sub-Categories')
desig, desig_by_name = simple('designation', tab('users.xlsx', 'Designations'), 'Designation ID', 'Name', 'Designations',
    fix=lambda n: {'purchasedepaartment': 'Purchase Department', 'designer': 'Designer'}.get(key(n), n))
lcat, lcat_by_name = simple('lead-category', tab('leads.xlsx', 'Lead Categories'), 'Lead Category ID', 'Lead Category Name', 'Lead Categories')
lsrc, _ = simple('lead-sources', tab('leads.xlsx', 'Lead Sources'), 'Lead Source ID', 'Lead Source Name', 'Lead Sources')

# lead sub-categories need a category
others = None; lsub = {}; seen = {}
for r in tab('leads.xlsx', 'Lead Sub Categories'):
    lid = r['Lead Sub-Category ID']; nm = title(r['Lead Sub-Category Name'])
    if not nm: review['Lead Sub-Categories'].append([lid, '', '', '', 'skipped: no name']); continue
    cid = lcat.get(r['Lead Category ID']) or lcat_by_name.get(key(r['Lead Category Name']))
    note = 'imported'
    if not cid:
        if not others: others = add('lead-category', 'N:Others', {'name': 'Others'}); review['Lead Categories'].append(['', 'Others', others, 'created for sub-categories without a category'])
        cid = others; note = 'no category in sheet: put under Others'
    k = (key(nm), cid)
    if k in seen: lsub[lid] = seen[k]; push_alias('lead-subcategory', seen[k], lid); review['Lead Sub-Categories'].append([lid, nm, r['Lead Category Name'], seen[k], 'merged (same name and category)']); continue
    seen[k] = lsub[lid] = add('lead-subcategory', lid, {'name': nm, 'lead_category_id': cid}); review['Lead Sub-Categories'].append([lid, nm, r['Lead Category Name'], lsub[lid], note])

# ---------- Firms (matched by name in the app, never deleted) ----------
for r in tab('leads.xlsx', 'Firm Name'):
    i = add('firm', r['Firm Id'], {'name': r['Firm Name'], 'cin': r['CIN'], 'gst': r['GST'], 'address': r['Address'], 'short_name': r['Firm'].replace(' ', '')}, aliases=[r['Firm'], r['Firm Name']])
    review['Firms'].append([r['Firm Id'], r['Firm Name'], r['Firm'], 'matched to the app firm by name; logo, terms and bank details kept'])

# ---------- Users ----------
KEEP = ['Pankaj Jain', 'Amit Jain']
users = {}; used_mail = set(); seen_u = {}
for r in tab('users.xlsx', 'Users'):
    lid = r['User ID']; nm = title(r['User Name'])
    if not nm: continue
    ph = mob(r['Phone']); em = mail(r['Email']); notes = []
    if r['Phone'] and not ph: notes.append('phone "%s" cleared (not a valid mobile)' % r['Phone'])
    if em and em in used_mail: notes.append('email %s already used by another user: left blank' % em); em = ''
    if r['Email'] and not mail(r['Email']): notes.append('email "%s" cleared (not valid)' % r['Email'])
    if em: used_mail.add(em)
    k = key(nm) + '|' + ph
    if k in seen_u: users[lid] = seen_u[k]; push_alias('users', seen_u[k], lid); review['Users'].append([lid, nm, ph, em, '', 'merged (same name and phone)']); continue
    dn = desig.get(r['Designation ID']) or desig_by_name.get(key({'designer': 'Designer'}.get(key(r['Designation Name']), r['Designation Name']))) or ''
    body = {'name': nm, 'email': em, 'mobile': ph, 'designation_id': dn}
    if nm in KEEP: body['keep_existing'] = True; notes.append('kept: matched to the existing app user, password and permissions unchanged')
    seen_u[k] = users[lid] = add('users', lid, body); review['Users'].append([lid, nm, ph, em, (r['Designation Name'] or ''), '; '.join(notes) or 'imported'])
# possible duplicates for review
byname = collections.defaultdict(list)
for b in out['users']: byname[key(b['name'])[:6]].append(b['name'])
for r in tab('users.xlsx', 'Users'): pass
# drivers
DRV = {'Niren': 'NIREN SAIKIA', 'Karim Ali': 'Karim Ali'}
for d in ['ABC', 'Niren', 'Ganesh', 'Karim Ali']:
    if d == 'ABC': review['Users'].append(['Driver Master', d, '', '', 'Driver', 'skipped: test row']); continue
    match = next((b for b in out['users'] if key(b['name']) == key(DRV.get(d, d))), None)
    if match: match['legacy_ids'].append('DRIVER:' + d); review['Users'].append(['Driver Master', d, '', '', 'Driver', 'matched to user ' + match['name']])
    else:
        dr = desig_by_name.get('driver', ''); add('users', 'DRIVER:' + d, {'name': d, 'email': '', 'mobile': '', 'designation_id': dr}); review['Users'].append(['Driver Master', d, '', '', 'Driver', 'added as a user'])

# ---------- Vendors ----------
seen_v = {}
for r in tab('vendors.xlsx', 'Vendor Master'):
    lid = r['Vendor ID']; nm = title(r['Vendor Name'])
    if not nm: continue
    ph = mob(r['Contact Number']); em = mail(r['Email']); notes = []
    if r['Contact Number'] and not ph: notes.append('phone "%s" cleared' % r['Contact Number'])
    if r['Email'] and not em: notes.append('email "%s" cleared' % r['Email'])
    k = key(nm)
    if k in seen_v: push_alias('vendors', seen_v[k], lid); review['Vendors'].append([lid, nm, r['Category'], ph, em, 'merged (same name)']); continue
    seen_v[k] = add('vendors', lid, {'name': nm, 'category': title(r['Category']), 'mobile': ph, 'email': em, 'contact_person': '', 'gstin': '', 'address': ''})
    review['Vendors'].append([lid, nm, r['Category'], ph, em, '; '.join(notes) or 'imported'])

# ---------- Machines, vehicles ----------
MACH = [('jdgfb','Machine 1','Print'),('aeij','Channel Bending Alluminium','Laser'),('rsdsd','CNC Machine','CNC Cutting'),('sdzxc','Fabrication Department','Fabrication'),('8058d6b6','Plotter Machine',''),('39e6497d','FLATBED UV',''),('3deffa84','UV ROLL TO ROLL',''),('f2c4d7c0','SS LETTER BENDING',''),('83307e5b','SS LETTER WELDING',''),('2e3694a0','ECO Solvent S9130',''),('b096e3f4','Metal Fibre Laser','Laser'),('2d45949e','Plotter Cut Graphtec',''),('f0b9a1cd','Laser 4 Ft (Mini)','Laser'),('77037177','Laser 8 Ft','Laser'),('f10874d6','Acrylic Bending',''),('ddd875bb','Solvent 1',''),('46d5d56b','Solvent 5121 PL30',''),('0a0afa90','Laser Marking',''),('6e22feed','MUG PRINT MACHINE','Print'),('6b217180','TSHIRT PRINT','Print'),('157bd469','Inhouse Installation','Fabrication'),('33219392','Goods Sales','Fabrication'),('0fc4b926','EVENT WORK','Fabrication')]
GUESS = {'Plotter Machine':'Printing','FLATBED UV':'Printing','UV ROLL TO ROLL':'Printing','SS LETTER BENDING':'Fabrication','SS LETTER WELDING':'Fabrication','ECO Solvent S9130':'Printing','Plotter Cut Graphtec':'Cutting','Acrylic Bending':'Fabrication','Solvent 1':'Printing','Solvent 5121 PL30':'Printing','Laser Marking':'Laser'}
TYPE = {'Print':'Printing','Laser':'Laser','CNC Cutting':'Cutting','Fabrication':'Fabrication'}
for lid, nm, t in MACH:
    st = TYPE.get(t) or GUESS[nm]; add('machines', lid, {'name': nm, 'job_step': st}); review['Machines'].append([lid, nm, t, st, 'imported' if t else 'type guessed: please check'])
add('vehicles', 'AS01KC3309', {'name': 'AS01KC3309'}); review['Vehicles'].append(['AS01KC3309', 'AS01KC3309', 'imported'])

# ---------- Customers ----------
dept = collections.defaultdict(list)
for r in tab('customers.xlsx', 'Department'): dept[r['Customer ID']].append(title(r['Department']))
seen_c = {}; ccount = collections.Counter()
for r in tab('customers.xlsx', 'Customers'):
    lid = r['Customer ID']; nm = title(r['Customer Name'])
    if not nm or not lid: ccount['skipped: blank name or ID'] += 1; continue
    if key(nm) in ('dummy', 'sample'): ccount['skipped: test row'] += 1; review['Customers'].append([lid, nm, '', '', '', '', 'skipped: test row']); continue
    k = (key(nm), key(r['Address']), key(r['GSTIN/UIN']))
    if k in seen_c: push_alias('customers', seen_c[k], lid); ccount['merged into an exact duplicate'] += 1; review['Customers'].append([lid, nm, r['Address'][:60], r['GSTIN/UIN'], '', '', 'merged (same name, address and GSTIN)']); continue
    cid = city_of_legacy.get(r['City ID']) or ''
    sid = city_state_of.get(cid, '') or state_id(r['State Name']) if (cid or r['State Name']) else ''
    if cid and city_state_of.get(cid): sid = city_state_of[cid]
    cat = ccat.get(r['Category ID']) or ''
    sub = csub.get(r['Sub-Category ID']) or csub_by_name.get(key(r['Sub-Category Name'])) or ''
    ph = mob(r['Contact Number'])
    contacts = []
    if r['Contact Person'] and key(r['Contact Person']) not in ('na', 'n/a'): contacts.append({'name': title(r['Contact Person']), 'mobile': ph, 'email': mail(r['Email ID']), 'designation_id': ''})
    for dp in dept.get(lid, []): contacts.append({'name': 'Department: ' + dp, 'mobile': '', 'email': '', 'designation_id': ''})
    gst = re.sub(r'\s', '', r['GSTIN/UIN']).upper(); pan = re.sub(r'\s', '', r['PAN/IT No.']).upper()
    body = {'name': nm, 'category_id': cat, 'subcategory_ids': [sub] if sub else [], 'address': r['Address'], 'state_id': sid, 'city_id': cid,
            'gstin_uin': gst if re.fullmatch(r'[0-9A-Z]{15}', gst) else '', 'pan_no': pan if re.fullmatch(r'[A-Z]{5}[0-9]{4}[A-Z]', pan) else '',
            'mobile': ph, 'email_id': mail(r['Email ID']), 'contacts': contacts}
    miss = [lbl for lbl, ok in [('mobile', ph), ('category', cat), ('sub-category', sub), ('city', cid)] if not ok]
    if miss: body['incomplete'] = miss
    seen_c[k] = add('customers', lid, body); ccount['imported' + (' (incomplete)' if miss else '')] += 1
    review['Customers'].append([lid, nm, r['Address'][:60], r['GSTIN/UIN'], r['Contact Number'], ', '.join(miss), 'imported' + (' - missing ' + ', '.join(miss) if miss else '')])

CLEAR = ['state', 'city', 'customer-category', 'customer-subcategory', 'designation', 'users', 'vendors', 'lead-category', 'lead-subcategory', 'lead-sources', 'machines', 'vehicles', 'customers']
pkg = {'kind': 'umang-master-import', 'version': 1, 'built': __import__('datetime').datetime.now().isoformat(timespec='seconds'), 'clear': CLEAR, 'keep_users': KEEP, 'match_by_name': ['firm'], 'rows': out}
json.dump(pkg, open(O + '/umang-masters-import.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(review, open(O + '/review.json', 'w'), ensure_ascii=False)
print({k: len(v) for k, v in out.items()}); print(dict(ccount))
print('incomplete customers', sum(1 for c in out['customers'] if c.get('incomplete')))
print('size KB', os.path.getsize(O + '/umang-masters-import.json') // 1024)
