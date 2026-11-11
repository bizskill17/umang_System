<?php
/* Bridge to the Umang Inventory Management System (IMS): reads its masters for the
   Material Requisition form, sends requisitions to it and reads their status back. */
if (!defined('UMANG_VENDOR_FINANCE')) exit;
if ($action !== 'ims') return;
if (!$user) reject('Sign in first.', 401, 'unauthenticated');
$allowed = $user['allowed_views'] ?? null;
if (empty($user['owner']) && is_array($allowed) && !array_filter($allowed, fn($v) => is_string($v) && str_starts_with($v, 'requisition.'))) reject('You do not have access to Material Requisition.', 403);
$imsBase = rtrim((string)($config['ims_url'] ?? 'https://ims.umangcommunications.com'), '/');

function imsCall(string $method, string $path, ?array $body = null): array {
    global $imsBase;
    $headers = ['Accept: application/json'];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    if (function_exists('curl_init')) {
        $ch = curl_init($imsBase . $path);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
        if ($raw === false) reject('Cannot reach the Inventory system: ' . $err, 502, 'unavailable');
    } else {
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : '', 'timeout' => 40, 'ignore_errors' => true]]);
        $raw = @file_get_contents($imsBase . $path, false, $ctx);
        if ($raw === false) reject('Cannot reach the Inventory system.', 502, 'unavailable');
        $code = 200; foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
    }
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) reject('The Inventory system sent an unexpected reply.', 502, 'unavailable');
    if ($code >= 400 || isset($data['error'])) reject('Inventory system: ' . (string)($data['error'] ?? ('error ' . $code)), 502, 'ims_error');
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
// Only master data is read from the IMS for now; nothing is written to it.
reject('Unknown Inventory command.');
