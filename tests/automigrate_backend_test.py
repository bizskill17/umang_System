"""One-time automatic master migration: public key, sealed file, backup in the private folder, runs only once."""
import json, os, shutil, socket, subprocess, tempfile, time, gzip, base64, urllib.request, urllib.error
from pathlib import Path
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from backend_test import Client
ROOT = Path(__file__).resolve().parents[1]
def free():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def seal(pem, data):
    pub = serialization.load_pem_public_key(pem.encode()); key = os.urandom(32); iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, gzip.compress(json.dumps(data).encode()), None)
    b = lambda x: base64.b64encode(x).decode()
    return {'v': 1, 'key': b(pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA1()), algorithm=hashes.SHA1(), label=None))), 'iv': b(iv), 'tag': b(ct[-16:]), 'data': b(ct[:-16])}
def main():
    with tempfile.TemporaryDirectory(prefix='umang-auto-') as tmp:
        root = Path(tmp); web = root/'public_html'; web.mkdir(); (root/'config').mkdir(); shutil.copytree(ROOT/'api', web/'api')
        for f in (web/'api/migration').glob('*.enc'): f.unlink()  # sealed files for the live server only
        cfg = {'driver': 'sqlite', 'host': 'localhost', 'database': 'umang_test', 'username': 't', 'password': 'REPLACE_UNUSED', 'admin_username': 'admin', 'admin_password': 'Integration-only-password-123!'}
        (root/'config/database.php').write_text('<?php return json_decode(' + repr(json.dumps(cfg)) + ',true);')
        port = free(); base = f'http://127.0.0.1:{port}/api/index.php'
        proc = subprocess.Popen([os.environ.get('UMANG_PHP', 'php'), '-S', f'127.0.0.1:{port}', '-t', str(web)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.2): break
                except OSError: time.sleep(.05)
            def get(a):
                try: return json.loads(urllib.request.urlopen(base + '?action=' + a).read())
                except urllib.error.HTTPError as e: raise AssertionError((a, e.code, e.read()[:400]))
            c = Client(base); c.login()
            c.call('set', {'path': 'masters/vendors/rows', 'id': 'v-old', 'data': {'name': 'Old Vendor'}})
            assert get('automigrate')['done'] is False
            pem = get('migkey')['public_key']; assert 'BEGIN PUBLIC KEY' in pem and get('migkey')['public_key'] == pem
            assert (root/'config/umang-migrate-key.pem').exists() and oct((root/'config/umang-migrate-key.pem').stat().st_mode)[-3:] == '600'
            pkg = {'kind': 'umang-master-import', 'clear': ['vendors'], 'keep_users': [], 'rows': {'vendors': [{'id': 'vx', 'name': 'Graphic India', 'legacy_ids': ['9b93ec22'], 'status': 'Active'}]}}
            (web/'api/migration').mkdir(exist_ok=True); (web/'api/migration/masters.enc').write_text(json.dumps(seal(pem, pkg)))
            r = get('automigrate'); rr = r['runs']['masters']['result']; assert rr['cleared']['vendors'] == 1 and rr['added']['vendors'] == 1, r
            assert list((root/'config').glob('umang-masters-backup-*.json'))
            assert get('automigrate')['already'] is True     # never runs twice
            # Records step: test records cleared, master links looked up from old sheet IDs and names, runs once.
            vendor_pkg = {'kind': 'umang-master-import', 'clear': [], 'keep_users': [], 'rows': {'users': [{'id': 'u9', 'name': 'Ankit Jain', 'email': '', 'legacy_ids': ['125a2868']}]}}
            c.call('migrate', {'cmd': 'import', 'pkg': vendor_pkg, 'clear': False})
            c.call('set', {'path': 'leads', 'id': 'test1', 'data': {'lead_no': 'T1'}})
            data = {'kind': 'umang-data-import', 'phase': '1-leads', 'clear': ['leads', 'leads/%/followups', 'quotations'], 'rows': {
                'leads': [{'id': 'L1', 'lead_no': '25-26/1', 'owner_id': '@ref:users:Ankit Jain', 'assigned_to': '@ref:users:125a2868', 'vendor': '@ref:vendors:9b93ec22', 'x': '@ref:users:gone'}],
                'leads/L1/followups': [{'id': 'F1', 'status': 'Pending Follow Up', 'by': '@name:users:ankit jain'}],
                'quotations': [{'id': 'Q1', 'lead_id': 'L1', 'no': '0127', 'mode': 'upload'}]}}
            (web/'api/migration/data-1-leads.enc').write_text(json.dumps(seal(pem, data)))
            r = get('automigrate')['runs']['1-leads']['result']
            assert r['cleared']['leads'] == 1 and r['added'] == {'leads': 1, 'lead followups': 1, 'quotations': 1} and r['unresolved'] == {'users:gone': 1}, r
            l = c.call('get', {'path': 'leads', 'id': 'L1'})['data']; assert l['owner_id'] == 'u9' and l['assigned_to'] == 'u9' and l['vendor'] == 'vx' and l['x'] == '', l
            assert c.call('get', {'path': 'leads/L1/followups', 'id': 'F1'})['data']['by'] == 'u9'
            assert c.call('get', {'path': 'leads', 'id': 'test1'})['exists'] is False
            assert list((root/'config').glob('umang-data-backup-1-leads-*.json'))
            assert get('automigrate')['runs']['1-leads']['already'] is True
            st = c.call('migrate', {'cmd': 'status'}); assert st['masters']['vendors'] == 1 and st['auto']['result']['added']['vendors'] == 1
            # A records step may add a new person, but never changes someone who is already there.
            c.call('migrate', {'cmd': 'import', 'pkg': {'kind': 'umang-master-import', 'clear': [], 'keep_users': [], 'rows': {'users': [{'id': 'u7', 'name': 'Old Person', 'email': 'old@x.in', 'legacy_ids': ['o7']}]}}, 'clear': False})
            up = {'kind': 'umang-data-import', 'phase': '2-sync', 'clear': [], 'rows': {'masters/users/rows': [{'id': 'u8', 'name': 'New Person', 'email': 'new@x.in', 'legacy_ids': ['n8'], 'pw_hash': 'x'}, {'id': 'u7b', 'name': 'Someone', 'email': 'old@x.in', 'legacy_ids': ['o7']}], 'leads': [{'id': 'L3', 'lead_no': '25-26/3', 'owner_id': '@ref:users:n8'}]}}
            (web/'api/migration/data-2-sync.enc').write_text(json.dumps(seal(pem, up)))
            r = get('automigrate')['runs']['2-sync']['result']; assert r['skipped'] == {'masters/users/rows': 1} and r['unresolved'] == [], r
            nu = c.call('get', {'path': 'masters/users/rows', 'id': 'u8'})['data']; assert nu['name'] == 'New Person' and 'pw_hash' not in nu and not nu.get('has_password'), nu
            assert c.call('get', {'path': 'leads', 'id': 'L3'})['data']['owner_id'] == 'u8' and c.call('get', {'path': 'masters/users/rows', 'id': 'u7b'})['exists'] is False
            c.call('delete', {'path': 'leads', 'id': 'L3'})
            # Changed-rows sync: a device with a token gets only the records saved since; without one, the full list.
            b1 = c.call('batch&paths=leads,quotations'); assert set(b1['lists']) == {'leads', 'quotations'} and len(b1['lists']['leads']) == 1, b1
            vv = lambda b: ','.join(b['vers'][p] for p in ['leads', 'quotations'])
            b2 = c.call('batch&paths=leads,quotations&vers=' + vv(b1)); assert not b2['lists'] and not b2['delta'], b2
            c.call('set', {'path': 'leads', 'id': 'L2', 'data': {'lead_no': '25-26/2'}})
            b3 = c.call('batch&paths=leads,quotations&vers=' + vv(b2)); assert not b3['lists'] and list(b3['delta']) == ['leads'], b3
            assert [r['id'] for r in b3['delta']['leads']['rows']] == ['L2'] and b3['delta']['leads']['del'] == [], b3
            c.call('delete', {'path': 'leads', 'id': 'L2'})
            b4 = c.call('batch&paths=leads,quotations&vers=' + vv(b3)); assert b4['delta']['leads'] == {'rows': [], 'del': ['L2']}, b4
            b5 = c.call('batch&paths=leads,quotations&vers=v:0,' + b4['vers']['quotations']); assert list(b5['lists']) == ['leads'], b5  # wrong shape: full list
            b6 = c.call('batch&paths=leads&vers=m:999999999'); assert list(b6['lists']) == ['leads'], b6  # ahead of the server: full list
            print('Automatic migration checks passed: key kept private, sealed file, backup saved, runs once, changed-only sync.')
        finally: proc.terminate(); proc.wait(5)
main()
