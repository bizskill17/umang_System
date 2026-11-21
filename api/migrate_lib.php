<?php
// Shared master import: optionally clears masters, then writes the package rows in one transaction.
if (!defined('UMANG_VENDOR_FINANCE')) { http_response_code(404); exit; }
const MIG_MASTERS = ['firm','customers','vendors','customer-category','customer-subcategory','state','city','lead-category','lead-subcategory','lead-sources','lost-reasons','complaint-types','send-mode','users','user-roles','designation','user-document-types','items','uom','gst','machines','materials','stores','delivery-modes','transporters','vehicles'];
function migCount(string $path): int { return (int)query('SELECT COUNT(*) FROM umang_documents WHERE collection_path=?', [$path])->fetchColumn(); }
function migImport(array $pkg, bool $doClear, string $me): array {
    $masters = MIG_MASTERS; $input = ['clear' => $doClear];
    $clear = array_values(array_intersect((array)($pkg['clear'] ?? []), $masters));
    if (array_intersect($clear, ['firm','items','uom','gst','user-roles'])) throw new RuntimeException('Firm, Items, UOM, GST and User Roles are never cleared by an import.');
    $keepNames = array_map(fn($n) => strtolower(trim((string)$n)), (array)($pkg['keep_users'] ?? []));
    $now = gmdate('Y-m-d\TH:i:s\Z');
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
    } catch (Throwable $e) { txRollback(); error_log('Umang master import: ' . $e->getMessage()); throw $e; }
    return $result;
}

// Records import (leads, quotations, projects, jobs …). Master links are given as "@ref:<master>:<old sheet id>"
// or "@name:<master>:<name>" and are looked up here from the legacy_ids / names already in the app.
const MIG_DATA_PATH = '/^(leads|quotations|quote_followups|projects|recce|recce_updates|designs|design_updates|jobs|job_assign|qc|dispatches|wastage|invoices|payments|complaints|complaint_updates|leads\/[A-Za-z0-9_-]{1,96}\/followups|masters\/customers\/rows|masters\/(?:users|state|city|customer-category|customer-subcategory|designation|lead-category|lead-sources|lead-subcategory|vendors|machines|vehicles)\/rows)$/';
const MIG_DATA_CLEAR = ['leads','leads/%/followups','quotations','quote_followups','projects','recce','recce_updates','designs','design_updates','jobs','job_assign','qc','dispatches','wastage','invoices','payments','complaints','complaint_updates'];
function migDataBackup(array $pkg, string $file): void {
    $out = [];
    $pr = [];
    foreach ((array)($pkg['prune'] ?? []) as $pp => $cfg) { $pr[] = (string)$pp; foreach (array_keys((array)($cfg['children'] ?? [])) as $cp) $pr[] = (string)$cp; }
    foreach (array_unique(array_merge((array)($pkg['clear'] ?? []), array_keys((array)$pkg['rows']), $pr)) as $p) {
        $op = strpos($p, '%') !== false ? 'LIKE' : '=';
        foreach (query("SELECT collection_path,id,body FROM umang_documents WHERE collection_path $op ?", [$p])->fetchAll(PDO::FETCH_ASSOC) as $r) $out[$r['collection_path']][] = ['id' => $r['id'], 'data' => json_decode($r['body'], true)];
    }
    if (file_put_contents($file, json_encode(['kind' => 'umang-data-backup', 'phase' => $pkg['phase'] ?? '', 'at' => gmdate('c'), 'records' => $out], JSON_UNESCAPED_UNICODE)) === false) throw new RuntimeException('Could not save the backup, so nothing was changed.');
    @chmod($file, 0600);
}
function migData(array $pkg): array {
    if (($pkg['kind'] ?? '') !== 'umang-data-import' || !is_array($pkg['rows'] ?? null)) throw new RuntimeException('This is not a records import file.');
    foreach (array_keys($pkg['rows']) as $p) if (!preg_match(MIG_DATA_PATH, (string)$p)) throw new RuntimeException('Records for "' . $p . '" can’t be imported.');
    $clear = array_values(array_intersect((array)($pkg['clear'] ?? []), MIG_DATA_CLEAR));
    $idx = []; $miss = [];
    $index = function (string $c) use (&$idx) {
        if (isset($idx[$c])) return $idx[$c];
        $m = ['ref' => [], 'name' => [], 'namecat' => []];
        foreach (query('SELECT id,body FROM umang_documents WHERE collection_path=?', ['masters/' . $c . '/rows'])->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $b = json_decode($r['body'], true) ?: [];
            foreach ((array)($b['legacy_ids'] ?? []) as $l) { $l = (string)$l; $m['ref'][$l] = $r['id']; if (preg_match('/^(\d+)\.0$/', $l, $x)) $m['ref'][$x[1]] = $r['id']; }
            $n = strtolower(preg_replace('/\s+/', ' ', trim((string)($b['name'] ?? '')))); if ($n !== '' && !isset($m['name'][$n])) $m['name'][$n] = $r['id'];
            $e = strtolower(trim((string)($b['email'] ?? ''))); if ($e !== '' && !isset($m['name'][$e])) $m['name'][$e] = $r['id'];
            if ($c === 'lead-subcategory' && $n !== '') $m['namecat'][$n . '|' . (string)($b['lead_category_id'] ?? '')] = $r['id'];
        }
        return $idx[$c] = $m;
    };
    $resolve = function ($v) use (&$resolve, $index, &$miss) {
        if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = $resolve($x); return $v; }
        if (!is_string($v) || ($v[0] ?? '') !== '@' || !preg_match('/^@(ref|name):([a-z-]+):(.*)$/s', $v, $m)) return $v;
        $ix = $index($m[2]); $nk = strtolower(preg_replace('/\s+/', ' ', trim($m[3]))); $key = $m[1] === 'ref' ? $m[3] : $nk;
        $hit = $ix[$m[1]][$key] ?? ($m[1] === 'ref' ? ($ix['name'][$nk] ?? null) : null);
        if ($hit === null) { $k = $m[2] . ':' . $m[3]; $miss[$k] = ($miss[$k] ?? 0) + 1; return ''; }
        return $hit;
    };
    $now = gmdate('Y-m-d\TH:i:s\Z'); $result = ['cleared' => [], 'added' => [], 'unresolved' => []];
    txBegin();
    try {
        foreach ($clear as $p) {
            $op = strpos($p, '%') !== false ? 'LIKE' : '=';
            $result['cleared'][$p] = (int)query("SELECT COUNT(*) FROM umang_documents WHERE collection_path $op ?", [$p])->fetchColumn();
            query("DELETE FROM umang_documents WHERE collection_path $op ?", [$p]);
        }
        foreach ($pkg['rows'] as $p => $rows) {
            $n = 0;
            foreach ((array)$rows as $row) {
                if (!is_array($row) || !preg_match('/^[a-zA-Z0-9_-]{1,96}$/', (string)($row['id'] ?? ''))) continue;
                $id = (string)$row['id']; unset($row['id']);
                if (preg_match('#^masters/([a-z-]+)/rows$#', (string)$p, $mc) && $mc[1] !== 'customers') {
                    // New entries only: an existing one (same old ID, name or email) is never changed, so passwords, roles and edits stay as they are.
                    $ux = $index($mc[1]); $seen = $id !== '' && document($p, $id) !== null;
                    foreach ((array)($row['legacy_ids'] ?? []) as $l) if (isset($ux['ref'][(string)$l])) $seen = true;
                    // A lead sub-category may share its name with one under a different lead category.
                    if ($mc[1] === 'lead-subcategory') { $nk = strtolower(preg_replace('/\s+/', ' ', trim((string)($row['name'] ?? '')))); if ($nk !== '' && isset($ux['namecat'][$nk . '|' . (string)($row['lead_category_id'] ?? '')])) $seen = true; }
                    else foreach ([(string)($row['name'] ?? ''), (string)($row['email'] ?? '')] as $nk) { $nk = strtolower(preg_replace('/\s+/', ' ', trim($nk))); if ($nk !== '' && isset($ux['name'][$nk])) $seen = true; }
                    if ($seen) { $result['skipped'][$p] = ($result['skipped'][$p] ?? 0) + 1; continue; }
                    if ($mc[1] === 'users') $row = array_intersect_key($row, array_flip(['name', 'email', 'mobile', 'designation_id', 'legacy_ids', 'status']));
                    else unset($row['pw_hash'], $row['pw_salt']);
                }
                $row = $resolve($row); $row['imported_at'] = $now;
                query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', [$p, $id, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
                $n++;
            }
            if (preg_match('#^masters/([a-z-]+)/rows$#', (string)$p, $mm)) unset($idx[$mm[1]]);
            $k = preg_match('#^leads/.+/followups$#', $p) ? 'lead followups' : $p;
            $result['added'][$k] = ($result['added'][$k] ?? 0) + $n;
        }
        // Prune: remove records of a collection that are not in the sheets (records added directly in the app),
        // with their child records. Stops, changing nothing, if more than "max" would go.
        foreach ((array)($pkg['prune'] ?? []) as $pp => $cfg) {
            $pp = (string)$pp; if (!in_array($pp, MIG_DATA_CLEAR, true) || strpos($pp, '%') !== false) throw new RuntimeException('Records for "' . $pp . '" can’t be pruned.');
            $keep = array_flip(array_map('strval', (array)($cfg['keep'] ?? []))); $max = (int)($cfg['max'] ?? 0);
            if (count($keep) < 1) throw new RuntimeException('Nothing to keep was given, so nothing was removed.');
            $gone = [];
            foreach (query('SELECT id FROM umang_documents WHERE collection_path=?', [$pp])->fetchAll(PDO::FETCH_COLUMN) as $id) if (!isset($keep[(string)$id])) $gone[] = (string)$id;
            if (count($gone) > $max) throw new RuntimeException(count($gone) . ' ' . $pp . ' records are not in the sheets, more than the ' . $max . ' allowed, so nothing was removed.');
            $info = [];
            foreach ($gone as $id) {
                $doc = document($pp, $id) ?: [];
                $info[] = ['id' => $id, 'no' => (string)($doc['no'] ?? ''), 'date' => (string)($doc['date'] ?? ''), 'units' => $doc['units'] ?? null];
                query('DELETE FROM umang_documents WHERE collection_path=? AND id=?', [$pp, $id]);
                foreach ((array)($cfg['children'] ?? []) as $cp => $field) {
                    if (!in_array((string)$cp, MIG_DATA_CLEAR, true)) continue;
                    foreach (query('SELECT id,body FROM umang_documents WHERE collection_path=?', [(string)$cp])->fetchAll(PDO::FETCH_ASSOC) as $c) {
                        $cb = json_decode($c['body'], true) ?: [];
                        if ((string)($cb[(string)$field] ?? '') === $id) { query('DELETE FROM umang_documents WHERE collection_path=? AND id=?', [(string)$cp, $c['id']]); $result['removed'][(string)$cp] = ($result['removed'][(string)$cp] ?? 0) + 1; }
                    }
                }
            }
            $result['removed'][$pp] = ($result['removed'][$pp] ?? 0) + count($gone); $result['removed_list'][$pp] = $info;
        }
        arsort($miss); $result['unresolved'] = array_slice($miss, 0, 40, true);
        txCommit();
    } catch (Throwable $e) { txRollback(); error_log('Umang data import: ' . $e->getMessage()); throw $e; }
    return $result;
}
