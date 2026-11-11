<?php
/* Bridge to the Umang Inventory Management System (IMS): reads its masters for the
   Material Requisition form, sends requisitions to it and reads their status back. */
if (!defined('UMANG_VENDOR_FINANCE')) exit;
if ($action !== 'ims') return;
if (!$user) reject('Sign in first.', 401, 'unauthenticated');
$allowed = $user['allowed_views'] ?? null;
if (empty($user['owner']) && is_array($allowed) && !array_filter($allowed, fn($v) => is_string($v) && str_starts_with($v, 'requisition.'))) reject('You do not have access to Material Requisition.', 403);
$imsBase = rtrim((string)($config['ims_url'] ?? 'https://ims.umangcommunications.com'), '/');

$IMS_SOFT = false;
function imsFail(string $m, int $code, string $c): void { global $IMS_SOFT; if ($IMS_SOFT) throw new RuntimeException($m); reject($m, $code, $c); }
function imsCall(string $method, string $path, ?array $body = null): array {
    global $imsBase;
    $headers = ['Accept: application/json'];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    if (function_exists('curl_init')) {
        $ch = curl_init($imsBase . $path);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
        if ($raw === false) imsFail('Cannot reach the Inventory system: ' . $err, 502, 'unavailable');
    } else {
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : '', 'timeout' => 40, 'ignore_errors' => true]]);
        $raw = @file_get_contents($imsBase . $path, false, $ctx);
        if ($raw === false) imsFail('Cannot reach the Inventory system.', 502, 'unavailable');
        $code = 200; foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
    }
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) imsFail('The Inventory system sent an unexpected reply.', 502, 'unavailable');
    if ($code >= 400 || isset($data['error'])) imsFail('Inventory system: ' . (string)($data['error'] ?? ('error ' . $code)), 502, 'ims_error');
    return $data;
}
function imsList(string $path, string $key): array { $d = imsCall('GET', $path); return is_array($d[$key] ?? null) ? $d[$key] : []; }
function pickFields(array $rows, array $keys): array { return array_map(fn($r) => array_intersect_key($r, array_flip($keys)), $rows); }

$cmd = (string)($input['cmd'] ?? '');
if ($cmd === 'masters') {
    // Cached briefly so the form opens fast; only the fields the form needs are kept (no contact or bank details).
    $cacheFile = dirname(__DIR__, 2) . '/config/umang-ims-masters.json';
    if (empty($input['fresh']) && is_file($cacheFile) && filemtime($cacheFile) > time() - 600) { $c = json_decode((string)file_get_contents($cacheFile), true); if (is_array($c)) reply($c); }
    $out = [
        'firms' => pickFields(imsList('/api/masters/firms', 'firms'), ['id', 'name']),
        'stores' => pickFields(imsList('/api/masters/stores', 'stores'), ['id', 'name', 'firmId', 'location']),
        'departments' => pickFields(imsList('/api/masters/departments', 'departments'), ['id', 'name']),
        'customers' => pickFields(imsList('/api/masters/customers', 'customers'), ['id', 'name']),
        'projects' => pickFields(imsList('/api/masters/projects', 'projects'), ['id', 'name', 'clientName', 'firmId', 'status']),
        'users' => pickFields(array_values(array_filter(imsList('/api/masters/users', 'users'), fn($u) => !isset($u['isActive']) || $u['isActive'])), ['id', 'name']),
        'suppliers' => pickFields(imsList('/api/masters/suppliers', 'suppliers'), ['id', 'name', 'isVendor']),
        'itemNames' => pickFields(imsList('/api/masters/item-names', 'itemNames'), ['id', 'name', 'unitName', 'specificationIds']),
        'specifications' => pickFields(imsList('/api/masters/specifications', 'specifications'), ['id', 'name']),
        'items' => pickFields(imsList('/api/masters/items', 'items'), ['id', 'itemNameId', 'specificationsJson']),
        'at' => gmdate('c'),
    ];
    @file_put_contents($cacheFile, json_encode($out, JSON_UNESCAPED_UNICODE), LOCK_EX);
    reply($out);
}
function mrSave(string $id, array $doc): void { $doc['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z'); query('UPDATE umang_documents SET body=? WHERE collection_path=? AND id=?', [json_encode($doc, JSON_UNESCAPED_UNICODE), 'material_requisitions', $id]); }
if ($cmd === 'send') {
    /* Sends one requisition saved in this app. The IMS gives the only number; this app stores it.
       A lock stops two sends of the same requisition, and a reference written into the IMS remarks
       lets a retry find a requisition the IMS already created instead of creating it twice. */
    $id = (string)($input['id'] ?? '');
    if (!preg_match('/^[a-zA-Z0-9_-]{1,96}$/', $id)) reject('Invalid requisition.');
    txBegin();
    $doc = document('material_requisitions', $id, true);
    if (!$doc) { txRollback(); reject('Requisition not found.', 404); }
    if (!empty($doc['ims_id'])) { txCommit(); reply(['id' => $doc['ims_id'], 'requestNo' => $doc['no'] ?? '', 'already' => true]); }
    if (($doc['status'] ?? '') === 'Canceled') { txRollback(); reject('This requisition is canceled.'); }
    if (!empty($doc['sending_at']) && strtotime((string)$doc['sending_at']) > time() - 120) { txRollback(); reject('This requisition is already being sent. Wait a moment and refresh.', 409); }
    $tried = !empty($doc['send_attempts']);
    $doc['sending_at'] = gmdate('c'); $doc['send_attempts'] = (int)($doc['send_attempts'] ?? 0) + 1; mrSave($id, $doc);
    txCommit();
    $ref = 'Umang System ref ' . $id;
    $found = null;
    if ($tried) foreach (imsList('/api/material-requests', 'requests') as $r) if (str_contains((string)($r['remarks'] ?? ''), $ref)) { $found = ['id' => (string)$r['id'], 'requestNo' => (string)($r['request_no'] ?? $r['requestNo'] ?? '')]; break; }
    if (!$found) {
        $p = is_array($doc['ims_ref'] ?? null) ? $doc['ims_ref'] : [];
        $items = [];
        foreach ((array)($p['items'] ?? []) as $it) { $iid = trim((string)($it['itemId'] ?? '')); $q = (float)($it['quantity'] ?? 0); if ($iid !== '' && is_finite($q) && $q > 0) $items[] = ['itemId' => $iid, 'quantity' => $q, 'specification' => mb_substr(trim((string)($it['specification'] ?? '')), 0, 1000)]; }
        $type = ($p['requestByType'] ?? '') === 'Vendor' ? 'Vendor' : 'Inhouse';
        $s = fn($k) => ($v = trim((string)($p[$k] ?? ''))) === '' ? null : mb_substr($v, 0, 255);
        $remarks = trim((string)($p['remarks'] ?? '')); $remarks = ($remarks !== '' ? $remarks . "\n" : '') . '[' . $ref . ']';
        $body = ['date' => $s('date'), 'firmId' => $s('firmId'), 'storeId' => $s('storeId'), 'department' => $s('department'), 'customerId' => $s('customerId'), 'projectId' => $s('projectId'), 'requestByType' => $type,
            'requestByUserId' => $type === 'Inhouse' ? $s('requestByUserId') : null, 'requestBySupplierId' => $type === 'Vendor' ? $s('requestBySupplierId') : null, 'enteredByUserId' => $s('enteredByUserId'), 'remarks' => $remarks, 'items' => $items];
        $IMS_SOFT = true;
        try { $r = imsCall('POST', '/api/material-requests', $body); }
        catch (Throwable $e) { $d = document('material_requisitions', $id); if ($d) { unset($d['sending_at']); $d['send_error'] = $e->getMessage(); mrSave($id, $d); } reject($e->getMessage() . ' It is saved here; press Send again later. It will not be duplicated.', 502, 'ims_error'); }
        $IMS_SOFT = false;
        $found = ['id' => (string)($r['request']['id'] ?? ''), 'requestNo' => (string)($r['request']['requestNo'] ?? '')];
    }
    $d = document('material_requisitions', $id) ?? $doc;
    unset($d['sending_at'], $d['send_error']);
    if ($found['id'] === '') { $d['send_error'] = 'The Inventory system did not confirm it.'; mrSave($id, $d); reject('The Inventory system did not confirm the requisition. Press Send again; it will not be duplicated.', 502, 'ims_error'); }
    $d['ims_id'] = $found['id']; $d['no'] = $found['requestNo']; $d['status'] = 'Pending'; $d['sent_at'] = gmdate('c');
    mrSave($id, $d);
    reply($found);
}
if ($cmd === 'status') {
    // Status and issued quantities from the IMS; anything no longer pending there is closed.
    $ids = array_values(array_filter(array_map('strval', (array)($input['ids'] ?? []))));
    $pending = imsList('/api/material-requests/pending', 'requests'); $all = imsList('/api/material-requests', 'requests');
    $byId = [];
    foreach ($all as $r) $byId[(string)($r['id'] ?? '')] = ['status' => (string)($r['status'] ?? '')];
    foreach ($pending as $r) { $rid = (string)($r['id'] ?? ''); if (!isset($byId[$rid])) $byId[$rid] = ['status' => 'Pending']; $byId[$rid]['items'] = array_map(fn($i) => ['itemId' => (string)($i['item_id'] ?? $i['itemId'] ?? ''), 'issued' => (float)($i['issued_quantity'] ?? $i['issuedQuantity'] ?? 0)], (array)($r['items'] ?? [])); }
    $out = []; foreach ($ids as $rid) $out[$rid] = $byId[$rid] ?? ['status' => 'Not found'];
    reply(['status' => $out]);
}
reject('Unknown Inventory command.');
