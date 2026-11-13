"""One-time automatic master migration: public key, sealed file, backup in the private folder, runs only once."""
import json, os, shutil, socket, subprocess, tempfile, time, gzip, base64, urllib.request
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
        cfg = {'driver': 'sqlite', 'host': 'localhost', 'database': 'umang_test', 'username': 't', 'password': 'REPLACE_UNUSED', 'admin_username': 'admin', 'admin_password': 'Integration-only-password-123!'}
        (root/'config/database.php').write_text('<?php return json_decode(' + repr(json.dumps(cfg)) + ',true);')
        port = free(); base = f'http://127.0.0.1:{port}/api/index.php'
        proc = subprocess.Popen([os.environ.get('UMANG_PHP', 'php'), '-S', f'127.0.0.1:{port}', '-t', str(web)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.2): break
                except OSError: time.sleep(.05)
            get = lambda a: json.loads(urllib.request.urlopen(base + '?action=' + a).read())
            c = Client(base); c.login()
            c.call('set', {'path': 'masters/vendors/rows', 'id': 'v-old', 'data': {'name': 'Old Vendor'}})
            assert get('automigrate') == {'done': False, 'waiting': 'No migration file on the server.'}
            pem = get('migkey')['public_key']; assert 'BEGIN PUBLIC KEY' in pem and get('migkey')['public_key'] == pem
            assert (root/'config/umang-migrate-key.pem').exists() and oct((root/'config/umang-migrate-key.pem').stat().st_mode)[-3:] == '600'
            pkg = {'kind': 'umang-master-import', 'clear': ['vendors'], 'keep_users': [], 'rows': {'vendors': [{'id': 'vx', 'name': 'Graphic India', 'legacy_ids': ['9b93ec22'], 'status': 'Active'}]}}
            (web/'api/migration').mkdir(exist_ok=True); (web/'api/migration/masters.enc').write_text(json.dumps(seal(pem, pkg)))
            r = get('automigrate'); assert r['done'] and r['run']['result']['cleared']['vendors'] == 1 and r['run']['result']['added']['vendors'] == 1, r
            assert list((root/'config').glob('umang-masters-backup-*.json'))
            assert get('automigrate')['already'] is True     # never runs twice
            st = c.call('migrate', {'cmd': 'status'}); assert st['masters']['vendors'] == 1 and st['auto']['result']['added']['vendors'] == 1
            print('Automatic migration checks passed: key kept private, sealed file, backup saved, runs once.')
        finally: proc.terminate(); proc.wait(5)
main()
