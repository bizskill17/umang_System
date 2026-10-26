"""Integration tests against a disposable MySQL database and local PHP server.
Run in CI; never point this suite at production (it deletes its own test tables).
"""
import base64
import concurrent.futures
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ADMIN_PASSWORD = 'Integration-only-password-123!'

class Client:
    def __init__(self, base):
        self.base = base
        self.csrf = ''
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self, action, payload=None, expected=200, raw=None, content_type=None, token=True):
        from urllib.parse import urlencode
        url = self.base + '?action=' + action
        headers = {}
        data = None
        if payload is not None or raw is not None:
            data = raw if raw is not None else json.dumps(payload).encode()
            headers['Content-Type'] = content_type or 'application/json'
            if token: headers['X-CSRF-Token'] = self.csrf
        request = urllib.request.Request(url, data=data, headers=headers)
        try: response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error: response = error
        body = response.read()
        assert response.status == expected, (action, response.status, expected, body[:200])
        if action.startswith('blob') and expected == 200: return body
        value = json.loads(body)
        if 'csrf' in value: self.csrf = value['csrf']
        return value
    def login(self, username='admin', password=ADMIN_PASSWORD):
        self.call('session')
        return self.call('login', {'username': username, 'password': password})
    def upload(self, data, name='test.pdf', mime='application/pdf', expected=200):
        boundary = 'UmangTestBoundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="view"\r\n\r\nprojects.master\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        return self.call('upload', raw=body, content_type='multipart/form-data; boundary='+boundary, expected=expected)


def main(driver='mysql'):
    assert os.environ.get('UMANG_TEST_DB_NAME') == 'umang_test', 'Use only the disposable umang_test database.'
    with tempfile.TemporaryDirectory(prefix='umang-api-test-') as tmp:
        root = Path(tmp); web = root/'public_html'; web.mkdir(); (root/'config').mkdir()
        shutil.copytree(ROOT/'api', web/'api')
        config = {'host': os.environ.get('UMANG_TEST_DB_HOST','127.0.0.1'), 'port': int(os.environ.get('UMANG_TEST_DB_PORT','3306')), 'database': 'umang_test', 'username': os.environ.get('UMANG_TEST_DB_USER','root'), 'password': os.environ['UMANG_TEST_DB_PASSWORD'], 'admin_username':'admin', 'admin_password': ADMIN_PASSWORD, 'driver': driver}
        config_path = root/'config/database.php'
        config_path.write_text('<?php return json_decode('+repr(json.dumps(config))+', true);')
        # Clean only fixed application tables in the explicitly named test database.
        cleanup = '$c=require $argv[1]; $d=new PDO("mysql:host=".$c["host"].";port=".$c["port"].";dbname=umang_test",$c["username"],$c["password"]); foreach(["umang_documents","umang_leases","umang_files","umang_login_limits"] as $t) $d->exec("DROP TABLE IF EXISTS ".$t);'
        subprocess.run(['php','-r',cleanup,str(config_path)],check=True)
        if driver=='sqlite':
            # Existing MySQL data is copied into the SQLite file on first use.
            seed = '$c=require $argv[1]; $d=new PDO("mysql:host=".$c["host"].";port=".$c["port"].";dbname=umang_test",$c["username"],$c["password"]); $d->exec("CREATE TABLE umang_documents (collection_path VARCHAR(191) NOT NULL, id VARCHAR(96) NOT NULL, body LONGTEXT NOT NULL, PRIMARY KEY(collection_path,id))"); $d->prepare("INSERT INTO umang_documents VALUES (?,?,?)")->execute(["leads","migrated",json_encode(["name"=>"From MySQL"])]);'
            subprocess.run(['php','-r',seed,str(config_path)],check=True)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        with open(root/'php.log','wb') as log:
            server = subprocess.Popen(['php','-d','upload_max_filesize=20M','-d','post_max_size=22M','-S',f'127.0.0.1:{port}','-t',str(web)], stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.2): break
                    except OSError: time.sleep(.05)
                base=f'http://127.0.0.1:{port}/api/index.php'
                owner=Client(base)
                # First visit creates a private placeholder folder/file without a database password.
                private = root/'config'
                original_config = config_path.read_bytes()
                private.rename(root/'saved-config')
                created = owner.call('session', expected=503)
                assert created['error']['code'] == 'not_configured'
                assert config_path.is_file()
                assert 'REPLACE_DATABASE_PASSWORD' in config_path.read_text()
                assert config_path.stat().st_mode & 0o777 == 0o600
                assert private.stat().st_mode & 0o777 == 0o700
                shutil.rmtree(private)
                (root/'saved-config').rename(private)
                # Private configuration is required and cannot be fetched from public webroot.
                config_path.rename(config_path.with_suffix('.disabled'))
                missing=owner.call('session',expected=503)
                assert missing['error']['code']=='not_configured'
                assert 'REPLACE_DATABASE_PASSWORD' in config_path.read_text()
                config_path.with_suffix('.disabled').rename(config_path)
                assert owner.call('session')['user'] is None
                owner.call('list&path=leads',expected=401)
                owner.call('set', {'path':'leads','id':'x','data':{}},expected=403,token=False)
                owner.call('login',{'username':'admin','password':'wrong'},expected=401)
                assert owner.login()['user']['owner']
                if driver=='sqlite':
                    moved=owner.call('get&path=leads&id=migrated')
                    assert moved['exists'] and moved['data']['name']=='From MySQL', moved
                    assert (root/'config/umang-data.sqlite').is_file() and (root/'config/umang-migrated').is_file()
                    owner.call('delete',{'path':'leads','id':'migrated'})
                owner.call('set',{'path':'leads','id':'lead1','data':{'name':'उमंग ₹','status':'In Progress'}})
                # One combined read returns several collections and ignores unknown ones.
                owner.call('batch&paths=leads,projects',expected=200)
                both=owner.call('batch&paths=leads,projects,not_a_collection')['lists']
                assert set(both)=={'leads','projects'} and both['leads'][0]['id']=='lead1' and both['projects']==[]
                Client(base).call('batch&paths=leads',expected=401)
                docs=owner.call('list&path=leads')['docs']
                assert docs[0]['data']['name']=='उमंग ₹'
                owner.call('update',{'path':'leads','id':'lead1','data':{'estimate':500}})
                assert owner.call('get&path=leads&id=lead1')['data']['estimate']==500
                owner.call('get&path=../../private&id=x',expected=400)
                owner.call('set&path=leads&id=x',expected=405)
                owner.call('update',{'path':'leads','id':'missing','data':{}},expected=404)
                # Lease ownership and expiry are enforced server-side, including between sessions.
                other=Client(base); other.login()
                assert owner.call('acquire',{'path':'counters','id':'lead-test','holder':'one'})['acquired']
                assert not other.call('acquire',{'path':'counters','id':'lead-test','holder':'two'})['acquired']
                other.call('set',{'path':'counters','id':'lead-test','holder':'two','data':{'next':2}},expected=409)
                owner.call('set',{'path':'counters','id':'lead-test','holder':'one','data':{'next':2}})
                assert other.call('acquire',{'path':'counters','id':'lead-test','holder':'two'})['acquired']
                other.call('set',{'path':'counters','id':'lead-test','holder':'two','data':{'next':3}})
                # Employee accounts use the same PBKDF2 format as the existing user form.
                salt='0123456789abcdef0123456789abcdef'
                digest=hashlib.pbkdf2_hmac('sha256',b'EmployeePassword123',salt.encode(),120000).hex()
                user={'name':'Tester','email':'tester@example.invalid','status':'Active','pw_salt':salt,'pw_hash':digest,'allowed_views':['leads.add']}
                owner.call('set',{'path':'masters/users/rows','id':'tester','data':user})
                visible=owner.call('get&path=masters/users/rows&id=tester')['data']
                assert visible['has_password'] and 'pw_hash' not in visible and 'pw_salt' not in visible
                # Editing an account without a new password preserves the existing password.
                visible['mobile']='1234567890'
                owner.call('set',{'path':'masters/users/rows','id':'tester','data':visible})
                employee=Client(base); employee.login('Tester','EmployeePassword123')
                employee.call('set',{'path':'leads','id':'employee-lead','data':{'name':'Allowed'}})
                employee.call('set',{'path':'projects','id':'blocked','data':{}},expected=403)
                employee.call('set',{'path':'masters/users/rows','id':'tester','data':user},expected=403)
                employee.call('set',{'path':'masters/user-roles/rows','id':'admin','data':{'name':'Admin'}},expected=403)
                assert 'email' not in employee.call('list&path=masters/users/rows')['docs'][0]['data']
                # Content inspection rejects scripts even when the browser claims PDF.
                owner.upload(b'<?php echo "bad"; ?>',expected=400)
                pdf=b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
                file=owner.upload(pdf)
                assert owner.call('blob&id='+file['id'])==pdf
                assert (root/'config/umang-uploads'/file['id']).read_bytes()==pdf
                anonymous=Client(base)
                anonymous.call('blob&id='+file['id'],expected=401)
                # Inactive users lose existing sessions without trusting browser storage.
                owner.call('update',{'path':'masters/users/rows','id':'tester','data':{'status':'Inactive'}})
                employee.call('list&path=leads',expected=401)
                owner.call('delete',{'path':'leads','id':'lead1'})
                assert not owner.call('get&path=leads&id=lead1')['exists']
                assert config_path.read_bytes() == original_config, 'Existing config was overwritten'
                owner.call('logout',{})
                owner.call('list&path=leads',expected=401)
                print('[' + driver + '] Backend integration passed: configuration, login, CSRF, UTF-8 CRUD, permissions, leases, password preservation, upload validation, private downloads and logout.')
            finally:
                server.terminate(); server.wait(timeout=10)

if __name__=='__main__':
    main('mysql')
    main('sqlite')
