# Hostinger database setup

The website now uses a PHP API and MySQL on Hostinger. The private configuration is maintained on the server and is never deployed from GitHub.

## 1. Create the private configuration

Deployment visits the PHP API to create the private `config` folder and a placeholder `database.php` beside `public_html`. The website also attempts this automatically on its first visit. Existing configuration files are never overwritten.

In Hostinger File Manager, open the folder containing `public_html`, then open `config/database.php`. If hosting permissions prevent automatic creation, create that folder and file manually.

Copy the following into that file, replacing both passwords **on Hostinger only**:

```php
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
```

`password` is the password assigned to the MySQL user. `admin_password` is a **different** password for signing into Umang. Neither password should be sent in chat or committed to GitHub.

Use `localhost` for PHP running on the same Hostinger account. The `srv735.hstgr.io` hostname shown in Remote MySQL is for external connections, not the local website. Hostinger reference: https://www.hostinger.com/support/1583552-how-to-find-your-mysql-database-details-in-hostinger/

The final paths must be:

- `config/database.php` — private credentials
- `public_html/index.html` — application
- `public_html/assets/hostinger.js` — browser adapter
- `public_html/api/index.php` — PHP database API

`config` must be outside `public_html`, not inside `public_html/api`. Keep its permissions restricted to the hosting account (folder 700 and file 600 where supported). The API stores uploads privately in `config/umang-uploads`.

For a hashed administrator password, replace `admin_password` with `admin_password_hash`, containing the output of PHP `password_hash('your password', PASSWORD_DEFAULT)`. Do not place a password-generation script on the public website.

## 2. Deploy and sign in

Pushes to main deploy the frontend, API and upload settings. GitHub database secrets are **not used** for this configuration method. Existing FTP secrets remain necessary for deployment.

Open the website over HTTPS and sign in with `admin` and the administrator password configured above. The API creates four `umang_` tables if they do not exist. It does not delete existing tables or seed business records.

Create employees and their passwords in Master Data → Users. The configured administrator manages user accounts and user roles. Employee login checks the server session; browser local storage cannot grant access. Password hashes are not returned by the API. Employee deactivation and password changes invalidate existing employee sessions.

## 3. Verify

Create a master or lead, reload, and confirm the saved record remains. Upload a PDF or image from an allowed form and confirm it opens after reload. Sign out and verify records and attachment URLs require sign-in.

The endpoint `api/index.php?action=session` reports whether the backend is ready without exposing credentials. Setup and connection failures display on the login screen. Detailed driver errors and credentials are not returned to the browser.

## Requirements and limitations

- PHP 8.1+ with PDO MySQL and Fileinfo; MySQL 8 or compatible MariaDB with InnoDB.
- MySQL user needs CREATE, SELECT, INSERT, UPDATE and DELETE permissions on the selected database.
- Upload limits: 20 MB per PDF, JPG, PNG or WebP; PHP `post_max_size` must exceed 20 MB. The deployed `.user.ini` requests 22 MB; Hostinger may take several minutes to apply it.
- Signed-in employees can read shared application records and attachments for linked forms. View permissions restrict navigation; server-side write access is enforced by module and master. This is not row-level or per-screen data isolation.
- Data and uploaded files from the original Claude runtime are **not migrated automatically**. A new database starts empty. Existing unrelated database tables are left alone.
- Open screens refresh in one combined request about once a minute while the tab is visible (never while hidden), and immediately after a save, when the tab regains focus, or when the screen changes. This keeps MySQL connections well under Hostinger's per-hour limits.
- If the site shows **MySQL error 1226**, the database user hit Hostinger's hourly connection/query limit. It clears by itself within an hour.
- Back up the database and private uploads together. Automatic FTP deployment does not back them up or overwrite the private config.
