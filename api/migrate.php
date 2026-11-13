<?php
// Data Migration: backs up and replaces master data from a prepared import file (owner or Admin role only).
// cmd=status  counts of masters and of the records that point at them
// cmd=backup  every master row, for download before an import
// cmd=import  optionally clears the listed masters, then writes the file's rows in one transaction
if (!defined('UMANG_VENDOR_FINANCE')) { http_response_code(404); exit; }
if ($action !== 'migrate') return;
if (!canManageUsers()) reject('Only the administrator can migrate data.', 403);
$cmd = (string)($input['cmd'] ?? '');
function migCount(string $path): int { return (int)query('SELECT COUNT(*) FROM umang_documents WHERE collection_path=?', [$path])->fetchColumn(); }
if ($cmd === 'status') {
    $m = []; foreach ($masters as $k) $m[$k] = migCount('masters/' . $k . '/rows');
    $t = []; foreach (['leads','quotations','projects','recce','designs','jobs','dispatches','invoices','complaints','work_orders','material_requisitions'] as $k) $t[$k] = migCount($k);
    reply(['masters' => $m, 'records' => $t]);
}
if ($cmd === 'backup') {
    $out = [];
    foreach (query("SELECT collection_path,id,body FROM umang_documents WHERE collection_path LIKE 'masters/%' ORDER BY collection_path,id")->fetchAll(PDO::FETCH_ASSOC) as $r) $out[$r['collection_path']][] = ['id' => $r['id'], 'data' => json_decode($r['body'], true)];
    reply(['kind' => 'umang-master-backup', 'at' => gmdate('c'), 'masters' => $out]);
}
if ($cmd !== 'import') reject('Unknown migration command.');
$pkg = $input['pkg'] ?? null;
if (!is_array($pkg) || ($pkg['kind'] ?? '') !== 'umang-master-import' || !is_array($pkg['rows'] ?? null)) reject('This is not a master import file.');
$clear = array_values(array_intersect((array)($pkg['clear'] ?? []), $masters));
if (array_intersect($clear, ['firm','items','uom','gst','user-roles'])) reject('Firm, Items, UOM, GST and User Roles are never cleared by an import.');
if (!empty($input['clear']) && ($input['confirm'] ?? '') !== 'CLEAR') reject('Type CLEAR to confirm clearing the masters.');
$keepNames = array_map(fn($n) => strtolower(trim((string)$n)), (array)($pkg['keep_users'] ?? []));
$now = gmdate('Y-m-d\TH:i:s\Z'); $me = (string)($user['id'] ?? '');
$result = ['cleared' => [], 'added' => [], 'kept' => []];
txBegin();
try {
    // Users to keep: the named ones and whoever is running the import.
    $keepUsers = [];
    foreach (query("SELECT id,body FROM umang_documents WHERE collection_path='masters/users/rows'")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $b = json_decode($r['body'], true);
        if ($r['id'] === $me || in_array(strtolower(trim((string)($b['name'] ?? ''))), $keepNames, true)) $keepUsers[strtolower(trim((string)($b['name'] ?? '')))] = ['id' => $r['id'], 'body' => $b];
    }
    if (!empty($input['clear'])) foreach ($clear as $k) {
        $path = 'masters/' . $k . '/rows';
        if ($k === 'users') {
            $ids = array_column($keepUsers, 'id');
            $st = query("SELECT id FROM umang_documents WHERE collection_path=?", [$path])->fetchAll(PDO::FETCH_COLUMN);
            $del = array_values(array_diff($st, $ids));
            foreach (array_chunk($del, 200) as $c) query('DELETE FROM umang_documents WHERE collection_path=? AND id IN (' . implode(',', array_fill(0, count($c), '?')) . ')', array_merge([$path], $c));
            $result['cleared'][$k] = count($del);
        } else { $result['cleared'][$k] = migCount($path); query('DELETE FROM umang_documents WHERE collection_path=?', [$path]); }
    }
    $firms = [];
    foreach (query("SELECT id,body FROM umang_documents WHERE collection_path='masters/firm/rows'")->fetchAll(PDO::FETCH_ASSOC) as $r) { $b = json_decode($r['body'], true); $firms[strtolower(trim((string)($b['name'] ?? '')))] = ['id' => $r['id'], 'body' => $b]; }
    $userMap = [];
    foreach ($pkg['rows'] as $k => $rows) {
        if (!in_array($k, $masters, true) || !is_array($rows)) continue;
        $path = 'masters/' . $k . '/rows'; $n = 0;
        foreach ($rows as $row) {
            if (!is_array($row) || !preg_match('/^[a-zA-Z0-9_-]{1,96}$/', (string)($row['id'] ?? ''))) continue;
            $id = (string)$row['id']; unset($row['id']);
            $row = array_merge($row, ['rec_by' => $me, 'rec_at' => $now, 'imported_at' => $now]);
            if ($k === 'firm' && isset($firms[strtolower(trim((string)$row['name']))])) {
                // Existing firm: keep it (logo, terms, bank details, short name), fill blanks, remember the sheet IDs.
                $f = $firms[strtolower(trim((string)$row['name']))]; $b = $f['body'];
                foreach (['cin','gst','address'] as $x) if (trim((string)($b[$x] ?? '')) === '' && !empty($row[$x])) $b[$x] = $row[$x];
                $b['legacy_ids'] = array_values(array_unique(array_merge((array)($b['legacy_ids'] ?? []), (array)$row['legacy_ids'])));
                query('UPDATE umang_documents SET body=? WHERE collection_path=? AND id=?', [json_encode($b, JSON_UNESCAPED_UNICODE), $path, $f['id']]);
                $result['kept']['firm'] = ($result['kept']['firm'] ?? 0) + 1; continue;
            }
            if ($k === 'users') {
                $nm = strtolower(trim((string)($row['name'] ?? '')));
                if (isset($keepUsers[$nm])) {
                    $u = $keepUsers[$nm]; $b = $u['body'];
                    foreach (['mobile','designation_id'] as $x) if (trim((string)($b[$x] ?? '')) === '' && !empty($row[$x])) $b[$x] = $row[$x];
                    $b['legacy_ids'] = array_values(array_unique(array_merge((array)($b['legacy_ids'] ?? []), (array)$row['legacy_ids'])));
                    query('UPDATE umang_documents SET body=? WHERE collection_path=? AND id=?', [json_encode($b, JSON_UNESCAPED_UNICODE), $path, $u['id']]);
                    $result['kept']['users'] = ($result['kept']['users'] ?? 0) + 1; continue;
                }
                unset($row['keep_existing']); $row['pw_hash'] = ''; $row['pw_salt'] = '';
                if (($row['email'] ?? '') !== '') { // an email already on a kept account stays with that account
                    foreach ($keepUsers as $ku) if (strcasecmp((string)($ku['body']['email'] ?? ''), (string)$row['email']) === 0) $row['email'] = '';
                }
            }
            query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', [$path, $id, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            $n++;
        }
        $result['added'][$k] = $n;
    }
    query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', ['_migrations', 'masters-import-' . gmdate('YmdHis'), json_encode(['at' => $now, 'by' => $me, 'built' => $pkg['built'] ?? '', 'result' => $result])]);
    txCommit();
} catch (Throwable $e) { txRollback(); error_log('Umang master import: ' . $e->getMessage()); reject('The import failed and nothing was changed: ' . $e->getMessage(), 500); }
reply(['ok' => true, 'result' => $result]);
