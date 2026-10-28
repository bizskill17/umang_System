<?php
/** Atomic vendor work orders and cash allocations. Included after authentication/CSRF checks. */
declare(strict_types=1);
if (!defined('UMANG_VENDOR_FINANCE')) { http_response_code(404); exit; }
function vfRows(string $path): array {
    $out=[]; foreach(query('SELECT id,body FROM umang_documents WHERE collection_path=? ORDER BY id',[$path])->fetchAll(PDO::FETCH_ASSOC) as $r) $out[]=array_merge(json_decode($r['body'],true),['id'=>$r['id']]); return $out;
}
function vfPut(string $path,string $id,array $body): void {
    unset($body['id']); query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)',[$path,$id,json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function vfFail(string $message): never {txRollback();reject($message,400,'validation_failed');}
function vfMoney(mixed $value,bool $signed=false): int {
    $s=trim((string)$value); if(!preg_match($signed?'/^-?\d{1,11}(?:\.\d{1,2})?$/':'/^\d{1,11}(?:\.\d{1,2})?$/',$s)) vfFail('Enter an amount with at most two decimal places.');
    $negative=str_starts_with($s,'-');$a=explode('.',ltrim($s,'-'));$n=(int)$a[0]*100+(int)str_pad($a[1]??'',2,'0'); return $negative?-$n:$n;
}
function vfAttachment(mixed $file): mixed {
    if ($file === null || $file === '') return null;
    if (!is_array($file) || empty($file['id']) || !query('SELECT id FROM umang_files WHERE id=?',[(string)$file['id']])->fetchColumn()) vfFail('Upload a valid supporting document.');
    return $file;
}
function vfDate(mixed $s): string {
    $s=(string)$s;$d=DateTimeImmutable::createFromFormat('!Y-m-d',$s);if(!$d||$d->format('Y-m-d')!==$s)vfFail('Choose a valid date.');return $s;
}
function vfScope(array $r,string $vendor,string $firm): bool {return ($r['vendor_id']??'')===$vendor&&($r['firm_id']??'')===$firm;}
function vfVendor(string $value): string {
    if(document('masters/vendors/rows',$value))return $value;
    $matches=array_values(array_filter(vfRows('masters/vendors/rows'),fn($v)=>strcasecmp(trim($v['name']??''),trim($value))===0));return count($matches)===1?$matches[0]['id']:'';
}
function vfSource(array $ref): array {
    $kind=(string)($ref['kind']??'');$id=(string)($ref['source_id']??'');
    if(!in_array($kind,['recce','designs','job_assign','projects','dispatches'],true))vfFail('Invalid outsourced task.');
    $r=document($kind,$id,true);if(!$r)vfFail('An assigned task no longer exists.');
    $job=$kind==='job_assign'?(document('jobs',(string)($r['job_id']??''))??[]):[];
    $pid=$kind==='projects'?$id:($r['project_id']??$job['project_id']??'');$p=$pid?(document('projects',(string)$pid)??[]):[];
    $leadId=$r['lead_id']??$p['lead_id']??'';$lead=$leadId?(document('leads',(string)$leadId)??[]):[];
    $vendor=vfVendor((string)($kind==='projects'?($r['outsource_to']??$r['vendor_id']??''):($kind==='dispatches'?($r['party']??''):($r['vendor_id']??''))));
    if(!$vendor||($kind==='dispatches'&&($r['mode_type']??'')!=='Outsource'))vfFail('Select a valid vendor on each outsourced task before preparing its Work Order.');
    $item=[];foreach($job['items']??[] as $it)if(($it['lid']??'')===($r['lid']??''))$item=$it;
    $itemMaster=!empty($item['item_id'])?(document('masters/items/rows',(string)$item['item_id'])??[]):[];
    $description=$kind==='job_assign'?trim(($r['stage']??'').' - '.($itemMaster['name']??'').' '.($item['description']??'')):(($r['outsource_job']??'')?:($r['remarks']??''));
    $qty=$kind==='recce'?($r['units']??1):($kind==='designs'?($r['count']??1):($kind==='job_assign'?($r['qty']??1):1));
    if(!is_numeric($qty)||!is_finite((float)$qty)||(float)$qty<=0||(float)$qty>1000000000)vfFail('The task quantity is invalid. Correct the assignment first.');
    $source=['kind'=>$kind,'source_id'=>$id,'vendor_id'=>$vendor,'assignment_key'=>$kind.':'.$id.':'.$vendor,'department'=>['recce'=>'Recce','designs'=>'Design','job_assign'=>$r['stage']??'Production','projects'=>'Project','dispatches'=>'Delivery'][$kind],
      'reference'=>$r['no']??$job['no']??$id,'project_id'=>$pid,'project_no'=>$p['no']??'','customer_id'=>$r['customer_id']??$p['customer_id']??$lead['customer_id']??'',
      'firm_id'=>$r['firm_id']??$p['firm_id']??$lead['firm_id']??'','quantity'=>(float)$qty,'uom'=>$item['uom']??($kind==='recce'?'Sites':($kind==='designs'?'Designs':'Job')),
      'description'=>$description?:['recce'=>'Recce','designs'=>'Design','job_assign'=>'Production','projects'=>'Project','dispatches'=>'Delivery'][$kind].' task','assigned_date'=>$r['date']??'','target'=>$r['target']??$r['due']??$job['target']??'','status'=>$r['status']??(!empty($r['closed'])?'Completed':'In Progress'),'photo'=>$item['photo']??$itemMaster['photo']??$r['doc']??null];
    $signature=$source;unset($signature['status']);$source['fingerprint']=hash('sha256',json_encode($signature));return $source;
}
function vfUsed(string $payment): int {
    $sum=0;foreach(vfRows('vendor_allocations') as $a)if(($a['payment_id']??'')===$payment&&($a['status']??'')==='Active')$sum+=(int)$a['amount_cents'];
    foreach(vfRows('vendor_refunds') as $r)if(($r['payment_id']??'')===$payment&&($r['status']??'')==='Active')$sum+=(int)$r['amount_cents'];return $sum;
}
function vfSettled(string $wo): int {$sum=0;foreach(vfRows('vendor_allocations') as $a)if(($a['work_order_id']??'')===$wo&&($a['status']??'')==='Active')$sum+=(int)$a['amount_cents'];return $sum;}
function vfTotals(string $vendor,string $firm): array {
    $out=0;$advance=0;foreach(vfRows('work_orders') as $w)if(vfScope($w,$vendor,$firm)&&$w['status']==='Issued'&&!$w['value_pending'])$out+=max(0,(int)$w['total_cents']-vfSettled($w['id']));
    foreach(vfRows('vendor_payments') as $p)if(vfScope($p,$vendor,$firm)&&$p['status']==='Active')$advance+=max(0,(int)$p['amount_cents']-vfUsed($p['id']));
    return ['outstanding_cents'=>$out,'advance_cents'=>$advance,'net_cents'=>$out-$advance];
}
function vfAllocate(array $items,string $vendor,string $firm,string $date,string $actor): void {
    if(count($items)>200)vfFail('Too many allocations.');
    foreach($items as $row){$pid=(string)($row['payment_id']??'');$wid=(string)($row['work_order_id']??'');$amount=vfMoney($row['amount']??'');if($amount<=0)vfFail('Allocation must be greater than zero.');
      $p=document('vendor_payments',$pid,true);$w=document('work_orders',$wid,true);
      if(!$p||!$w||!vfScope($p,$vendor,$firm)||!vfScope($w,$vendor,$firm))vfFail('Payments and Work Orders must belong to the same vendor and firm.');
      if($p['status']!=='Active'||$w['status']!=='Issued'||$w['value_pending'])vfFail('Allocate only active payments to issued, fully valued Work Orders.');
      if($amount>(int)$p['amount_cents']-vfUsed($pid))vfFail('This payment has insufficient available advance.');
      if($amount>(int)$w['total_cents']-vfSettled($wid))vfFail('Allocation exceeds the Work Order outstanding. Leave the excess as vendor advance.');
      vfPut('vendor_allocations',bin2hex(random_bytes(16)),['vendor_id'=>$vendor,'firm_id'=>$firm,'payment_id'=>$pid,'work_order_id'=>$wid,'amount_cents'=>$amount,'date'=>$date,'status'=>'Active','createdAt'=>gmdate('c'),'created_by'=>$actor]);
    }
}
function vfRelease(string $wid,string $reason,int $release=PHP_INT_MAX): void {
    foreach(array_reverse(vfRows('vendor_allocations')) as $a){if(($a['work_order_id']??'')!==$wid||$a['status']!=='Active'||$release<=0)continue;$take=min($release,(int)$a['amount_cents']);
      if($take===(int)$a['amount_cents']){$a['status']='Reversed';$a['reversal_reason']=$reason;$a['reversed_at']=gmdate('c');vfPut('vendor_allocations',$a['id'],$a);}
      else {$original=$a;$a['amount_cents']-=$take;vfPut('vendor_allocations',$a['id'],$a);$original['amount_cents']=$take;$original['status']='Reversed';$original['reversal_reason']=$reason;$original['reversed_at']=gmdate('c');$original['split_from']=$a['id'];vfPut('vendor_allocations',bin2hex(random_bytes(16)),$original);}
      $release-=$take;
    }
}
if($action==='workorder'){
    $command=(string)($input['command']??'');$vendor=(string)($input['vendor_id']??'');$firm=(string)($input['firm_id']??'');$request=(string)($input['request_id']??'');
    if(!preg_match('/^[a-zA-Z0-9_-]{16,96}$/',$request))reject('A unique request reference is required.');
    $allowed=$user['allowed_views']??null;$isOrder=in_array($command,['save_order','cancel_order','mark_shared','download'],true);
    $views=$isOrder?['outsource.pending-work-orders','outsource.work-orders','outsource.create-work-order']:['outsource.vendor-payments','outsource.advances','outsource.pending-payments','outsource.vendor-ledger'];
    if(empty($user['owner'])&&is_array($allowed)&&!array_intersect($views,$allowed))reject('You do not have permission for this Work Order or payment action.',403);
    if(!document('masters/vendors/rows',$vendor)||!document('masters/firm/rows',$firm))reject('Choose a valid vendor and issuing firm.');
    txBegin();
    // One scope lock serialises allocation, revision, cancellation and refunds on both storage engines.
    $lock='vendor-finance:'.$vendor;query('INSERT IGNORE INTO umang_leases(lease_key,holder,expires_at) VALUES(?,?,0)',[$lock,'']);query('SELECT holder FROM umang_leases WHERE lease_key=? FOR UPDATE',[$lock])->fetchColumn();
    $requestHash=hash('sha256',json_encode($input));$prior=document('finance_events',$request,true);if($prior){if(!vfScope($prior,$vendor,$firm)||$prior['command']!==$command||($prior['actor']??'')!==$user['id']||($prior['payload_hash']??'')!==$requestHash)vfFail('Request reference already used.');txCommit();reply($prior['result']);}
    $now=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');$actor=(string)$user['id'];$date=vfDate($input['date']??date('Y-m-d'));$id=(string)($input['id']??'');$result=['ok'=>true];$eventAmount=0;
    if($command==='save_order'){
      $old=$id?document('work_orders',$id,true):null;if($id&&!$old)vfFail('Work Order no longer exists.');if($old&&!vfScope($old,$vendor,$firm))vfFail('Vendor and firm cannot be changed on an existing Work Order.');if(($old['status']??'')==='Cancelled')vfFail('A cancelled Work Order cannot be edited.');
      $lines=$input['lines']??[];if(!is_array($lines)||!count($lines)||count($lines)>100)vfFail('Select between 1 and 100 tasks.');
      if(!in_array($input['status']??'Draft',['Draft','Issued'],true))vfFail('Choose Draft or Issued.');$issued=($input['status']??'Draft')==='Issued';if($old&&$old['status']==='Issued'&&!$issued)vfFail('An issued order must be revised, not converted to draft.');
      $seen=[];$tasks=[];$subtotal=0;$gst=0;$pending=false;$taxMode=(string)($input['tax_mode']??'None');if(!in_array($taxMode,['None','CGST/SGST','IGST'],true))vfFail('Choose a valid GST treatment.');
      foreach($lines as $line){if(!is_array($line))vfFail('Invalid task line.');$task=vfSource($line);if($task['vendor_id']!==$vendor)vfFail('All tasks must be assigned to the selected vendor.');if($task['firm_id']&&$task['firm_id']!==$firm)vfFail('Select tasks belonging to the same issuing firm.');if(isset($seen[$task['assignment_key']]))vfFail('A task is selected more than once.');$seen[$task['assignment_key']]=true;
        if($issued){if(($task['status']??'')==='Canceled')vfFail('Cancelled tasks cannot be newly issued.');foreach(vfRows('work_orders') as $other)if($other['id']!==$id&&$other['status']==='Issued')foreach($other['lines'] as $existing)if($existing['assignment_key']===$task['assignment_key'])vfFail('A selected task already belongs to an issued Work Order.');}
        $rate=($line['rate']??'')===''?null:vfMoney($line['rate']);$pct=(string)($line['gst_pct']??'0');if(!is_numeric($pct)||(float)$pct<0||(float)$pct>100||round((float)$pct,2)!=(float)$pct)vfFail('GST percentage must be between 0 and 100, with at most two decimals.');$bp=(int)round((float)$pct*100);if($bp&&$taxMode==='None')vfFail('Choose CGST/SGST or IGST when GST is entered.');
        if($rate!==null&&$task['quantity']*$rate>9999999999999)vfFail('The calculated task amount is too large.');
        $base=$rate===null?null:(int)round($task['quantity']*$rate,0,PHP_ROUND_HALF_UP);$tax=$base===null?null:(int)round($base*$bp/10000,0,PHP_ROUND_HALF_UP);
        if($base===null)$pending=true;else{$subtotal+=$base;$gst+=$tax;}$task['rate_cents']=$rate;$task['gst_bp']=$bp;$task['base_cents']=$base;$task['gst_cents']=$tax;$task['amount_cents']=$base===null?null:$base+$tax;$task['instructions']=trim((string)($line['instructions']??''));$tasks[]=$task;
      }
      $round=vfMoney($input['round_off']??'0',true);$total=$subtotal+$gst+$round;if($total<0)vfFail('Work Order total cannot be negative.');
      if($old&&$old['status']==='Issued'){$settled=vfSettled($id);$surplus=$pending?$settled:max(0,$settled-$total);if($surplus&&!($input['release_surplus']??false))vfFail('This revision releases settled amounts to advance. Confirm the adjustment before saving.');if($surplus)vfRelease($id,'Work Order revision released surplus',$surplus);}
      if(!$id)$id=bin2hex(random_bytes(16));$number=$old['no']??'';$seq=$old['seq']??0;
      if($issued&&!$number){$year=(int)substr($date,0,4);if((int)substr($date,5,2)<4)$year--;$fy=substr((string)$year,-2).'/'.substr((string)($year+1),-2);$key='work-order-'.$year;query('INSERT IGNORE INTO umang_leases(lease_key,holder,expires_at) VALUES(?,?,0)',[$key,'']);query('SELECT holder FROM umang_leases WHERE lease_key=? FOR UPDATE',[$key])->fetchColumn();$counter=document('counters',$key,true)??['next'=>1];$seq=(int)$counter['next'];vfPut('counters',$key,['next'=>$seq+1]);$number='WO-'.$fy.'-'.str_pad((string)$seq,5,'0',STR_PAD_LEFT);}
      $revision=($old&&$old['status']==='Issued')?(int)$old['revision']+1:(int)($old['revision']??0);
      $w=['vendor_id'=>$vendor,'firm_id'=>$firm,'no'=>$number,'seq'=>$seq,'date'=>$date,'due_date'=>empty($input['due_date'])?'':vfDate($input['due_date']),'status'=>$issued?'Issued':'Draft','revision'=>$revision,'lines'=>$tasks,'tax_mode'=>$taxMode,'subtotal_cents'=>$subtotal,'gst_cents'=>$gst,'round_cents'=>$round,'total_cents'=>$total,'value_pending'=>$pending,'terms'=>trim((string)($input['terms']??'')),'delivery_address'=>trim((string)($input['delivery_address']??'')),'bill_reference'=>trim((string)($input['bill_reference']??'')),'bill_document'=>vfAttachment($input['bill_document']??null),'authorised_signatory'=>trim((string)($input['authorised_signatory']??'')),'firm_snapshot'=>document('masters/firm/rows',$firm),'vendor_snapshot'=>document('masters/vendors/rows',$vendor),'prepared_by'=>$user['name']??$actor,'createdAt'=>$old['createdAt']??$now,'updatedAt'=>$now,'created_by'=>$old['created_by']??$actor];
      vfPut('work_orders',$id,$w);if($issued)vfPut('work_order_versions',$id.'-r'.$revision,array_merge($w,['work_order_id'=>$id]));$result['id']=$id;$result['no']=$number;
    }elseif(in_array($command,['cancel_order','mark_shared','download'],true)){
      $w=document('work_orders',$id,true);if(!$w||!vfScope($w,$vendor,$firm))vfFail('Work Order not found for this vendor and firm.');
      if($command==='cancel_order'){if(!trim((string)($input['reason']??'')))vfFail('Enter the cancellation reason.');vfRelease($id,'Work Order cancelled');$w['status']='Cancelled';$w['cancel_reason']=$input['reason'];$w['cancelled_at']=$now;}
      elseif($command==='mark_shared'){if($w['status']!=='Issued')vfFail('Issue the Work Order before marking it shared.');$w['shared_at']=$now;$w['shared_by']=$actor;}else{$w['last_downloaded_at']=$now;$w['download_count']=(int)($w['download_count']??0)+1;}
      vfPut('work_orders',$id,$w);$result['id']=$id;
    }elseif($command==='payment'){
      $amount=vfMoney($input['amount']??'');if($amount<=0)vfFail('Payment amount must be greater than zero.');
      $mode=trim((string)($input['mode']??''));$account=trim((string)($input['account']??''));if(!$mode||!$account)vfFail('Enter the payment mode and bank/cash account.');$id=bin2hex(random_bytes(16));$eventAmount=$amount;
      vfPut('vendor_payments',$id,['vendor_id'=>$vendor,'firm_id'=>$firm,'date'=>$date,'amount_cents'=>$amount,'mode'=>$mode,'account'=>$account,'reference'=>trim((string)($input['reference']??'')),'remarks'=>trim((string)($input['remarks']??'')),'proof'=>vfAttachment($input['proof']??null),'status'=>'Active','createdAt'=>$now,'created_by'=>$actor]);
      $alloc=$input['allocations']??[];foreach($alloc as &$a)$a['payment_id']=$id;unset($a);vfAllocate($alloc,$vendor,$firm,$date,$actor);$result['id']=$id;
    }elseif($command==='allocate'){
      if(empty($input['allocations']))vfFail('Enter at least one allocation.');vfAllocate($input['allocations'],$vendor,$firm,$date,$actor);
    }elseif($command==='unallocate'){
      $a=document('vendor_allocations',$id,true);if(!$a||!vfScope($a,$vendor,$firm)||$a['status']!=='Active')vfFail('Active allocation not found.');if(!trim((string)($input['reason']??'')))vfFail('Enter the adjustment reason.');$a['status']='Reversed';$a['reversal_reason']=$input['reason'];$a['reversed_at']=$now;vfPut('vendor_allocations',$id,$a);
    }elseif($command==='reverse_payment'){
      $p=document('vendor_payments',$id,true);if(!$p||!vfScope($p,$vendor,$firm)||$p['status']!=='Active')vfFail('Active payment not found.');if(!trim((string)($input['reason']??'')))vfFail('Enter the reversal reason.');
      foreach(vfRows('vendor_refunds') as $r)if(($r['payment_id']??'')===$id&&$r['status']==='Active')vfFail('Reverse this payment’s refunds before reversing the payment.');
      foreach(vfRows('vendor_allocations') as $a)if($a['payment_id']===$id&&$a['status']==='Active'){$a['status']='Reversed';$a['reversal_reason']=$input['reason'];$a['reversed_at']=$now;vfPut('vendor_allocations',$a['id'],$a);}
      $p['status']='Reversed';$p['reversal_reason']=$input['reason'];$p['reversed_at']=$now;vfPut('vendor_payments',$id,$p);$eventAmount=-(int)$p['amount_cents'];
    }elseif($command==='refund'){
      if(!trim((string)($input['account']??'')))vfFail('Enter the receiving bank or cash account.');
      $pid=(string)($input['payment_id']??'');$p=document('vendor_payments',$pid,true);$amount=vfMoney($input['amount']??'');if(!$p||!vfScope($p,$vendor,$firm)||$p['status']!=='Active'||$amount<=0||$amount>(int)$p['amount_cents']-vfUsed($pid))vfFail('Refund exceeds the available advance on this payment.');$id=bin2hex(random_bytes(16));$eventAmount=-$amount;vfPut('vendor_refunds',$id,['vendor_id'=>$vendor,'firm_id'=>$firm,'payment_id'=>$pid,'amount_cents'=>$amount,'date'=>$date,'reference'=>trim((string)($input['reference']??'')),'account'=>trim((string)($input['account']??'')),'remarks'=>trim((string)($input['remarks']??'')),'status'=>'Active','createdAt'=>$now,'created_by'=>$actor]);$result['id']=$id;
    }elseif($command==='reverse_refund'){
      $r=document('vendor_refunds',$id,true);if(!$r||!vfScope($r,$vendor,$firm)||$r['status']!=='Active')vfFail('Active refund not found.');if(!trim((string)($input['reason']??'')))vfFail('Enter the reversal reason.');$r['status']='Reversed';$r['reversal_reason']=$input['reason'];$r['reversed_at']=$now;vfPut('vendor_refunds',$id,$r);$eventAmount=(int)$r['amount_cents'];
    }else vfFail('Unknown vendor finance action.');
    $totals=vfTotals($vendor,$firm);vfPut('finance_events',$request,array_merge(['vendor_id'=>$vendor,'firm_id'=>$firm,'payload_hash'=>$requestHash,'command'=>$command,'record_id'=>$result['id']??$id,'date'=>$date,'cash_cents'=>$eventAmount,'actor'=>$actor,'createdAt'=>$now,'reason'=>trim((string)($input['reason']??$input['remarks']??'')),'result'=>$result],$totals));
    txCommit();reply(array_merge($result,['totals'=>$totals]));
}
