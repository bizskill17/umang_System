"""WhatsApp messaging against an isolated SQLite store and a fake MessageAutoSender; never sends real messages."""
import json, os, shutil, socket, subprocess, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from backend_test import Client
ROOT = Path(__file__).resolve().parents[1]
SENT = []

class Fake(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        SENT.append({'auth': self.headers.get('Authorization'), 'body': body})
        fail = 'FAILGROUP' in json.dumps(body)
        self.send_response(400 if fail else 200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'success': not fail}).encode())
    def log_message(self, *a): pass

def free():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

def main():
    fport = free(); fake = HTTPServer(('127.0.0.1', fport), Fake); threading.Thread(target=fake.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix='umang-msg-') as tmp:
        root = Path(tmp); web = root/'public_html'; web.mkdir(); (root/'config').mkdir(); shutil.copytree(ROOT/'api', web/'api')
        cfg = {'driver': 'sqlite', 'host': 'localhost', 'database': 'umang_test', 'username': 't', 'password': 'REPLACE_UNUSED', 'admin_username': 'admin', 'admin_password': 'Integration-only-password-123!'}
        (root/'config/database.php').write_text('<?php return json_decode(' + repr(json.dumps(cfg)) + ',true);')
        port = free()
        with open(root/'server.log', 'wb') as log:
            proc = subprocess.Popen([os.environ.get('UMANG_PHP', 'php'), '-S', f'127.0.0.1:{port}', '-t', str(web)], stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.2): break
                    except OSError: time.sleep(.05)
                c = Client(f'http://127.0.0.1:{port}/api/index.php'); c.login()
                put = lambda p, i, d, s=200: c.call('set', {'path': p, 'id': i, 'data': d}, expected=s)
                upd = lambda p, i, d, s=200: c.call('update', {'path': p, 'id': i, 'data': d}, expected=s)
                msg = lambda cmd, s=200, **kw: c.call('msg', dict(cmd=cmd, **kw), expected=s)
                st = msg('status'); assert st['connected'] is False and len(st['events']) == 38
                msg('account', 400, username='')
                msg('account', username='umang', password='secret-pass', country_code='91')
                assert msg('status')['connected'] is True and 'password' not in json.dumps(msg('status'))
                acc = json.loads((root/'config/umang-whatsapp.json').read_text()); acc['api_url'] = f'http://127.0.0.1:{fport}/'; (root/'config/umang-whatsapp.json').write_text(json.dumps(acc))
                # Masters and settings
                put('masters/customers/rows', 'c1', {'name': 'Acme Retail', 'state_id': 's', 'city_id': 'x', 'category_id': 'cc', 'subcategory_ids': ['cs'], 'mobile': '9876543210'}, 400)  # validation still on
                for p, i, d in [('masters/state/rows', 's1', {'name': 'Assam'}), ('masters/city/rows', 'ci1', {'name': 'Guwahati', 'state_id': 's1'}), ('masters/customer-category/rows', 'cc1', {'name': 'Retail'}), ('masters/customer-subcategory/rows', 'cs1', {'name': 'Shop'})]: put(p, i, d)
                put('masters/customers/rows', 'c1', {'name': 'Acme Retail', 'state_id': 's1', 'city_id': 'ci1', 'category_id': 'cc1', 'subcategory_ids': ['cs1'], 'mobile': '9876543210'})
                put('masters/lead-category/rows', 'lc1', {'name': 'Signage'}); put('masters/lost-reasons/rows', 'lr1', {'name': 'Price too high'})
                import hashlib
                salt = '0123456789abcdef0123456789abcdef'
                put('masters/users/rows', 'u1', {'name': 'Ravi Kumar', 'email': 'r@example.invalid', 'mobile': '9123456780', 'pw_salt': salt, 'pw_hash': hashlib.pbkdf2_hmac('sha256', b'Password12345', salt.encode(), 120000).hex(), 'allowed_views': ['leads.master']})
                groups = [{'key': 'g1', 'name': 'Sales', 'gid': '120363000000001@g.us', 'active': True}, {'key': 'g2', 'name': 'Director', 'gid': '120363FAILGROUP@g.us', 'active': True}]
                ev = {'new_lead': {'on': True, 'groups': ['g1']}, 'lead_assigned': {'on': True, 'groups': ['g1'], 'person': True}, 'estimate_updated': {'on': False, 'groups': ['g1']},
                      'lead_canceled': {'on': True, 'groups': ['g2']}, 'q_prepare': {'on': True, 'groups': ['g1'], 'time': '00:00', 'days': [1, 2, 3, 4, 5, 6, 7]}}
                put('app_settings', 'ms', {'key': 'messaging', 'groups': groups, 'events': ev, 'quiet': {'off': True}})
                SENT.clear()
                # Instant: new lead with an assignee → New Lead to group, Lead Assigned to group and to Ravi's own number
                put('leads', 'l1', {'lead_no': '26-27/1', 'date': '2026-11-13', 'customer_id': 'c1', 'lead_category_id': 'lc1', 'owner_id': 'u1', 'assigned_to': 'u1', 'estimate': 125000, 'status': 'In Progress'})
                time.sleep(.3)
                texts = [s['body'].get('message', [''])[0] for s in SENT]
                assert len(SENT) == 3, SENT
                assert any('*New Lead*' in t and '*Customer:* Acme Retail' in t and '₹1,25,000' not in t and '₹125,000' in t for t in texts), texts
                assert sum('*Lead Assigned*' in t for t in texts) == 2
                assert any(s['body'].get('receiverMobileNo') == '9123456780' for s in SENT)
                assert all(s['auth'].startswith('Basic ') for s in SENT)
                # Estimate change is switched off → nothing sent
                SENT.clear(); upd('leads', 'l1', {'estimate': 150000}); time.sleep(.2); assert SENT == [], SENT
                put('quotations', 'q1', {'status': 'Pending Prepare Quotation', 'lead_id': 'l1', 'customer_id': 'c1', 'assigned_to': 'u1', 'assigned_date': '2026-11-12'})
                # A failing group is retried and then marked failed, with the reason kept
                upd('leads', 'l1', {'status': 'Canceled', 'cancel_reason_id': 'lr1', 'cancel_reason': 'Budget cut', 'canceled_at': '2026-11-13'})
                for _ in range(3): c.call('msgtick&x=' + str(time.time())); (root/'config/umang-whatsapp.tick').unlink(missing_ok=True); time.sleep(.1)
                log = msg('log')['rows']
                cancel = [r for r in log if r['event'] == 'lead_canceled'][0]
                assert cancel['status'] == 'failed' and cancel['attempts'] == 3 and 'HTTP 400' in cancel['response'], cancel
                assert 'Price too high – Budget cut' in cancel['text']
                # Resend puts it back in the queue
                r = msg('resend', id=cancel['id']); assert r['doc']['attempts'] >= 1
                # Daily summary ran once from the scheduler, and not again the same day
                qp = [r for r in log if r['event'] == 'q_prepare']
                assert len(qp) == 1 and qp[0]['status'] == 'sent' and 'Acme Retail - (Assign Dt: *12/11/2026*)' in qp[0]['text'], qp
                (root/'config/umang-whatsapp.tick').unlink(missing_ok=True)
                assert c.call('msgtick')['ran'] == []
                (root/'config/umang-whatsapp.tick').unlink(missing_ok=True)
                anon = Client(c.base); assert anon.call('msgtick')['ok'] is True  # the scheduler needs no sign-in
                anon.call('msg', {'cmd': 'status'}, expected=403)
                assert '*Quotations to Prepare*' in msg('preview', event='q_prepare')['text']
                # Test message, log, and protections
                assert msg('test', to='120363000000001@g.us', type='group')['ok']
                msg('test', 502, to='120363FAILGROUP@g.us', type='group')
                put('message_log', 'x', {'status': 'sent'}, 400)
                emp = Client(c.base); emp.login('Ravi Kumar', 'Password12345'); emp.call('msg', {'cmd': 'status'}, expected=403)
                # A user with the Admin role, or given the Message Settings view, can open and edit it
                put('masters/user-roles/rows', 'ra', {'name': 'Admin'})
                put('masters/users/rows', 'u2', {'name': 'Priya Admin', 'email': 'p@example.invalid', 'role_id': 'ra', 'pw_salt': salt, 'pw_hash': hashlib.pbkdf2_hmac('sha256', b'Password12345', salt.encode(), 120000).hex(), 'allowed_views': ['leads.master']})
                adm = Client(c.base); adm.login('Priya Admin', 'Password12345'); assert adm.call('msg', {'cmd': 'status'})['can_account'] is True
                put('masters/users/rows', 'u3', {'name': 'Setter', 'email': 's@example.invalid', 'pw_salt': salt, 'pw_hash': hashlib.pbkdf2_hmac('sha256', b'Password12345', salt.encode(), 120000).hex(), 'allowed_views': ['masters.message-settings']})
                st3 = Client(c.base); st3.login('Setter', 'Password12345'); r3 = st3.call('msg', {'cmd': 'status'}); assert r3['can_account'] is False
                st3.call('msg', {'cmd': 'account', 'username': 'x', 'password': 'y'}, expected=403)
                st3.call('update', {'path': 'app_settings', 'id': 'ms', 'data': {'quiet': {'off': True}}})
                assert 'secret-pass' not in json.dumps(msg('log'))
                # Attachments: complaint photo goes as a signed link that works without signing in; jobs route by department
                import base64, urllib.request, urllib.error
                photo = c.upload(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4o0AAAAASUVORK5CYII='), 'issue.png', 'image/png')
                groups.append({'key': 'g3', 'name': 'Printing', 'gid': '120363PRINT@g.us', 'active': True})
                ev.update({'complaint_assigned': {'on': True, 'groups': ['g1'], 'person': True, 'attach': 'all'}, 'job_created': {'on': True, 'groups': ['g1']}, 'job_printing': {'on': True, 'groups': ['g3']}, 'job_laser': {'on': True, 'groups': ['g3']}})
                upd('app_settings', 'ms', {'groups': groups, 'events': ev})
                put('projects', 'p1', {'no': '26-27/9', 'customer_id': 'c1', 'controller': 'u1', 'status': 'In Progress', 'date': '2026-11-10'})
                put('complaints', 'cp1', {'no': 'CMP-1', 'project_id': 'p1', 'customer_id': 'c1', 'details': 'Light not working', 'docs': [{'id': photo['id'], 'name': 'issue.png', 'type': 'image/png'}], 'status': 'New'})
                SENT.clear(); upd('complaints', 'cp1', {'assigned_to': 'u1', 'status': 'Assigned', 'assigned_at': '2026-11-13'}); time.sleep(.3)
                ca = [x for x in SENT if '*Complaint Assign*' in x['body']['message'][0]]
                assert len(ca) == 2 and all('filePathUrl' in x['body'] for x in ca), SENT
                link = ca[0]['body']['filePathUrl'][0]; assert 'action=pubfile' in link
                local = f'http://127.0.0.1:{port}/api/index.php?' + link.split('?', 1)[1]
                assert urllib.request.urlopen(local, timeout=10).read()[:4] == b'\x89PNG'
                try: urllib.request.urlopen(local.replace('sig=', 'sig=0'), timeout=10); raise AssertionError('tampered link worked')
                except urllib.error.HTTPError as e: assert e.code == 404
                SENT.clear(); put('jobs', 'j1', {'no': '26-27 - 1', 'project_id': 'p1', 'customer_id': 'c1', 'date': '2026-11-13', 'items': [{'lid': 'L1', 'description': 'Glow sign', 'qty': 2, 'steps': ['Printing']}]}); time.sleep(.3)
                to = sorted((x['body'].get('recipientIds') or [x['body'].get('receiverMobileNo')])[0] for x in SENT)
                assert to == ['120363000000001@g.us', '120363PRINT@g.us', '9123456780'], to
                assert '*Job Created*' in SENT[0]['body']['message'][0] and 'Glow sign × 2 (Printing)' in SENT[0]['body']['message'][0]
                print('Messaging backend passed: account kept private, instant group and personal messages, switched-off events, retries and failure log, resend, daily summary once per day, test sends, write protection.')
            finally:
                proc.terminate(); proc.wait(5); fake.shutdown()
                if proc.returncode not in (0, -15, None): print((root/'server.log').read_text()[-3000:])

if __name__ == '__main__': main()
