"""Operational validation against an isolated SQLite store; never accesses production."""
import json, os, shutil, socket, subprocess, tempfile, time
from pathlib import Path
from backend_test import Client, ADMIN_PASSWORD
ROOT=Path(__file__).resolve().parents[1]

def main():
    with tempfile.TemporaryDirectory(prefix='umang-operations-') as tmp:
        root=Path(tmp); web=root/'public_html';web.mkdir();(root/'config').mkdir();shutil.copytree(ROOT/'api',web/'api')
        config={'driver':'sqlite','host':'localhost','database':'umang_test','username':'test','password':'REPLACE_UNUSED','admin_username':'admin','admin_password':ADMIN_PASSWORD}
        (root/'config/database.php').write_text('<?php return json_decode('+repr(json.dumps(config))+',true);')
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        with open(root/'server.log','wb') as log:
            proc=subprocess.Popen([os.environ.get('UMANG_PHP','php'),'-S',f'127.0.0.1:{port}','-t',str(web)],stdout=log,stderr=log)
            try:
                for _ in range(100):
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                    except OSError:time.sleep(.05)
                c=Client(f'http://127.0.0.1:{port}/api/index.php');c.login()
                def put(path,id,data,status=200):return c.call('set',{'path':path,'id':id,'data':data},expected=status)
                def update(path,id,data,status=200):return c.call('update',{'path':path,'id':id,'data':data},expected=status)
                def delete(path,id,status=200):return c.call('delete',{'path':path,'id':id},expected=status)
                put('masters/state/rows','s1',{'name':'Assam'})
                put('masters/city/rows','city1',{'name':'Guwahati','state_id':'s1'})
                put('masters/customer-category/rows','cc1',{'name':'Retail'})
                put('masters/customer-subcategory/rows','cs1',{'name':'Shop'})
                customer={'name':'Acme','state_id':'s1','city_id':'city1','category_id':'cc1','subcategory_ids':['cs1'],'mobile':'9876543210'}
                for k in ['name','category_id','subcategory_ids','city_id','mobile']:
                    bad=dict(customer);bad.pop(k);put('masters/customers/rows','bad',bad,400)
                put('masters/customers/rows','c1',customer)
                delete('masters/city/rows','city1',400)
                put('masters/items/rows','unused',{'name':'Unused'});delete('masters/items/rows','unused')
                put('masters/uom/rows','fixed',{'name':'Foot','protected':True});delete('masters/uom/rows','fixed',400)
                put('leads','l1',{'customer_id':'c1','firm_id':'f1','owner_id':'u1'})
                put('leads/l1/followups','bad',{'status':'Follow Up Again','remarks':''},400)
                put('leads/l1/followups','ok',{'status':'Follow Up Again','remarks':'Call tomorrow'})
                put('quote_followups','bad',{'status':'Quotation Rejected','remarks':''},400)
                put('quotations','q1',{'status':'Pending Sending','lead_id':'l1','customer_id':'c1'})
                update('quotations','q1',{'status':'Pending Approval'},400)
                update('quotations','q1',{'sent':{'proof':{'id':'fake'}}},400)
                import base64
                photo=c.upload(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4o0AAAAASUVORK5CYII='),'screen.png','image/png')
                proof={'id':photo['id'],'type':photo['contentType'],'name':'screen.png'}
                update('quotations','q1',{'status':'Pending Approval','sent':{'proof':proof}})
                put('quote_followups','sent',{'status':'Quotation Sent','doc':proof})
                put('designs','d1',{'source_locked':True,'lead_id':'l1','customer_id':'wrong'})
                assert c.call('get&path=designs&id=d1')['data']['customer_id']=='c1'
                update('designs','d1',{'lead_id':'other'},400)
                update('designs','d1',{'source_locked':False,'customer_id':'other'},400)
                update('quotations','q1',{'status':'Approved'})
                put('projects','p1',{'quotation_id':'q1','status':'In Progress'})
                put('projects','p2',{'quotation_id':'q1','status':'In Progress'},400)
                # The quotations team creates projects without Projects department access.
                import hashlib
                salt='0123456789abcdef0123456789abcdef';password='EmployeePassword123'
                user={'name':'Quotation Team','email':'q@example.invalid','pw_salt':salt,'pw_hash':hashlib.pbkdf2_hmac('sha256',password.encode(),salt.encode(),120000).hex(),'allowed_views':['quotations.pending-create']}
                put('masters/users/rows','quser',user)
                put('quotations','q2',{'status':'Approved','customer_id':'c1'})
                employee=Client(c.base);employee.login('Quotation Team',password)
                employee.call('set',{'path':'projects','id':'p3','data':{'quotation_id':'q2','status':'In Progress'}})
                print('Operational backend checks passed: required fields, references, protected masters, follow-up remarks, real screenshot proof, inherited locks, duplicate prevention and quotation-team access.')
            finally:proc.terminate();proc.wait(timeout=10)
if __name__=='__main__':main()
