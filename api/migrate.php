<?php
// Data Migration: backs up and replaces master data from a prepared import file (owner or Admin role only).
// cmd=status  counts of masters and of the records that point at them
// cmd=backup  every master row, for download before an import
// cmd=import  optionally clears the listed masters, then writes the file's rows in one transaction
if (!defined('UMANG_VENDOR_FINANCE')) { http_response_code(404); exit; }
if ($action !== 'migrate') return;
if (!canManageUsers()) reject('Only the administrator can migrate data.', 403);
$cmd = (string)($input['cmd'] ?? '');
require_once __DIR__ . '/migrate_lib.php';
if ($cmd === 'status') {
    $m = []; foreach ($masters as $k) $m[$k] = migCount('masters/' . $k . '/rows');
    $t = []; foreach (['leads','quotations','projects','recce','designs','jobs','dispatches','invoices','complaints','work_orders','material_requisitions'] as $k) $t[$k] = migCount($k);
    $auto = query("SELECT body FROM umang_documents WHERE collection_path='_migrations' AND id='masters-auto-v1'")->fetchColumn();
    reply(['masters' => $m, 'records' => $t, 'auto' => $auto === false ? null : json_decode($auto, true)]);
}
if ($cmd === 'backup') {
    $out = [];
    foreach (query("SELECT collection_path,id,body FROM umang_documents WHERE collection_path LIKE 'masters/%' ORDER BY collection_path,id")->fetchAll(PDO::FETCH_ASSOC) as $r) $out[$r['collection_path']][] = ['id' => $r['id'], 'data' => json_decode($r['body'], true)];
    reply(['kind' => 'umang-master-backup', 'at' => gmdate('c'), 'masters' => $out]);
}
if ($cmd !== 'import') reject('Unknown migration command.');
$pkg = $input['pkg'] ?? null;
if (!is_array($pkg) || ($pkg['kind'] ?? '') !== 'umang-master-import' || !is_array($pkg['rows'] ?? null)) reject('This is not a master import file.');
if (!empty($input['clear']) && ($input['confirm'] ?? '') !== 'CLEAR') reject('Type CLEAR to confirm clearing the masters.');
try { $result = migImport($pkg, !empty($input['clear']), (string)($user['id'] ?? '')); }
catch (Throwable $e) { reject('The import failed and nothing was changed: ' . $e->getMessage(), $e instanceof RuntimeException ? 400 : 500); }
reply(['ok' => true, 'result' => $result]);
