<?php
/** Umang Hostinger API. Configuration and uploaded files live outside public_html. */
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
function reply(array $value, int $status = 200): void {
    http_response_code($status);
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function reject(string $message, int $status = 400, string $code = 'invalid_argument'): void {
    reply(['error' => ['msg' => $message, 'code' => $code]], $status);
}
set_exception_handler(function (Throwable $e): void {
    // Do not return credentials, SQL, paths or driver diagnostics to the browser.
    $detail = get_class($e);
    if ($e instanceof PDOException) {
        // Log diagnostic codes only; exception messages can contain SQL or private values.
        $sqlState = preg_replace('/[^A-Za-z0-9]/', '', (string)$e->getCode());
        $driverCode = $e->errorInfo[1] ?? null;
        $detail .= ' SQLSTATE=' . ($sqlState !== '' ? $sqlState : 'unknown')
            . ' driver_code=' . (is_numeric($driverCode) ? (string)(int)$driverCode : 'unknown');
    }
    error_log('Umang API failure: ' . $detail);
    // Safe, credential-free hints for the most common setup mistakes.
    $hint = 'Check the private configuration and hosting error log.';
    if ($e instanceof PDOException) {
        $code = (int)($e->errorInfo[1] ?? 0);
        if (!$code && preg_match('/\[(\d{4})\]/', (string)$e->getMessage(), $m)) $code = (int)$m[1];
        $hints = [
            1045 => 'MySQL refused the user name or password in config/database.php. In Hostinger > Databases, confirm the MySQL user name and reset its password, then put the same password in config/database.php.',
            1044 => 'The MySQL user is not allowed to use this database. In Hostinger > Databases, make sure the user belongs to the database named in config/database.php.',
            1049 => 'The database name in config/database.php does not exist. Copy the exact name from Hostinger > Databases.',
            1142 => 'The MySQL user lacks permission to create or change tables. Give it full privileges on this database in Hostinger.',
            1227 => 'The MySQL user lacks a required privilege. Give it full privileges on this database in Hostinger.',
            2002 => 'The database server could not be reached. Use host "localhost" in config/database.php.',
            2005 => 'The database host name is wrong. Use host "localhost" in config/database.php.',
        ];
        if ($code === 1226 && preg_match("/'(max_[a-z_]+)' resource \\(current value: (\\d+)\\)/", (string)$e->getMessage(), $r)) {
            $names = ['max_questions' => 'queries per hour', 'max_updates' => 'updates per hour', 'max_connections_per_hour' => 'connections per hour', 'max_user_connections' => 'open connections'];
            $hint = 'The hosting limit of ' . $r[2] . ' MySQL ' . ($names[$r[1]] ?? $r[1]) . ' was reached. It resets within the hour, or Hostinger support can reset it now.';
        }
        if (isset($hints[$code])) $hint = $hints[$code] . ' (MySQL error ' . $code . ')';
        elseif ($code === 1226 && !empty($r)) $hint .= ' (MySQL error 1226, ' . $r[1] . ')';
        elseif ($code && $code !== 1226) $hint .= ' (MySQL error ' . $code . ')';
        elseif ($code === 1226 && empty($r)) $hint .= ' (MySQL error 1226)';
    }
    reject('Database service unavailable. ' . $hint, 503, 'unavailable');
});
$configFile = dirname(__DIR__, 2) . '/config/database.php';
if (!is_file($configFile)) {
    $configDir = dirname($configFile);
    if (!is_dir($configDir) && !@mkdir($configDir, 0700, true) && !is_dir($configDir)) {
        reject('Setup required: hosting permissions prevent creating the private config folder. Create config/database.php alongside public_html.', 503, 'not_configured');
    }
    // Exclusive creation preserves any configuration already saved by the owner.
    $previousMask = umask(0077);
    $handle = @fopen($configFile, 'x');
    umask($previousMask);
    if ($handle !== false) {
        $template = <<<'CONFIG'
<?php
return [
    'host' => 'localhost',
    'port' => 3306,
    'database' => 'u299994438_system_umang',
    'username' => 'u299994438_system_umang',
    'password' => 'REPLACE_DATABASE_PASSWORD',
    'admin_username' => 'admin',
    'admin_password' => 'REPLACE_WITH_UNIQUE_PASSWORD_AT_LEAST_12_CHARACTERS',
];
CONFIG;
        $written = fwrite($handle, $template . "\n");
        fclose($handle);
        if ($written !== strlen($template) + 1) {
            @unlink($configFile);
            reject('Could not create the private configuration file. Check hosting storage and permissions.', 503, 'not_configured');
        }
    }
    if (!is_file($configFile)) reject('Setup required: hosting permissions prevent creating config/database.php alongside public_html.', 503, 'not_configured');
}
$config = require $configFile;
if (!is_array($config)) reject('The private database configuration must return an array.', 503, 'not_configured');
foreach (['host', 'database', 'username', 'password', 'admin_username'] as $key) {
    if (empty($config[$key]) || str_contains((string)$config[$key], 'REPLACE_')) reject('Complete the private database configuration before signing in.', 503, 'not_configured');
}
$adminHash = (string)($config['admin_password_hash'] ?? '');
$adminPassword = (string)($config['admin_password'] ?? '');
if (!$adminHash && (strlen($adminPassword) < 12 || str_contains($adminPassword, 'REPLACE_'))) reject('Set a private administrator password of at least 12 characters.', 503, 'not_configured');
if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '259200');
    session_name('umang_server');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
$action = (string)($_GET['action'] ?? 'session');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$readActions = ['session', 'list', 'get', 'blob', 'batch'];
if (($method === 'GET' && !in_array($action, $readActions, true)) || !in_array($method, ['GET', 'POST'], true)) reject('Method not allowed.', 405);
$input = [];
if ($method === 'POST') {
    if (!hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) reject('Session expired. Reload the page.', 403, 'csrf');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '')) reject('Cross-origin requests are not allowed.', 403);
    if ($action !== 'upload') {
        $raw = file_get_contents('php://input');
        if (strlen($raw) > 2 * 1024 * 1024) reject('The record is too large.', 413, 'too_large');
        try { $input = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); } catch (JsonException $e) { reject('Invalid JSON.'); }
        if (!is_array($input)) reject('Invalid request.');
    }
}
$port = filter_var($config['port'] ?? 3306, FILTER_VALIDATE_INT);
if (!$port || !preg_match('/^[a-zA-Z0-9_.-]+$/', (string)$config['host']) || !preg_match('/^[a-zA-Z0-9_]+$/', (string)$config['database'])) reject('Invalid database host, port or name.', 503, 'not_configured');
/* Connect only when a request actually reads or writes data (lazy), and reuse connections:
   shared hosting caps MySQL connections and queries per hour. */
function db(): PDO {
    static $pdo = null;
    global $config, $port;
    if ($pdo) return $pdo;
    $pdo = new PDO('mysql:host=' . $config['host'] . ';port=' . $port . ';dbname=' . $config['database'] . ';charset=utf8mb4', $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_PERSISTENT => true]);
    // A reused connection may carry an unfinished transaction from an aborted request.
    if ($pdo->inTransaction()) $pdo->rollBack();
    $schemaKey = hash('sha256', $config['host'] . ':' . $config['database']);
    if (($_SESSION['schema'] ?? '') !== $schemaKey) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS umang_documents (collection_path VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, id VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, body LONGTEXT NOT NULL, PRIMARY KEY(collection_path,id)) ENGINE=InnoDB');
        $pdo->exec('CREATE TABLE IF NOT EXISTS umang_leases (lease_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, holder VARCHAR(191) NOT NULL, expires_at DOUBLE NOT NULL) ENGINE=InnoDB');
        $pdo->exec('CREATE TABLE IF NOT EXISTS umang_files (id CHAR(32) PRIMARY KEY, name VARCHAR(255) NOT NULL, mime VARCHAR(100) NOT NULL, size INT NOT NULL, owner_id VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $pdo->exec('CREATE TABLE IF NOT EXISTS umang_login_limits (bucket CHAR(64) PRIMARY KEY, attempts INT NOT NULL, started_at BIGINT NOT NULL) ENGINE=InnoDB');
        $_SESSION['schema'] = $schemaKey;
    }
    return $pdo;
}
function query(string $sql, array $args = []): PDOStatement {
    $stmt = db()->prepare($sql); $stmt->execute($args); return $stmt;
}
function document(string $path, string $id, bool $lock = false): ?array {
    $raw = query('SELECT body FROM umang_documents WHERE collection_path=? AND id=?' . ($lock ? ' FOR UPDATE' : ''), [$path, $id])->fetchColumn();
    return $raw === false ? null : json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
}
function safeUser(array $body): array {
    $body['has_password'] = !empty($body['pw_hash']);
    unset($body['pw_hash'], $body['pw_salt']); return $body;
}
function actor(): ?array {
    global $config;
    if (empty($_SESSION['user']) || time() > ($_SESSION['expires'] ?? 0)) { unset($_SESSION['user']); return null; }
    $u = $_SESSION['user'];
    if (!empty($u['owner'])) return ['id' => 'server-owner', 'name' => 'Administrator', 'email' => $config['admin_username'], 'owner' => true, 'allowed_views' => null];
    $body = document('masters/users/rows', (string)$u['id']);
    if (!$body || ($body['status'] ?? '') === 'Inactive' || !hash_equals((string)($u['version'] ?? ''), hash('sha256', (string)($body['pw_hash'] ?? '')))) { unset($_SESSION['user']); return null; }
    return array_merge(safeUser($body), ['id' => $u['id'], 'owner' => false]);
}
$user = actor();
if ($action === 'session') reply(['user' => $user, 'csrf' => $_SESSION['csrf']]);
if ($action === 'login') {
    $name = trim((string)($input['username'] ?? '')); $password = (string)($input['password'] ?? '');
    if (strlen($name) > 255 || strlen($password) > 1024) reject('Invalid credentials.', 401, 'unauthenticated');
    $found = null;
    if (strcasecmp($name, (string)$config['admin_username']) === 0) {
        $valid = $adminHash ? password_verify($password, $adminHash) : hash_equals($adminPassword, $password);
        if ($valid) $found = ['id' => 'server-owner', 'owner' => true];
    } else {
        $rows = query("SELECT id,body FROM umang_documents WHERE collection_path='masters/users/rows'")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $body = json_decode($row['body'], true);
            if (strcasecmp($name, trim((string)($body['name'] ?? ''))) !== 0 && strcasecmp($name, trim((string)($body['email'] ?? ''))) !== 0) continue;
            if (($body['status'] ?? '') === 'Inactive' || empty($body['pw_hash'])) continue;
            $computed = hash_pbkdf2('sha256', $password, (string)($body['pw_salt'] ?? ''), 120000, 64);
            if (hash_equals((string)$body['pw_hash'], $computed)) $found = ['id' => $row['id'], 'owner' => false, 'version' => hash('sha256', $body['pw_hash'])];
        }
    }
    if (!$found) { usleep(200000); reject('Wrong user name or password.', 401, 'unauthenticated'); }
    session_regenerate_id(true); $_SESSION['user'] = $found;
    $life = !empty($input['remember']) ? 259200 : 43200; $_SESSION['expires'] = time()+$life;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    if (!empty($input['remember'])) setcookie(session_name(), session_id(), ['expires' => time()+$life, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
    reply(['user' => actor(), 'csrf' => $_SESSION['csrf']]);
}
if ($action === 'logout') { $_SESSION = []; session_destroy(); setcookie(session_name(), '', ['expires' => time()-3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']); reply(['ok' => true]); }
if (!$user) reject('Please sign in again.', 401, 'unauthenticated');
function permittedWrite(string $path): bool {
    global $user;
    if (!empty($user['owner'])) return true;
    // Screen permissions determine module write access; all signed-in users may read
    // shared records needed by linked forms. Password hashes are never returned.
    $allowed = $user['allowed_views'] ?? null;
    if (str_starts_with($path, 'masters/')) {
        $master = explode('/', $path)[1];
        if (in_array($master, ['users', 'user-roles'], true)) return false; // owner manages accounts
        return $allowed === null || in_array('master:m-' . $master, $allowed, true);
    }
    if ($path === 'access_requests') return false;
    if ($allowed === null) return true;
    $modules = [
        'leads' => ['leads'], 'quotations' => ['leads','quotations','projects'], 'quote_followups' => ['leads','quotations'],
        'projects' => ['projects'], 'recce' => ['recce','projects'], 'recce_updates' => ['recce'],
        'designs' => ['design','projects'], 'design_updates' => ['design'], 'jobs' => ['projects'],
        'job_assign' => ['projects'], 'qc' => ['projects'], 'dispatches' => ['projects'],
        'wastage' => ['projects'], 'invoices' => ['invoices'], 'payments' => ['invoices'], 'complaints' => ['complaints'], 'complaint_updates' => ['complaints']
    ];
    if ($path === 'projects' && in_array('leads.pending-create-project', $allowed, true)) return true;
    if ($path === 'counters') return count($allowed) > 0;
    $root = explode('/', $path)[0];
    foreach ($modules[$root] ?? [] as $module) foreach ($allowed as $view) if (str_starts_with($view, $module . '.')) return true;
    return false;
}
$privateStorage = dirname(__DIR__, 2) . '/config/umang-uploads';
if ($action === 'upload') {
    $view = (string)($_POST['view'] ?? '');
    $allowed = $user['allowed_views'] ?? null;
    if (empty($user['owner']) && ($view === '' || ($allowed !== null && !in_array($view, $allowed, true)))) reject('You do not have permission to upload here.', 403);
    $file = $_FILES['file'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) reject('Upload failed. Check the hosting upload limit.', 400, 'upload_failed');
    $size = filesize($file['tmp_name']);
    if ($size > 20*1024*1024 || $size < 1) reject('Files can be up to 20 MB.', 413, 'too_large');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!in_array($mime, ['application/pdf','image/jpeg','image/png','image/webp'], true)) reject('Use PDF, JPG, PNG or WebP.', 400, 'unsupported_type');
    if (!is_dir($privateStorage) && !mkdir($privateStorage, 0700, true)) throw new RuntimeException('storage');
    $id = bin2hex(random_bytes(16));
    if (!move_uploaded_file($file['tmp_name'], $privateStorage . '/' . $id)) throw new RuntimeException('upload');
    chmod($privateStorage . '/' . $id, 0600);
    try { query('INSERT INTO umang_files(id,name,mime,size,owner_id) VALUES(?,?,?,?,?)', [$id, mbSafeName((string)$file['name']), $mime, $size, $user['id']]); }
    catch (Throwable $e) { unlink($privateStorage . '/' . $id); throw $e; }
    reply(['id' => $id, 'contentType' => $mime]);
}
function mbSafeName(string $name): string { return substr(preg_replace('/[^\x20-\x7e]/', '_', basename($name)), 0, 240); }
if ($action === 'blob') {
    $id = (string)($_GET['id'] ?? ''); if (!preg_match('/^[a-f0-9]{32}$/', $id)) reject('File not found.', 404);
    $file = query('SELECT * FROM umang_files WHERE id=?', [$id])->fetch(PDO::FETCH_ASSOC);
    if (!$file || !is_file($privateStorage . '/' . $id)) reject('File not found.', 404);
    header('Content-Type: ' . $file['mime']); header('Content-Length: ' . $file['size']);
    header('Content-Disposition: inline; filename="' . addcslashes($file['name'], '"\\') . '"');
    header("Content-Security-Policy: sandbox"); session_write_close(); readfile($privateStorage . '/' . $id); exit;
}
$masters = ['firm','customers','vendors','customer-category','customer-subcategory','state','city','lead-category','lead-subcategory','lead-sources','send-mode','users','user-roles','designation','user-document-types','items','uom','gst','machines','delivery-modes','transporters','vehicles'];
$collections = ['leads','quotations','quote_followups','projects','recce','recce_updates','designs','design_updates','jobs','job_assign','qc','dispatches','wastage','invoices','payments','complaints','complaint_updates','counters','access_requests'];
function validPath(string $p): bool {
    global $collections, $masters;
    return in_array($p, $collections, true) || (preg_match('#^masters/([a-z-]+)/rows$#', $p, $m) && in_array($m[1], $masters, true)) || (bool)preg_match('#^leads/[a-zA-Z0-9_-]{1,96}/followups$#', $p);
}
function shapeDoc(string $p, array $body): array {
    global $user;
    if ($p === 'masters/users/rows') { $body = safeUser($body); if (empty($user['owner'])) $body = array_intersect_key($body, array_flip(['name','status','designation_id','signature'])); }
    return $body;
}
// One request (one connection, one query) returns several collections; keeps hosting connection limits low.
if ($action === 'batch') {
    $paths = array_values(array_unique(array_filter(explode(',', (string)($_GET['paths'] ?? '')), 'validPath')));
    if (count($paths) > 80) reject('Too many collections.');
    $out = []; foreach ($paths as $p) $out[$p] = [];
    if ($paths) {
        $rows = query('SELECT collection_path,id,body FROM umang_documents WHERE collection_path IN (' . implode(',', array_fill(0, count($paths), '?')) . ') ORDER BY collection_path,id', $paths)->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) $out[$row['collection_path']][] = ['id' => $row['id'], 'data' => shapeDoc($row['collection_path'], json_decode($row['body'], true, 64, JSON_THROW_ON_ERROR))];
    }
    reply(['lists' => $out]);
}
$path = (string)($input['path'] ?? $_GET['path'] ?? '');
if (!validPath($path)) reject('Unknown collection.');
$id = (string)($input['id'] ?? $_GET['id'] ?? '');
if ($action !== 'list' && !preg_match('/^[a-zA-Z0-9_-]{1,96}$/', $id)) reject('Invalid record ID.');
if ($action === 'list') {
    $rows = query('SELECT id,body FROM umang_documents WHERE collection_path=? ORDER BY id', [$path])->fetchAll(PDO::FETCH_ASSOC);
    $out = []; foreach ($rows as $row) { $body = json_decode($row['body'], true, 64, JSON_THROW_ON_ERROR); if ($path === 'masters/users/rows') { $body = safeUser($body); if (empty($user['owner'])) $body = array_intersect_key($body, array_flip(['name','status','designation_id','signature'])); } $out[] = ['id' => $row['id'], 'data' => $body]; }
    reply(['docs' => $out]);
}
if ($action === 'get') {
    $body = document($path, $id); if ($path === 'masters/users/rows' && $body) { $body = safeUser($body); if (empty($user['owner'])) $body = array_intersect_key($body, array_flip(['name','status','designation_id','signature'])); }
    reply(['id' => $id, 'exists' => $body !== null, 'data' => $body]);
}
if (!permittedWrite($path)) reject('You do not have permission to save here. Contact the administrator.', 403);
if (!in_array($action, ['acquire','set','update','delete'], true)) reject('Unknown action.');
if ($action === 'acquire') {
    if ($path !== 'counters') reject('Only counters support leases.');
    $holder = hash('sha256', session_id() . ':' . (string)($input['holder'] ?? ''));
    $key = $path . '/' . $id; $now = microtime(true);
    query('INSERT IGNORE INTO umang_leases(lease_key,holder,expires_at) VALUES(?,?,0)', [$key, '']);
    db()->beginTransaction();
    $lease = query('SELECT holder,expires_at FROM umang_leases WHERE lease_key=? FOR UPDATE', [$key])->fetch(PDO::FETCH_ASSOC);
    $acquired = (float)$lease['expires_at'] < $now || hash_equals($lease['holder'], $holder);
    if ($acquired) query('UPDATE umang_leases SET holder=?,expires_at=? WHERE lease_key=?', [$holder, $now+8, $key]);
    db()->commit(); reply(['acquired' => $acquired]);
}
db()->beginTransaction();
if ($path === 'counters') {
    $lease = query('SELECT holder,expires_at FROM umang_leases WHERE lease_key=? FOR UPDATE', [$path . '/' . $id])->fetch(PDO::FETCH_ASSOC);
    $holder = hash('sha256', session_id() . ':' . (string)($input['holder'] ?? ''));
    if (!$lease || (float)$lease['expires_at'] < microtime(true) || !hash_equals($lease['holder'], $holder)) { db()->rollBack(); reject('Number reservation expired. Try again.', 409, 'unavailable'); }
}
$old = document($path, $id, true);
if ($action === 'delete') {
    if ($path === 'counters') { db()->rollBack(); reject('Counters cannot be deleted.'); }
    query('DELETE FROM umang_documents WHERE collection_path=? AND id=?', [$path, $id]);
} else {
    $body = $input['data'] ?? null;
    if (!is_array($body)) { db()->rollBack(); reject('Invalid record.'); }
    if ($action === 'update' && !$old) { db()->rollBack(); reject('Record no longer exists.', 404); }
    if ($action === 'update') $body = array_merge($old, $body);
    if ($path === 'masters/users/rows') {
        unset($body['has_password'], $body['owner'], $body['id']);
        if (empty($body['pw_hash']) && $old) { $body['pw_hash'] = $old['pw_hash'] ?? ''; $body['pw_salt'] = $old['pw_salt'] ?? ''; }
        if (!preg_match('/^[a-f0-9]{64}$/', (string)($body['pw_hash'] ?? '')) || !preg_match('/^[a-f0-9]{32}$/', (string)($body['pw_salt'] ?? ''))) { db()->rollBack(); reject('Set a password for this user.'); }
        if (isset($body['allowed_views']) && (!is_array($body['allowed_views']) || count(array_filter($body['allowed_views'], 'is_string')) !== count($body['allowed_views']))) { db()->rollBack(); reject('Invalid view permissions.'); }
        if (empty($body['name']) || empty($body['email'])) { db()->rollBack(); reject('User name and email are required.'); }
        if (strcasecmp((string)$body['name'], (string)$config['admin_username']) === 0 || strcasecmp((string)$body['email'], (string)$config['admin_username']) === 0) { db()->rollBack(); reject('This administrator login is reserved.'); }
    }
    if ($path === 'counters' && (!isset($body['next']) || !is_int($body['next']) || $body['next'] < (int)($old['next'] ?? 1))) { db()->rollBack(); reject('Invalid counter value.'); }
    query('INSERT INTO umang_documents(collection_path,id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body)', [$path, $id, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
    if ($path === 'counters') query('UPDATE umang_leases SET expires_at=0 WHERE lease_key=?', [$path . '/' . $id]);
}
db()->commit(); reply(['ok' => true, 'id' => $id]);
