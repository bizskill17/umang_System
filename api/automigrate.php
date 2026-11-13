<?php
// One-time automatic master migration, run without a sign-in.
// migkey: the server's public key (the private key never leaves the private config folder).
// automigrate: decrypts api/migration/masters.enc with that private key, saves a backup of the current
//   masters to the private config folder, then clears and imports the masters. It runs only once.
if (!defined('UMANG_VENDOR_FINANCE')) { http_response_code(404); exit; }
require_once __DIR__ . '/migrate_lib.php';
$cfgDir = dirname(__DIR__, 2) . '/config';
$keyFile = $cfgDir . '/umang-migrate-key.pem';
if ($action === 'migkey') {
    if (!is_file($keyFile)) {
        $k = openssl_pkey_new(['private_key_bits' => 3072, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        if (!$k || !openssl_pkey_export($k, $pem)) reject('Could not make the migration key.', 500);
        file_put_contents($keyFile, $pem); @chmod($keyFile, 0600);
    }
    $priv = openssl_pkey_get_private((string)file_get_contents($keyFile));
    reply(['public_key' => openssl_pkey_get_details($priv)['key']]);
}
$flag = 'masters-auto-v1';
$done = query("SELECT body FROM umang_documents WHERE collection_path='_migrations' AND id=?", [$flag])->fetchColumn();
if ($done !== false) reply(['done' => true, 'already' => true, 'run' => json_decode($done, true)]);
$enc = __DIR__ . '/migration/masters.enc';
if (!is_file($enc) || !is_file($keyFile)) reply(['done' => false, 'waiting' => 'No migration file on the server.']);
$box = json_decode((string)file_get_contents($enc), true);
$priv = openssl_pkey_get_private((string)file_get_contents($keyFile));
if (!is_array($box) || !$priv || !openssl_private_decrypt(base64_decode((string)$box['key']), $aes, $priv, OPENSSL_PKCS1_OAEP_PADDING)) reject('The migration file could not be opened.', 500);
$plain = openssl_decrypt(base64_decode((string)$box['data']), 'aes-256-gcm', $aes, OPENSSL_RAW_DATA, base64_decode((string)$box['iv']), base64_decode((string)$box['tag']));
$pkg = $plain === false ? null : json_decode((string)gzdecode($plain), true);
if (!is_array($pkg) || ($pkg['kind'] ?? '') !== 'umang-master-import') reject('The migration file is damaged.', 500);
// Backup of every master as it is now, kept in the private config folder.
$out = [];
foreach (query("SELECT collection_path,id,body FROM umang_documents WHERE collection_path LIKE 'masters/%' ORDER BY collection_path,id")->fetchAll(PDO::FETCH_ASSOC) as $r) $out[$r['collection_path']][] = ['id' => $r['id'], 'data' => json_decode($r['body'], true)];
$backup = $cfgDir . '/umang-masters-backup-' . gmdate('Ymd-His') . '.json';
if (file_put_contents($backup, json_encode(['kind' => 'umang-master-backup', 'at' => gmdate('c'), 'masters' => $out], JSON_UNESCAPED_UNICODE)) === false) reject('Could not save the backup, so nothing was changed.', 500);
@chmod($backup, 0600);
try { $result = migImport($pkg, true, ''); }
catch (Throwable $e) { reject('The import failed and nothing was changed: ' . $e->getMessage(), 500); }
$run = ['at' => gmdate('c'), 'backup' => basename($backup), 'result' => $result];
query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?)', ['_migrations', $flag, json_encode($run)]);
reply(['done' => true, 'run' => $run]);
