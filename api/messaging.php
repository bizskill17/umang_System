<?php
/* WhatsApp messages through MessageAutoSender.
   - Instant messages are queued when a record is saved, then sent after the reply has gone to the browser.
   - Daily summaries run from "tick": called by the scheduled GitHub workflow and, at most every few minutes, by normal use.
   - Account details live only in config/umang-whatsapp.json outside public_html. Groups and message choices are in
     app_settings (key "messaging"). Every send is written to the message_log collection. */
if (!defined('UMANG_VENDOR_FINANCE')) exit;

const MSG_API = 'https://app.messageautosender.com/api/v1/message/create';
const MSG_TZ = 'Asia/Kolkata';
// Message catalogue. kind: instant | summary. person: also to the person's own WhatsApp by default.
const MSG_EVENTS = [
    'new_lead' => ['instant', 'New Lead', false], 'estimate_updated' => ['instant', 'Estimate Updated', false],
    'lead_assigned' => ['instant', 'Lead Assigned', true], 'recce_assigned' => ['instant', 'Recce Assigned', true],
    'recce_updated' => ['instant', 'Recce Updated', false], 'design_assigned' => ['instant', 'Design Assigned', true],
    'design_updated' => ['instant', 'Design Updated', false], 'quotation_assigned' => ['instant', 'Quotation Assigned', true],
    'quotation_made' => ['instant', 'Quotation Made', false], 'quotation_checked' => ['instant', 'Quotation Checked', false],
    'quotation_sent' => ['instant', 'Quotation Sent', false], 'quotation_status' => ['instant', 'Quotation Status Updated', false],
    'follow_up' => ['instant', 'Follow Up Done', false], 'lead_canceled' => ['instant', 'Lead Canceled', false],
    'project_created' => ['instant', 'New Project', true], 'project_canceled' => ['instant', 'Project Canceled', true], 'project_completed' => ['instant', 'Project Completed', true, 'all'],
    'job_created' => ['instant', 'Job Created', true], 'job_printing' => ['instant', 'Job Created – Printing', false], 'job_laser' => ['instant', 'Job Created – Laser', false],
    'job_fabrication' => ['instant', 'Job Created – Fabrication', false], 'job_cutting' => ['instant', 'Job Created – Cutting / CNC', false],
    'delivery_created' => ['instant', 'Delivery Challan', false], 'installation_done' => ['instant', 'Installation Completed', false, 'all'],
    'invoice_created' => ['instant', 'Invoice Created', true, 'person'],
    'complaint_logged' => ['instant', 'Complaint Logged', false, 'all'], 'complaint_assigned' => ['instant', 'Complaint Assigned', true, 'all'], 'complaint_updated' => ['instant', 'Complaint Updated', false, 'all'],
    'daily_outcomes' => ['summary', 'Leads Won / Lost / Cancelled Today', false], 'not_assigned' => ['summary', 'Leads Not Assigned', false],
    'no_action' => ['summary', 'No Action Taken', false], 'recce_progress' => ['summary', 'Recce in Progress', false],
    'design_progress' => ['summary', 'Design in Progress', false], 'q_prepare' => ['summary', 'Quotations to Prepare', false],
    'q_check' => ['summary', 'Quotations to Check', false], 'q_send' => ['summary', 'Quotations to Send', false],
    'q_client' => ['summary', 'Pending Client Approval', false], 'pending_project' => ['summary', 'Approved, Project Not Created', false],
];

function msgConfigFile(): string { return dirname(__DIR__, 2) . '/config/umang-whatsapp.json'; }
function msgAccount(): array { $f = msgConfigFile(); $d = is_file($f) ? json_decode((string)file_get_contents($f), true) : null; return is_array($d) ? $d : []; }
function msgSettings(): array {
    foreach (query("SELECT body FROM umang_documents WHERE collection_path='app_settings'")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $b = json_decode($r['body'], true); if (is_array($b) && ($b['key'] ?? '') === 'messaging') return $b;
    }
    return [];
}
function msgEventCfg(array $s, string $ev): array {
    $c = $s['events'][$ev] ?? [];
    return ['on' => !array_key_exists('on', $c) || !empty($c['on']), 'groups' => array_values(array_filter((array)($c['groups'] ?? []), 'is_string')),
        'person' => array_key_exists('person', $c) ? !empty($c['person']) : MSG_EVENTS[$ev][2], 'time' => preg_match('/^\d\d:\d\d$/', (string)($c['time'] ?? '')) ? $c['time'] : '09:30',
        'days' => is_array($c['days'] ?? null) ? array_map('intval', $c['days']) : [1, 2, 3, 4, 5, 6],
        'attach' => in_array($c['attach'] ?? '', ['none', 'person', 'all'], true) ? $c['attach'] : (MSG_EVENTS[$ev][3] ?? 'none')];
}
function msgNow(): DateTime { return new DateTime('now', new DateTimeZone(MSG_TZ)); }
function msgToday(): string { return msgNow()->format('Y-m-d'); }
function msgDmy(?string $d): string { $d = (string)$d; if ($d === '') return ''; if (str_contains($d, 'T')) { try { $x = new DateTime($d); $x->setTimezone(new DateTimeZone(MSG_TZ)); return $x->format('d/m/Y'); } catch (Throwable $e) { return ''; } } return preg_match('/^(\d{4})-(\d\d)-(\d\d)/', $d, $m) ? "$m[3]/$m[2]/$m[1]" : $d; }
function msgDay(?string $d): string { $d = (string)$d; if (str_contains($d, 'T')) { try { $x = new DateTime($d); $x->setTimezone(new DateTimeZone(MSG_TZ)); return $x->format('Y-m-d'); } catch (Throwable $e) { return ''; } } return substr($d, 0, 10); }
$MSG_NAMES = [];
function mName(string $coll, ?string $id): string {
    global $MSG_NAMES; $id = (string)$id; if ($id === '') return '';
    if ($id === 'server-owner' && $coll === 'users') return 'Administrator';
    $k = $coll . '/' . $id; if (!array_key_exists($k, $MSG_NAMES)) { $d = document('masters/' . $coll . '/rows', $id); $MSG_NAMES[$k] = (string)($d['name'] ?? ''); }
    return $MSG_NAMES[$k];
}
function mMobile(?string $userId): string { if (!$userId) return ''; $u = document('masters/users/rows', (string)$userId); return preg_replace('/\D/', '', (string)($u['mobile'] ?? '')); }
function mWho(array $r, string $userKey, string $vendorKey = 'vendor_id'): string { if (!empty($r[$userKey])) return mName('users', $r[$userKey]); if (!empty($r[$vendorKey])) return mName('vendors', $r[$vendorKey]) . ' (Vendor)'; return 'Not assigned'; }
// "*Label:* value" lines, skipping empty values.
function mLines(string $title, array $rows): string {
    $t = '*' . $title . "*\n\n";
    foreach ($rows as $k => $v) { $v = trim((string)$v); if ($v === '') continue; $t .= '*' . $k . ':* ' . $v . "\n"; }
    return rtrim($t);
}
function mMoney($v): string { $v = (float)$v; return $v ? '₹' . number_format($v, 0, '.', ',') : ''; }
function mLeadRows(array $l): array {
    return ['Lead No' => $l['lead_no'] ?? '', 'Date' => msgDmy($l['date'] ?? ''), 'Customer' => mName('customers', $l['customer_id'] ?? ''),
        'Category' => mName('lead-category', $l['lead_category_id'] ?? ''), 'Sub-Category' => mName('lead-subcategory', $l['lead_subcategory_id'] ?? '')];
}
function mLeadOf(array $r): array { $id = (string)($r['lead_id'] ?? ''); return $id !== '' ? (document('leads', $id) ?? []) : []; }

/* ---------- private file links for attachments ---------- */
// A signed link to one uploaded file that works without signing in, for 7 days only.
function msgLinkSecret(): string { $a = msgAccount(); if (empty($a['link_secret'])) { $a['link_secret'] = bin2hex(random_bytes(32)); @file_put_contents(msgConfigFile(), json_encode($a), LOCK_EX); @chmod(msgConfigFile(), 0600); } return (string)$a['link_secret']; }
function msgFileUrl($file): string {
    $id = is_array($file) ? (string)($file['id'] ?? '') : ''; if (!preg_match('/^[a-f0-9]{32}$/', $id)) return '';
    $exp = time() + 7 * 86400; $sig = hash_hmac('sha256', $id . '|' . $exp, msgLinkSecret());
    $host = preg_replace('/[^a-zA-Z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'system.umangcommunications.com'));
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || !str_starts_with($host, '127.') ;
    return ($https ? 'https://' : 'http://') . $host . '/api/index.php?action=pubfile&id=' . $id . '&exp=' . $exp . '&sig=' . $sig;
}
function msgFirstFile($v) { if (is_array($v) && isset($v['id'])) return $v; if (is_array($v)) foreach ($v as $f) if (is_array($f) && isset($f['id'])) return $f; return null; }

/* ---------- queue ---------- */
$MSG_PENDING = false;
function msgQueue(string $ev, string $text, ?string $personId = null, string $ref = '', $file = null): void {
    global $MSG_PENDING;
    $s = msgSettings(); $c = msgEventCfg($s, $ev); if (!$c['on']) return;
    $groups = [];
    foreach ((array)($s['groups'] ?? []) as $g) if (in_array($g['key'] ?? '', $c['groups'], true) && !empty($g['gid']) && (!isset($g['active']) || $g['active'])) $groups[] = $g;
    $url = $file && $c['attach'] !== 'none' ? msgFileUrl($file) : '';
    $targets = array_map(fn($g) => ['type' => 'group', 'to' => (string)$g['gid'], 'name' => (string)($g['name'] ?? ''), 'file' => $c['attach'] === 'all' ? $url : ''], $groups);
    if ($c['person'] && $personId) { $m = mMobile($personId); if ($m !== '') $targets[] = ['type' => 'mobile', 'to' => $m, 'name' => mName('users', $personId), 'file' => $url]; }
    $at = gmdate('Y-m-d\TH:i:s\Z');
    foreach ($targets as $t) {
        $id = gmdate('YmdHis') . '-' . bin2hex(random_bytes(5));
        $doc = ['event' => $ev, 'title' => MSG_EVENTS[$ev][1], 'ref' => $ref, 'to_type' => $t['type'], 'to' => $t['to'], 'to_name' => $t['name'], 'text' => $text, 'file_url' => $t['file'], 'file_name' => $t['file'] ? (string)($file['name'] ?? 'file') : '', 'status' => 'queued', 'attempts' => 0, 'created_at' => $at];
        query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?)', ['message_log', $id, json_encode($doc, JSON_UNESCAPED_UNICODE)]);
        query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?)', ['message_queue', $id, '{}']);
        $MSG_PENDING = true;
    }
}
function msgQuiet(array $s): bool {
    $q = $s['quiet'] ?? ['from' => '21:00', 'to' => '08:00']; if (empty($q['from']) || empty($q['to']) || !empty($q['off'])) return false;
    $n = msgNow()->format('H:i'); return $q['from'] > $q['to'] ? ($n >= $q['from'] || $n < $q['to']) : ($n >= $q['from'] && $n < $q['to']);
}
function msgSend(array $acc, string $type, string $to, string $text, string $fileUrl = ''): array {
    $mobile = $to;
    // MessageAutoSender takes a plain 10-digit mobile number, without the country code.
    if ($type === 'mobile') { $mobile = preg_replace('/\D/', '', $to); if (strlen($mobile) > 10) $mobile = substr($mobile, -10); }
    $payload = $type === 'group' ? ['recipientIds' => [$to], 'message' => [$text]] : ['receiverMobileNo' => $mobile, 'message' => [$text]];
    if ($fileUrl !== '') $payload['filePathUrl'] = [$fileUrl];
    $ch = curl_init((string)($acc['api_url'] ?? MSG_API)); // api_url only for tests, set in the private file
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'Authorization: Basic ' . base64_encode((string)($acc['username'] ?? '') . ':' . (string)($acc['password'] ?? ''))],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)]);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
    if ($raw === false) return [false, 'Cannot reach MessageAutoSender: ' . $err];
    $body = mb_substr((string)$raw, 0, 400);
    $j = json_decode((string)$raw, true);
    $fail = $code >= 400 || (is_array($j) && ((isset($j['success']) && !$j['success']) || isset($j['error']) || (isset($j['status']) && in_array(strtolower((string)$j['status']), ['error', 'failed', 'fail'], true))));
    return [!$fail, ($fail ? 'HTTP ' . $code . ': ' : '') . $body];
}
function msgProcess(int $limit = 25): void {
    $acc = msgAccount(); $s = msgSettings();
    if (empty($acc['username']) || empty($acc['password'])) return;
    if (msgQuiet($s)) return;
    $ids = query("SELECT id FROM umang_documents WHERE collection_path='message_queue' ORDER BY id LIMIT " . (int)$limit)->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) {
        $doc = document('message_log', (string)$id);
        if (!$doc || ($doc['status'] ?? '') !== 'queued') { query("DELETE FROM umang_documents WHERE collection_path='message_queue' AND id=?", [$id]); continue; }
        // Claim it first so two runs never send the same message.
        $st = query("DELETE FROM umang_documents WHERE collection_path='message_queue' AND id=?", [$id]); if ($st->rowCount() < 1) continue;
        [$ok, $resp] = msgSend($acc, (string)$doc['to_type'], (string)$doc['to'], (string)$doc['text'], (string)($doc['file_url'] ?? ''));
        $doc['attempts'] = (int)($doc['attempts'] ?? 0) + 1; $doc['response'] = $resp; $doc['tried_at'] = gmdate('Y-m-d\TH:i:s\Z');
        if ($ok) { $doc['status'] = 'sent'; $doc['sent_at'] = $doc['tried_at']; }
        elseif ($doc['attempts'] < 3) { $doc['status'] = 'queued'; query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?)', ['message_queue', $id, '{}']); }
        else $doc['status'] = 'failed';
        query('UPDATE umang_documents SET body=? WHERE collection_path=? AND id=?', [json_encode($doc, JSON_UNESCAPED_UNICODE), 'message_log', $id]);
    }
}
function msgAfterReply(): void {
    global $MSG_PENDING;
    if (!$MSG_PENDING) return;
    $MSG_PENDING = false;
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
    try { msgProcess(); } catch (Throwable $e) { error_log('Umang messaging: ' . get_class($e)); }
}
register_shutdown_function('msgAfterReply');

/* ---------- instant messages, from saved records ---------- */
function msgOnWrite(string $path, string $id, ?array $old, array $new): void {
    $o = $old ?? [];
    $chg = fn($k) => ($new[$k] ?? null) !== ($o[$k] ?? null);
    if ($path === 'leads') {
        $l = $new; $rows = mLeadRows($l);
        if (!$old) msgQueue('new_lead', mLines('New Lead', (!empty($l['assigned_to']) ? ['Lead Assignee' => mName('users', $l['assigned_to'])] : []) + $rows + ['Source' => mName('lead-sources', $l['lead_source_id'] ?? ''), 'Firm Name' => mName('firm', $l['firm_id'] ?? ''), 'Owner' => mName('users', $l['owner_id'] ?? ''), 'Estimate Value' => mMoney($l['estimate'] ?? 0)]), null, "leads/$id");
        if ($old && $chg('estimate') && (float)($l['estimate'] ?? 0) > 0) msgQueue('estimate_updated', mLines('Estimate Updated', $rows + ['Owner' => mName('users', $l['owner_id'] ?? ''), 'Estimate Value' => mMoney($l['estimate'])]), null, "leads/$id");
        if (!empty($l['assigned_to']) && $chg('assigned_to')) msgQueue('lead_assigned', mLines('Lead Assigned', $rows + ['Source' => mName('lead-sources', $l['lead_source_id'] ?? ''), 'Owner' => mName('users', $l['owner_id'] ?? ''), 'Lead Assignee' => mName('users', $l['assigned_to'])]), (string)$l['assigned_to'], "leads/$id");
        if (($l['status'] ?? '') === 'Canceled' && ($o['status'] ?? '') !== 'Canceled') {
            $reason = trim(mName('lost-reasons', $l['cancel_reason_id'] ?? '') . (!empty($l['cancel_reason']) ? ' – ' . $l['cancel_reason'] : ''), ' –');
            msgQueue('lead_canceled', mLines('Cancel Leads', ['Lead No' => $l['lead_no'] ?? '', 'Firm Name' => mName('firm', $l['firm_id'] ?? '')] + $rows + ['Owner' => mName('users', $l['owner_id'] ?? ''), 'Cancel Date' => msgDmy($l['canceled_at'] ?? msgToday()), 'Cancel By' => mName('users', $l['canceled_by'] ?? ''), 'Cancel Reason' => $reason]), null, "leads/$id");
        }
        return;
    }
    if ($path === 'recce' && !$old) {
        $r = $new; $l = mLeadOf($r);
        msgQueue('recce_assigned', mLines('Recce Assigned', ['Recce No' => $r['no'] ?? '', 'Lead No' => $l['lead_no'] ?? '', 'Customer Name' => mName('customers', $r['customer_id'] ?? ''), 'Recce Assigned To' => mWho($r, 'assigned_to'), 'Assignment Date' => msgDmy($r['date'] ?? ''), 'Target Date' => msgDmy($r['target'] ?? ''), 'Units Assigned' => $r['units'] ?? '', 'Site' => $r['site_address'] ?? '']), $r['assigned_to'] ?? null, "recce/$id");
        return;
    }
    if ($path === 'recce_updates' && !$old) {
        $u = $new; $r = document('recce', (string)($u['recce_id'] ?? '')) ?? [];
        msgQueue('recce_updated', mLines('Recce Updated', ['Recce No' => $r['no'] ?? '', 'Customer' => mName('customers', $r['customer_id'] ?? ''), 'Recce By' => mName('users', $u['by'] ?? '') ?: mWho($r, 'assigned_to'), 'Target Date' => msgDmy($r['target'] ?? ''), 'Completed' => (string)(int)($u['completed'] ?? 0), 'Denied' => (string)(int)($u['denied'] ?? 0), 'Cancel' => (string)(int)($u['cancel'] ?? 0), 'Pending' => (string)(int)($u['pending_after'] ?? 0), 'Remarks' => $u['remarks'] ?? '', 'Update Date' => msgDmy(msgToday())]), null, "recce/" . ($u['recce_id'] ?? ''));
        return;
    }
    if ($path === 'designs' && !$old) {
        $d = $new; $l = mLeadOf($d);
        msgQueue('design_assigned', mLines('Design Assigned', ['Design Assigned To' => mWho($d, 'designer'), 'Design No' => $d['no'] ?? '', 'Lead No' => $l['lead_no'] ?? '', 'Customer Name' => mName('customers', $d['customer_id'] ?? ''), 'Assignment Date' => msgDmy($d['date'] ?? ''), 'Due Date' => msgDmy($d['due'] ?? ''), 'Units Assigned' => $d['count'] ?? '']), $d['designer'] ?? null, "designs/$id");
        return;
    }
    if ($path === 'design_updates' && !$old) {
        $u = $new; $d = document('designs', (string)($u['design_id'] ?? '')) ?? [];
        if (($u['kind'] ?? '') === 'approval') $rows = ['Design No' => $d['no'] ?? '', 'Customer' => mName('customers', $d['customer_id'] ?? ''), 'Approved by client' => (string)(int)($u['approved'] ?? 0), 'Updated By' => mName('users', $u['by'] ?? ''), 'Remarks' => $u['remarks'] ?? '', 'Update Date' => msgDmy(msgToday())];
        else $rows = ['Design No' => $d['no'] ?? '', 'Customer' => mName('customers', $d['customer_id'] ?? ''), 'Designer' => mName('users', $u['by'] ?? '') ?: mWho($d, 'designer'), 'Completed' => (string)(int)($u['completed'] ?? 0), 'Cancel' => (string)(int)($u['cancel'] ?? 0), 'Remarks' => $u['remarks'] ?? '', 'Completion Date' => msgDmy(msgToday())];
        msgQueue('design_updated', mLines(($u['kind'] ?? '') === 'approval' ? 'Design Approval Updated' : 'Design Updated', $rows), null, "designs/" . ($u['design_id'] ?? ''));
        return;
    }
    if ($path === 'quotations') {
        $q = $new; $l = mLeadOf($q); $rows = mLeadRows($l + ['customer_id' => $q['customer_id'] ?? ($l['customer_id'] ?? '')]); $st = $q['status'] ?? ''; $was = $o['status'] ?? '';
        $qno = ['Quotation No' => $q['no'] ?? ''];
        if (!$old) { msgQueue('quotation_assigned', mLines('Quotation Assigned', $rows + ['Owner' => mName('users', $l['owner_id'] ?? ($q['sales_person'] ?? '')), 'Assigned To' => mName('users', $q['assigned_to'] ?? ''), 'Assigned Date' => msgDmy($q['assigned_date'] ?? msgToday())]), $q['assigned_to'] ?? null, "quotations/$id"); return; }
        if ($st === $was) return;
        if ($st === 'Pending Checking') msgQueue('quotation_made', mLines('Quotation Made', $rows + ['Owner' => mName('users', $l['owner_id'] ?? ($q['sales_person'] ?? '')), 'Prepared By' => mName('users', $q['prepared_by'] ?? ($q['made_by'] ?? '')), 'Prepared Date' => msgDmy($q['date'] ?? msgToday())] + $qno + ['Amount' => mMoney($q['total'] ?? 0), 'Revision' => !empty($q['revision']) ? 'R' . $q['revision'] : '']), null, "quotations/$id");
        elseif ($st === 'Pending Sending') { $c = $q['checked'] ?? []; msgQueue('quotation_checked', mLines('Quotation Checked', $rows + $qno + ['Checked By' => mName('users', $c['by'] ?? ''), 'Checked Date' => msgDmy($c['date'] ?? msgToday()), 'Status' => 'Checked', 'Checked Remark' => $c['remarks'] ?? '']), null, "quotations/$id"); }
        elseif ($st === 'Pending Approval') { $s = $q['sent'] ?? []; msgQueue('quotation_sent', mLines('Quotation Sent', $rows + $qno + ['Sent By' => mName('users', $s['by'] ?? ''), 'Sent Date' => msgDmy($s['date'] ?? msgToday()), 'Sent Through' => mName('send-mode', $s['mode'] ?? '') ?: ($s['mode'] ?? ''), 'Next Follow Up' => msgDmy($q['next_fu'] ?? '')]), null, "quotations/$id"); }
        elseif ($st === 'Approved' || $st === 'Rejected') {
            $fb = $st === 'Rejected' ? trim(mName('lost-reasons', $q['reject_reason_id'] ?? '') . (!empty($q['reject_reason']) ? ' – ' . $q['reject_reason'] : ''), ' –') : (string)($q['last_fu']['remarks'] ?? '');
            msgQueue('quotation_status', mLines('Quotation Status Updated', $rows + $qno + ['Quotation Status' => $st, 'Amount' => mMoney($q['total'] ?? 0), 'Update Date' => msgDmy($st === 'Approved' ? ($q['approved_at'] ?? '') : ($q['rejected_at'] ?? '')), 'Updated By' => mName('users', $q[$st === 'Approved' ? 'approved_by' : 'rejected_by'] ?? ''), ($st === 'Rejected' ? 'Lost Reason' : 'Client Feedback') => $fb]), null, "quotations/$id");
        }
        return;
    }
    if ($path === 'projects') {
        $p = $new; $st = $p['status'] ?? ''; $was = $o['status'] ?? '';
        $rows = ['Project No' => $p['no'] ?? '', 'Customer' => mName('customers', $p['customer_id'] ?? ''), 'Firm Name' => mName('firm', $p['firm_id'] ?? ''), 'Category' => mName('lead-category', $p['lead_category_id'] ?? ''), 'Project Name' => $p['billing_name'] ?? ''];
        if (!$old) msgQueue('project_created', mLines('New Project', ['Date' => msgDmy($p['date'] ?? '')] + $rows + ['Project Controller' => mName('users', $p['controller'] ?? ''), 'Project Owner' => mName('users', $p['owner'] ?? ''), 'Target Date' => msgDmy($p['due'] ?? '')]), $p['controller'] ?? null, "projects/$id");
        elseif ($st === 'Canceled' && $was !== 'Canceled') { $c = $p['cancel'] ?? []; msgQueue('project_canceled', mLines('Project Canceled', $rows + ['Cancel Date' => msgDmy($c['date'] ?? msgToday()), 'Cancel By' => mName('users', $c['by'] ?? ''), 'Cancel Reason' => $c['reason'] ?? '']), $p['controller'] ?? null, "projects/$id"); }
        elseif ($st === 'Completed' && $was !== 'Completed') { $c = $p['completion'] ?? []; msgQueue('project_completed', mLines('Project Completed', $rows + ['Project Date' => msgDmy($p['date'] ?? ''), 'Complete Date' => msgDmy($c['date'] ?? msgToday()), 'Complete By' => mName('users', $c['by'] ?? ''), 'Remarks' => $c['remarks'] ?? '']), $p['controller'] ?? null, "projects/$id", msgFirstFile($c['cert'] ?? null)); }
        return;
    }
    if ($path === 'jobs' && !$old) {
        global $user;
        $j = $new; $p = document('projects', (string)($j['project_id'] ?? '')) ?? []; $steps = [];
        $lines = [];
        foreach ((array)($j['items'] ?? []) as $i => $it) { foreach ((array)($it['steps'] ?? []) as $s) $steps[$s] = 1; $lines[] = ($i + 1) . '. ' . trim(($it['description'] ?? '') ?: mName('items', $it['item_id'] ?? '')) . ' × ' . ($it['qty'] ?? '') . (!empty($it['steps']) ? ' (' . implode(', ', (array)$it['steps']) . ')' : ''); }
        $text = mLines('Job Created', ['Job Date' => msgDmy($j['date'] ?? ''), 'Job No.' => $j['no'] ?? '', 'Customer' => mName('customers', $j['customer_id'] ?? ''), 'Prepared By' => mName('users', $user['id'] ?? ''), 'Project No.' => $p['no'] ?? '', 'Work' => implode(', ', array_keys($steps))]) . ($lines ? "\n\n*Items:*\n" . implode("\n", $lines) : '');
        msgQueue('job_created', $text, $p['controller'] ?? null, "jobs/$id");
        foreach (['Printing' => 'job_printing', 'Laser' => 'job_laser', 'Fabrication' => 'job_fabrication', 'Cutting' => 'job_cutting'] as $s => $ev) if (!empty($steps[$s])) msgQueue($ev, $text, null, "jobs/$id");
        return;
    }
    if ($path === 'dispatches') {
        $d = $new; $p = document('projects', (string)($d['project_id'] ?? '')) ?? [];
        if (!$old) {
            $lines = []; $tot = 0;
            foreach ((array)($d['items'] ?? []) as $it) { $q = (float)($it['qty'] ?? 0); if ($q <= 0) continue; $tot += $q; $jb = document('jobs', (string)($it['job_id'] ?? '')) ?? []; $desc = ''; foreach ((array)($jb['items'] ?? []) as $ji) if (($ji['lid'] ?? '') === ($it['lid'] ?? '')) $desc = trim(($ji['description'] ?? '') ?: mName('items', $ji['item_id'] ?? '')); $lines[] = ($desc ?: 'Item') . ' × ' . $q; }
            msgQueue('delivery_created', mLines('Delivery Challan', ['Challan Date' => msgDmy($d['date'] ?? ''), 'Challan No.' => $d['no'] ?? '', 'Customer' => mName('customers', $d['customer_id'] ?? ($p['customer_id'] ?? '')), 'Project' => $p['no'] ?? '', 'Qty Delivered' => (string)$tot, 'Delivered By' => mName('users', $d['delivered_by'] ?? ''), 'Delivery Mode' => $d['mode_type'] ?? '', 'Vehicle' => mName('vehicles', $d['vehicle'] ?? ''), 'Transporter' => mName('transporters', $d['transporter'] ?? ''), 'Installation' => !empty($d['installation']) ? 'Required' : '']) . ($lines ? "\n\n*Item Details:*\n" . implode("\n", array_map(fn($x, $i) => ($i + 1) . '. ' . $x, $lines, array_keys($lines))) : ''), null, "dispatches/$id");
        } elseif (!empty($d['install_cert']) && empty($o['install_cert'])) {
            msgQueue('installation_done', mLines('Installation Completed', ['Challan No.' => $d['no'] ?? '', 'Customer' => mName('customers', $d['customer_id'] ?? ($p['customer_id'] ?? '')), 'Project' => $p['no'] ?? '', 'Installation Date' => msgDmy($d['install_date'] ?? msgToday()), 'Installed By' => mName('users', $d['install_by'] ?? '')]), $p['controller'] ?? null, "dispatches/$id", msgFirstFile($d['install_cert']));
        }
        return;
    }
    if ($path === 'invoices' && !$old) {
        global $user;
        $i = $new; $p = document('projects', (string)($i['project_id'] ?? '')) ?? [];
        msgQueue('invoice_created', mLines('Invoice Created', ['Customer' => mName('customers', $i['customer_id'] ?? ($p['customer_id'] ?? '')), 'Project' => $p['no'] ?? '', 'Invoice Date' => msgDmy($i['date'] ?? ''), 'Invoice Number' => $i['no'] ?? '', 'Bill Type' => $i['bill_type'] ?? '', 'Invoice Remarks' => $i['notes'] ?? '', 'Created By' => mName('users', $user['id'] ?? '')]), $p['controller'] ?? null, "invoices/$id", msgFirstFile($i['pdf'] ?? null));
        return;
    }
    if ($path === 'complaints') {
        $c = $new; $p = document('projects', (string)($c['project_id'] ?? '')) ?? [];
        $base = ['Customer' => mName('customers', $c['customer_id'] ?? ($p['customer_id'] ?? '')), 'Project Name' => trim(($p['no'] ?? '') . (!empty($p['billing_name']) ? ' – ' . $p['billing_name'] : ''), ' –'), 'Project Controller' => mName('users', $p['controller'] ?? '')];
        if (!$old) msgQueue('complaint_logged', mLines('Complaint Logged', ['Complaint No' => $c['no'] ?? '', 'Date' => msgDmy($c['date'] ?? ''), 'Type' => mName('complaint-types', $c['complaint_type_id'] ?? ''), 'Priority' => $c['priority'] ?? '', 'Issue' => $c['details'] ?? ''] + $base), null, "complaints/$id", msgFirstFile($c['docs'] ?? null));
        if (!empty($c['assigned_to']) && $chg('assigned_to')) msgQueue('complaint_assigned', mLines('Complaint Assign', ['Assign Date' => msgDmy($c['assigned_at'] ?? msgToday()), 'Complaint No' => $c['no'] ?? '', 'Issue' => $c['details'] ?? ''] + $base + ['Assign To' => mName('users', $c['assigned_to']), 'Target Date' => msgDmy($c['target'] ?? '')]), $c['assigned_to'], "complaints/$id", msgFirstFile($c['docs'] ?? null));
        return;
    }
    if ($path === 'complaint_updates' && !$old) {
        $u = $new; $c = document('complaints', (string)($u['complaint_id'] ?? '')) ?? []; $p = document('projects', (string)($c['project_id'] ?? '')) ?? [];
        msgQueue('complaint_updated', mLines('Complaint Updated', ['Action Date' => msgDmy($u['date'] ?? msgToday()), 'Complaint No' => $c['no'] ?? '', 'Issue' => $c['details'] ?? '', 'Customer' => mName('customers', $c['customer_id'] ?? ''), 'Project Name' => $p['no'] ?? '', 'Update Status' => $u['status'] ?? '', 'Update Remark' => $u['remarks'] ?? '', 'Update By' => mName('users', $u['by'] ?? '')]), null, "complaints/" . ($u['complaint_id'] ?? ''), msgFirstFile($u['photos'] ?? null));
        return;
    }
    $leadFu = preg_match('#^leads/([^/]+)/followups$#', $path, $m);
    if (!$old && ($path === 'quote_followups' || $leadFu)) {
        $f = $new; if (!empty($f['auto']) || empty($f['status'])) return;
        $l = $leadFu ? (document('leads', $m[1]) ?? []) : mLeadOf($f); $q = $path === 'quote_followups' ? (document('quotations', (string)($f['quotation_id'] ?? '')) ?? []) : [];
        msgQueue('follow_up', mLines('Follow Up Done', mLeadRows($l) + ['Quotation No' => $q['no'] ?? '', 'Status' => $f['status'] ?? '', 'Follow Up By' => mName('users', $f['by'] ?? ''), 'Follow-up Date' => msgDmy($f['date'] ?? msgToday()), 'Next Follow Up Date' => msgDmy($f['next_date'] ?? ''), 'Remarks' => $f['remarks'] ?? '']), null, $leadFu ? "leads/$m[1]" : "quotations/" . ($f['quotation_id'] ?? ''));
    }
}

/* ---------- daily summaries ---------- */
function mAll(string $coll): array { $o = []; foreach (query('SELECT id,body FROM umang_documents WHERE collection_path=?', [$coll])->fetchAll(PDO::FETCH_ASSOC) as $r) { $b = json_decode($r['body'], true); if (is_array($b)) { $b['id'] = $r['id']; $o[] = $b; } } return $o; }
function mGrouped(string $title, array $groups, string $headPrefix = ''): string {
    if (!$groups) return '';
    $t = '*' . $title . "*\n\n";
    foreach ($groups as $head => $lines) { $t .= '*' . $headPrefix . $head . "*\n"; foreach (array_values($lines) as $i => $x) $t .= ($i + 1) . '. ' . $x . "\n"; $t .= "\n"; }
    return rtrim($t);
}
function msgSummary(string $ev): string {
    $today = msgToday(); $cust = fn($r) => mName('customers', $r['customer_id'] ?? '') ?: 'Customer not set';
    $leads = fn() => mAll('leads'); $quotes = fn() => array_values(array_filter(mAll('quotations'), fn($q) => ($q['status'] ?? '') !== 'Canceled'));
    $leadSub = function ($q) { $l = mLeadOf($q); return mName('lead-subcategory', $l['lead_subcategory_id'] ?? ''); };
    switch ($ev) {
        case 'daily_outcomes':
            $won = []; $lost = []; $cancel = [];
            foreach ($quotes() as $q) {
                $line = $cust($q) . (($s = $leadSub($q)) ? ' - ' . $s : '') . (!empty($q['no']) ? ' (' . $q['no'] . ')' : '');
                if (($q['status'] ?? '') === 'Approved' && msgDay($q['approved_at'] ?? '') === $today) $won[] = $line . ' ' . mMoney($q['total'] ?? 0);
                if (($q['status'] ?? '') === 'Rejected' && msgDay($q['rejected_at'] ?? '') === $today) $lost[] = $line . (($r = trim(mName('lost-reasons', $q['reject_reason_id'] ?? '') . ' ' . ($q['reject_reason'] ?? ''))) ? ' - ' . $r : '');
            }
            foreach ($leads() as $l) if (($l['status'] ?? '') === 'Canceled' && msgDay($l['canceled_at'] ?? '') === $today) $cancel[] = $cust($l) . (($s = mName('lead-subcategory', $l['lead_subcategory_id'] ?? '')) ? ' - ' . $s : '') . (($r = trim(mName('lost-reasons', $l['cancel_reason_id'] ?? '') . ' ' . ($l['cancel_reason'] ?? ''))) ? ' - ' . $r : '');
            $parts = [];
            $fmt = fn($a) => implode("\n", array_map(fn($x, $i) => ($i + 1) . '. ' . $x, $a, array_keys($a)));
            if ($won) $parts[] = "*Leads Won*:\n" . $fmt($won); if ($lost) $parts[] = "*Leads Lost*:\n" . $fmt($lost); if ($cancel) $parts[] = "*Leads Cancel*:\n" . $fmt($cancel);
            return $parts ? '*' . msgDmy($today) . "*\n\n" . implode("\n\n", $parts) : '';
        case 'not_assigned':
            $g = []; foreach ($leads() as $l) if (($l['status'] ?? '') === 'In Progress' && empty($l['assigned_to'])) $g[mName('users', $l['owner_id'] ?? '') ?: 'Unknown Owner'][] = $cust($l) . ' - (Creation Dt: *' . msgDmy($l['date'] ?? '') . '*)';
            return mGrouped('Leads Not Assigned', $g);
        case 'no_action':
            $has = []; foreach (['recce', 'designs', 'quotations'] as $c) foreach (mAll($c) as $r) if (!empty($r['lead_id'])) $has[$r['lead_id']] = 1;
            $g = []; foreach ($leads() as $l) if (($l['status'] ?? '') === 'In Progress' && empty($l['assigned_to']) && empty($has[$l['id']])) $g['Unassigned'][] = $cust($l) . ' - (Creation Date - *' . msgDmy($l['date'] ?? '') . '*)';
            return mGrouped('No Action Taken', $g);
        case 'recce_progress':
            $g = []; foreach (mAll('recce') as $r) { if (($r['status'] ?? '') === 'Canceled') continue; $d = $r['done'] ?? []; $tot = (int)($r['units'] ?? 0); $c = (int)($d['completed'] ?? 0); $x = (int)($d['cancel'] ?? 0); $dn = (int)($d['denied'] ?? 0); $p = $tot - $c - $x - $dn; if ($p <= 0) continue;
                $parts = array_filter(['Total' => $tot, 'Complete' => $c, 'Cancel' => $x, 'Pending' => $p, 'Denied' => $dn]); $g[mWho($r, 'assigned_to')][] = $cust($r) . ' - (' . msgDmy($r['date'] ?? '') . ') - (' . implode(', ', array_map(fn($k, $v) => "$k: $v", array_keys($parts), $parts)) . ')' . (!empty($r['target']) && $r['target'] < $today ? ' ⚠️ target ' . msgDmy($r['target']) : ''); }
            return mGrouped('Recce in Progress', $g);
        case 'design_progress':
            $g = []; foreach (mAll('designs') as $r) { if (($r['status'] ?? '') === 'Canceled') continue; $d = $r['done'] ?? []; $tot = (int)($r['count'] ?? 0); $c = (int)($d['completed'] ?? 0); $x = (int)($d['cancel'] ?? 0); $p = $tot - $c - $x; if ($p <= 0) continue;
                $parts = array_filter(['Total' => $tot, 'Complete' => $c, 'Cancel' => $x, 'Pending' => $p]); $g[mWho($r, 'designer')][] = $cust($r) . ' - (' . msgDmy($r['date'] ?? '') . ') - (' . implode(', ', array_map(fn($k, $v) => "$k: $v", array_keys($parts), $parts)) . ')' . (!empty($r['due']) && $r['due'] < $today ? ' ⚠️ due ' . msgDmy($r['due']) : ''); }
            return mGrouped('Design in Progress', $g);
        case 'q_prepare':
            $g = []; foreach ($quotes() as $q) if (($q['status'] ?? '') === 'Pending Prepare Quotation') $g[mName('users', $q['assigned_to'] ?? '') ?: 'Not assigned'][] = $cust($q) . ' - (Assign Dt: *' . msgDmy($q['assigned_date'] ?? '') . '*)';
            return mGrouped('Quotations to Prepare', $g);
        case 'q_check':
            $g = []; foreach ($quotes() as $q) if (($q['status'] ?? '') === 'Pending Checking') $g[mName('users', $q['prepared_by'] ?? ($q['made_by'] ?? '')) ?: 'Not recorded'][] = $cust($q) . ' - (Q No : *' . ($q['no'] ?? '') . '*) - *Prepared Dt: ' . msgDmy($q['prepared_at'] ?? ($q['date'] ?? '')) . '*';
            return mGrouped('Quotations to Check', $g, 'Prepared By - ');
        case 'q_send':
            $g = []; foreach ($quotes() as $q) if (($q['status'] ?? '') === 'Pending Sending') $g[msgDmy($q['checked']['date'] ?? '')][] = $cust($q) . ' - (Q No : *' . ($q['no'] ?? '') . '*)';
            ksort($g); return mGrouped('Quotations to Send', $g, 'Check Dt: ');
        case 'q_client':
            $g = []; foreach ($quotes() as $q) if (($q['status'] ?? '') === 'Pending Approval') $g[msgDmy($q['sent']['date'] ?? '')][] = $cust($q) . ' - (Q No: *' . ($q['no'] ?? '') . '*)' . (!empty($q['next_fu']) && $q['next_fu'] < $today ? ' ⚠️ follow-up ' . msgDmy($q['next_fu']) : '');
            return mGrouped('Quotations Pending for Client Approval', $g, 'Sent Date: ');
        case 'pending_project':
            $pq = []; foreach (mAll('projects') as $p) if (!empty($p['quotation_id'])) $pq[$p['quotation_id']] = 1;
            $g = []; foreach ($quotes() as $q) if (($q['status'] ?? '') === 'Approved' && empty($q['project_id']) && empty($pq[$q['id']])) $g[msgDmy($q['approved_at'] ?? '')][] = $cust($q) . ' - (Q No : *' . ($q['no'] ?? '') . '*) ' . mMoney($q['total'] ?? 0);
            return mGrouped('Approved, Project Not Created', $g, 'Qtn Approved Dt: ');
    }
    return '';
}
// Runs summaries that are due today and not yet sent, then sends the queue.
function msgTick(bool $force = false): array {
    $s = msgSettings(); $now = msgNow(); $today = $now->format('Y-m-d'); $hm = $now->format('H:i'); $dow = (int)$now->format('N'); $ran = [];
    foreach (MSG_EVENTS as $ev => $meta) {
        if ($meta[0] !== 'summary') continue;
        $c = msgEventCfg($s, $ev); if (!$c['on'] || !$c['groups'] || !in_array($dow, $c['days'], true) || $hm < $c['time']) continue;
        $key = 'summary-' . $ev; $doc = document('message_runs', $key);
        if (($doc['date'] ?? '') === $today) continue;
        query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', ['message_runs', $key, json_encode(['date' => $today, 'at' => gmdate('c')])]);
        $text = msgSummary($ev);
        if ($text !== '') { msgQueue($ev, $text, null, 'summary'); $ran[] = $ev; }
    }
    msgProcess(40);
    return $ran;
}
// Piggy-back: normal use runs the tick at most every 3 minutes.
function msgMaybeTick(): void {
    $f = dirname(__DIR__, 2) . '/config/umang-whatsapp.tick';
    if (is_file($f) && filemtime($f) > time() - 180) return;
    @touch($f);
    register_shutdown_function(function () { if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request(); elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request(); try { msgTick(); } catch (Throwable $e) { error_log('Umang messaging tick: ' . get_class($e)); } });
}

/* ---------- API: ?action=msgtick (scheduler) and ?action=msg (settings page) ---------- */
if ($action === 'msgtick') {
    $f = dirname(__DIR__, 2) . '/config/umang-whatsapp.tick';
    if (is_file($f) && filemtime($f) > time() - 50) reply(['ok' => true, 'skipped' => 'recent']);
    @touch($f);
    reply(['ok' => true, 'ran' => msgTick()]);
}
if ($user && $action !== 'msg') msgMaybeTick();
if ($action !== 'msg') return;
if (!$user) reject('Sign in first.', 401, 'unauthenticated');
$cmd = (string)($input['cmd'] ?? '');
// Administrators: the built-in admin login, users with full access (no view list), or users whose role name contains "Admin".
$isAdmin = !empty($user['owner']) || !is_array($user['allowed_views'] ?? null) || preg_match('/admin/i', mName('user-roles', (string)($user['role_id'] ?? ''))) === 1;
$canSettings = $isAdmin || in_array('masters.message-settings', (array)($user['allowed_views'] ?? []), true);
if (!$canSettings) reject('You do not have permission for message settings. Ask the administrator to give you the Message Settings view.', 403);
if ($cmd === 'status') {
    $a = msgAccount();
    reply(['connected' => !empty($a['username']) && !empty($a['password']), 'username' => (string)($a['username'] ?? ''), 'country_code' => (string)($a['country_code'] ?? '91'), 'events' => array_map(fn($m) => ['kind' => $m[0], 'title' => $m[1], 'person' => $m[2]], MSG_EVENTS), 'can_account' => $isAdmin]);
}
if ($cmd === 'account') {
    if (!$isAdmin) reject('Only the administrator can change the WhatsApp account.', 403);
    $a = msgAccount(); $u = trim((string)($input['username'] ?? '')); $p = (string)($input['password'] ?? ''); $cc = preg_replace('/\D/', '', (string)($input['country_code'] ?? '91'));
    if ($u === '') reject('Enter the MessageAutoSender username.');
    $a['username'] = $u; if ($p !== '') $a['password'] = $p; $a['country_code'] = $cc; $a['updated_at'] = gmdate('c');
    if (empty($a['password'])) reject('Enter the MessageAutoSender password.');
    if (@file_put_contents(msgConfigFile(), json_encode($a), LOCK_EX) === false) reject('Could not save the account on the server. Check that the config folder is writable.', 500);
    @chmod(msgConfigFile(), 0600);
    reply(['ok' => true]);
}
if ($cmd === 'test') {
    $a = msgAccount(); if (empty($a['username']) || empty($a['password'])) reject('Save the MessageAutoSender account first.');
    $to = trim((string)($input['to'] ?? '')); $type = ($input['type'] ?? 'group') === 'mobile' ? 'mobile' : 'group';
    if ($to === '') reject($type === 'group' ? 'Enter the group ID.' : 'Enter the mobile number.');
    $text = "*Test message*\n\nFrom the Umang system, sent by " . ($user['name'] ?? 'Administrator') . ' at ' . msgNow()->format('d/m/Y h:i A') . '. If you can read this, this ' . ($type === 'group' ? 'group' : 'number') . ' is set up correctly.';
    [$ok, $resp] = msgSend($a, $type, $type === 'mobile' ? preg_replace('/\D/', '', $to) : $to, $text);
    $id = gmdate('YmdHis') . '-' . bin2hex(random_bytes(5));
    query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?)', ['message_log', $id, json_encode(['event' => 'test', 'title' => 'Test message', 'to_type' => $type, 'to' => $to, 'to_name' => (string)($input['name'] ?? ''), 'text' => $text, 'status' => $ok ? 'sent' : 'failed', 'attempts' => 1, 'response' => $resp, 'created_at' => gmdate('Y-m-d\TH:i:s\Z'), 'sent_at' => $ok ? gmdate('Y-m-d\TH:i:s\Z') : ''], JSON_UNESCAPED_UNICODE)]);
    $ok ? reply(['ok' => true, 'response' => $resp]) : reject('Not sent. ' . $resp, 502);
}
if ($cmd === 'preview') {
    $ev = (string)($input['event'] ?? ''); if (!isset(MSG_EVENTS[$ev]) || MSG_EVENTS[$ev][0] !== 'summary') reject('Choose a daily summary.');
    reply(['text' => msgSummary($ev)]);
}
if ($cmd === 'run') {
    $ev = (string)($input['event'] ?? ''); if (!isset(MSG_EVENTS[$ev]) || MSG_EVENTS[$ev][0] !== 'summary') reject('Choose a daily summary.');
    $text = msgSummary($ev); if ($text === '') reply(['ok' => true, 'empty' => true]);
    $c = msgEventCfg(msgSettings(), $ev); if (!$c['groups']) reject('Choose a group for this summary first.');
    msgQueue($ev, $text, null, 'summary'); msgProcess(10); reply(['ok' => true]);
}
if ($cmd === 'log') {
    $rows = [];
    foreach (query("SELECT id,body FROM umang_documents WHERE collection_path='message_log' ORDER BY id DESC LIMIT 300")->fetchAll(PDO::FETCH_ASSOC) as $r) { $b = json_decode($r['body'], true); if (is_array($b)) { $b['id'] = $r['id']; $rows[] = $b; } }
    reply(['rows' => $rows]);
}
if ($cmd === 'resend') {
    $id = (string)($input['id'] ?? ''); $doc = document('message_log', $id); if (!$doc || ($doc['event'] ?? '') === 'test') reject('Message not found.', 404);
    $doc['status'] = 'queued'; $doc['attempts'] = 0; $doc['resent_by'] = $user['id'];
    query('UPDATE umang_documents SET body=? WHERE collection_path=? AND id=?', [json_encode($doc, JSON_UNESCAPED_UNICODE), 'message_log', $id]);
    query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', ['message_queue', $id, '{}']);
    msgProcess(5); reply(['ok' => true, 'doc' => document('message_log', $id)]);
}
reject('Unknown message command.');
