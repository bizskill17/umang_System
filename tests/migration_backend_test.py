"""Master Data Migration against an isolated SQLite store: backup, clear, import, kept users and firms, rollback on bad input."""
import json, os, shutil, socket, subprocess, tempfile, time, hashlib
from pathlib import Path
from backend_test import Client
ROOT = Path(__file__).resolve().parents[1]
def free():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def main():
    with tempfile.TemporaryDirectory(prefix='umang-mig-') as tmp:
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
                mig = lambda s=200, **kw: c.call('migrate', kw, expected=s)
                salt = '0123456789abcdef0123456789abcdef'; pw = hashlib.pbkdf2_hmac('sha256', b'Password12345', salt.encode(), 120000).hex()
                put('masters/firm/rows', 'f1', {'name': 'Umang Communications Pvt Ltd', 'short_name': 'UMANG', 'terms_conditions': 'Keep me', 'gst': ''})
                put('masters/users/rows', 'u1', {'name': 'Amit Jain', 'email': 'amit@example.invalid', 'pw_salt': salt, 'pw_hash': pw, 'allowed_views': ['leads.master']})
                put('masters/users/rows', 'u2', {'name': 'Old Person', 'email': 'old@example.invalid', 'pw_salt': salt, 'pw_hash': pw})
                put('masters/vendors/rows', 'v-old', {'name': 'Old Vendor'}); put('masters/uom/rows', 'n1', {'name': 'Nos'})
                st = mig(cmd='status'); assert st['masters']['vendors'] == 1 and st['masters']['users'] == 2, st
                bk = mig(cmd='backup'); assert bk['kind'] == 'umang-master-backup' and len(bk['masters']['masters/users/rows']) == 2
                pkg = {'kind': 'umang-master-import', 'clear': ['state', 'users', 'vendors', 'customers'], 'keep_users': ['Pankaj Jain', 'Amit Jain'], 'rows': {
                    'state': [{'id': 'st1', 'name': 'Assam', 'legacy_ids': ['Assam'], 'status': 'Active'}],
                    'firm': [{'id': 'fx', 'name': 'Umang Communications Pvt Ltd', 'gst': '18AABCU2874Q1ZL', 'short_name': 'UC', 'legacy_ids': ['dfgdfg', 'UC']}],
                    'users': [{'id': 'ux1', 'name': 'Amit Jain', 'email': 'amit@umang.example', 'mobile': '9864081643', 'keep_existing': True, 'legacy_ids': ['Amit Jain']},
                              {'id': 'ux2', 'name': 'Rinki', 'email': 'amit@example.invalid', 'mobile': '7086055009', 'legacy_ids': ['Rinki']}],
                    'vendors': [{'id': 'vx1', 'name': 'Graphic India', 'category': 'Recce', 'legacy_ids': ['9b93ec22']}],
                    'customers': [{'id': 'cx1', 'name': 'SBI', 'incomplete': ['mobile'], 'legacy_ids': ['6686deb2', 'dup1']}]}}
                mig(400, cmd='import', pkg=pkg, clear=True, confirm='no')       # must type CLEAR
                mig(400, cmd='import', pkg=dict(pkg, clear=['firm']), clear=True, confirm='CLEAR')  # firms are never cleared
                r = mig(cmd='import', pkg=pkg, clear=True, confirm='CLEAR')['result']
                assert r['cleared']['users'] == 1 and r['cleared']['vendors'] == 1 and r['added']['customers'] == 1 and r['kept']['users'] == 1 and r['kept']['firm'] == 1, r
                st = mig(cmd='status')['masters']; assert st['users'] == 2 and st['vendors'] == 1 and st['uom'] == 1 and st['firm'] == 1 and st['customers'] == 1, st
                f = c.call('get', {'path': 'masters/firm/rows', 'id': 'f1'})['data']; assert f['terms_conditions'] == 'Keep me' and f['short_name'] == 'UMANG' and f['gst'] == '18AABCU2874Q1ZL' and 'dfgdfg' in f['legacy_ids'], f
                a = c.call('get', {'path': 'masters/users/rows', 'id': 'u1'})['data']; assert a['email'] == 'amit@example.invalid' and a['mobile'] == '9864081643' and a['has_password'] and a['allowed_views'] == ['leads.master'], a
                rk = c.call('get', {'path': 'masters/users/rows', 'id': 'ux2'})['data']; assert rk['email'] == '' and not rk['has_password'], rk   # email of a kept account is not reused
                assert c.call('get', {'path': 'masters/users/rows', 'id': 'u2'})['exists'] is False
                cu = c.call('get', {'path': 'masters/customers/rows', 'id': 'cx1'})['data']; assert cu['legacy_ids'] == ['6686deb2', 'dup1'] and cu['incomplete'] == ['mobile']
                # Run again without clearing: same IDs are updated, not duplicated.
                mig(cmd='import', pkg=pkg, clear=False); assert mig(cmd='status')['masters']['customers'] == 1
                print('Master migration checks passed: backup, CLEAR confirmation, kept firm and users, cleared masters, re-run without duplicates.')
            finally:
                proc.terminate(); proc.wait(5)
main()
