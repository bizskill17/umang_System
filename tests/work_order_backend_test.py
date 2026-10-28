"""Isolated vendor finance tests. No production credentials or data are used."""
import os,json,tempfile,shutil,socket,subprocess,time,uuid,concurrent.futures
from pathlib import Path
from backend_test import Client,ADMIN_PASSWORD
ROOT=Path(__file__).resolve().parents[1]
def main():
 with tempfile.TemporaryDirectory(prefix='umang-work-order-') as tmp:
  root=Path(tmp);web=root/'public_html';web.mkdir();(root/'config').mkdir();shutil.copytree(ROOT/'api',web/'api')
  config={'driver':'sqlite','host':'localhost','database':'umang_test','username':'test','password':'REPLACE_UNUSED','admin_username':'admin','admin_password':ADMIN_PASSWORD}
  (root/'config/database.php').write_text('<?php return json_decode('+repr(json.dumps(config))+',true);')
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  env=dict(os.environ,PHP_CLI_SERVER_WORKERS='4')
  with open(root/'php.log','wb') as log:
   server=subprocess.Popen([os.environ.get('UMANG_PHP','php'),'-S',f'127.0.0.1:{port}','-t',str(web)],stdout=log,stderr=log,env=env,start_new_session=True)
   try:
    for _ in range(100):
     try:
      with socket.create_connection(('127.0.0.1',port),timeout=.2):break
     except OSError:time.sleep(.05)
    c=Client(f'http://127.0.0.1:{port}/api/index.php');c.login()
    def put(path,id,data):return c.call('set',{'path':path,'id':id,'data':data})
    def rows(path):return [dict(r['data'],id=r['id']) for r in c.call('list&path='+path)['docs']]
    def command(cmd,data=None,status=200,request=None,client=None):
     return (client or c).call('workorder',dict(dict(command=cmd,vendor_id='v1',firm_id='f1',date='2026-10-28',request_id=request or uuid.uuid4().hex),**(data or {})),expected=status)
    for v in ['v1','v2']:put('masters/vendors/rows',v,{'name':v,'status':'Active'})
    for f in ['f1','f2']:put('masters/firm/rows',f,{'name':f,'status':'Active'})
    put('projects','p1',{'no':'P1','firm_id':'f1','customer_id':'c1','status':'In Progress'})
    for i in range(1,10):put('designs','d'+str(i),{'no':'D'+str(i),'project_id':'p1','vendor_id':'v1','count':1,'status':'In Progress','date':'2026-10-28','due':'2026-11-01'})
    def order(ids,rate='100',**extra):return dict(lines=[dict(kind='designs',source_id=i,rate=rate,gst_pct='0') for i in ids],status='Issued',tax_mode='None',round_off='0',**extra)
    w1=command('save_order',order(['d1','d2']))['id'];w2=command('save_order',order(['d3'],'300'))['id']
    assert rows('work_orders')[0]['no'].startswith('WO-26/27-')
    command('save_order',order(['d1']),400)
    command('save_order',dict(order(['d4']),tax_mode='None',lines=[dict(kind='designs',source_id='d4',rate='100',gst_pct='18')]),400)
    tax=command('save_order',dict(order(['d4']),tax_mode='CGST/SGST',lines=[dict(kind='designs',source_id='d4',rate='100',gst_pct='18')]))['id']
    assert next(w for w in rows('work_orders') if w['id']==tax)['total_cents']==11800
    unpriced=command('save_order',order(['d5'],''))['id']
    req=uuid.uuid4().hex;payload=dict(amount='250',mode='UPI',account='Bank',reference='P1',allocations=[dict(work_order_id=w1,amount='100')])
    p1=command('payment',payload,request=req)['id'];assert command('payment',payload,request=req)['id']==p1
    assert len(rows('vendor_payments'))==1
    command('payment',dict(payload,amount='251'),400,request=req)
    command('allocate',{'allocations':[dict(payment_id=p1,work_order_id=unpriced,amount='1')]},400)
    command('allocate',{'allocations':[dict(payment_id=p1,work_order_id=w1,amount='101')]},400)
    command('allocate',{'allocations':[dict(payment_id=p1,work_order_id=w2,amount='151')]},400)
    command('allocate',{'allocations':[dict(payment_id=p1,work_order_id=w1,amount='100'),dict(payment_id=p1,work_order_id=w2,amount='50')]})
    total=rows('finance_events')[-1] # Verify actual sums, independent of random event ID ordering.
    active=[a for a in rows('vendor_allocations') if a['status']=='Active'];assert sum(a['amount_cents'] for a in active if a['work_order_id']==w1)==20000
    # Excess payment: allocate only the remaining due, leaving an available advance.
    p2=command('payment',dict(amount='400',mode='Bank Transfer',account='Bank',allocations=[dict(work_order_id=w2,amount='250')]))['id']
    r=command('refund',dict(payment_id=p2,amount='20',reference='REF',account='Bank'))['id']
    command('refund',dict(payment_id=p2,amount='131'),400)
    command('reverse_payment',dict(id=p2,reason='Correction'),400)
    command('reverse_refund',dict(id=r,reason='Refund corrected'))
    command('save_order',order(['d1','d2'],'50',id=w1),400)
    command('save_order',dict(order(['d1','d2'],'50',id=w1),release_surplus=True))
    assert len([v for v in rows('work_order_versions') if v['work_order_id']==w1])==2
    assert sum(a['amount_cents'] for a in rows('vendor_allocations') if a['status']=='Active' and a['work_order_id']==w1)==10000
    command('cancel_order',dict(id=w1,reason='Scope cancelled'))
    assert not [a for a in rows('vendor_allocations') if a['status']=='Active' and a['work_order_id']==w1]
    command('reverse_payment',dict(id=p2,reason='Wrong transaction'))
    assert next(p for p in rows('vendor_payments') if p['id']==p2)['status']=='Reversed'
    # Reassignment creates a new vendor-specific obligation without changing the original document.
    c.call('update',{'path':'designs','id':'d3','data':{'vendor_id':'v2'}})
    alt=dict(order(['d3']),vendor_id='v2');command('save_order',alt)
    command('save_order',dict(order(['d6']),firm_id='f2'),400)
    # Direct mutations cannot bypass the financial transaction engine.
    c.call('update',{'path':'vendor_payments','id':p1,'data':{'amount_cents':999999}},expected=403)
    c.call('delete',{'path':'work_orders','id':w2},expected=403)
    put('projects','p2',{'no':'P2','firm_id':'f1','status':'In Progress','outsource':'Yes','outsource_to':'','vendor_id':'v1'})
    command('save_order',dict(order(['d9']),lines=[dict(kind='projects',source_id='p2',rate='50',gst_pct='0')]))
    # Document preparation permission does not grant cash/payment permission.
    import hashlib
    salt='0123456789abcdef0123456789abcdef';pw='WorkOrderEmployee123'
    put('masters/users/rows','wo-employee',{'name':'WO Employee','email':'wo@example.invalid','pw_salt':salt,'pw_hash':hashlib.pbkdf2_hmac('sha256',pw.encode(),salt.encode(),120000).hex(),'allowed_views':['outsource.work-orders']})
    employee=Client(c.base);employee.login('WO Employee',pw)
    command('save_order',order(['d8']),client=employee)
    command('payment',dict(amount='5',mode='Cash',account='Cash'),403,client=employee)
    # Concurrent allocations from different sessions cannot spend the same advance twice.
    race_order=command('save_order',order(['d7'],'100'))['id'];race_payment=command('payment',dict(amount='30',mode='Cash',account='Cash'))['id']
    clients=[Client(c.base),Client(c.base)]
    for client in clients:client.login()
    def race(client):
     data=dict(command='allocate',vendor_id='v1',firm_id='f1',date='2026-10-28',request_id=uuid.uuid4().hex,allocations=[dict(payment_id=race_payment,work_order_id=race_order,amount='20')])
     try:client.call('workorder',data);return True
     except AssertionError as e:
      assert 'insufficient available advance' in str(e),str(e);return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(race,clients))
    assert sum(results)==1,results
    assert sum(a['amount_cents'] for a in rows('vendor_allocations') if a['payment_id']==race_payment and a['status']=='Active')==2000
    print('Work Order backend passed: combined tasks, GST, unpriced orders, duplicate prevention, idempotency, part/excess payments, advances, refunds, revisions, cancellations, scope validation and concurrent allocations.')
   finally:
    import signal
    os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10)
if __name__=='__main__':main()
