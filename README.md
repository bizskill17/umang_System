# Umang Operations

Web app for running a signage business, built from the Umang System WordPress plugin (v1.0.482).

## Modules
- Leads, with follow-ups and a dashboard
- Recce and Design
- Quotations, with a PDF in the plugin's layout
- Projects: jobs, stages, QC, delivery and wastage
- Invoices and payments
- Complaints, with update history and photos
- Masters: firm, customers, vendors, users, categories and more

## Hostinger setup

Follow [the database setup guide](docs/DATABASE_SETUP.md). Create `config/database.php` **outside `public_html`** using [the example](config/database.example.php). Enter the database password and a separate administrator password privately on Hostinger. The website uses `localhost` for its local MySQL connection. Database credentials are not stored in GitHub or the browser.

The PHP API creates its `umang_` tables without deleting existing tables. Original Claude data is not migrated automatically. Uploaded documents remain private and require a signed-in session. Employees share application reads; module/master write permissions are checked on the server. Only the configured administrator manages accounts and roles.

## Files
- `index.html` — application screens and workflows.
- `assets/hostinger.js` — browser adapter for the PHP backend; retains the original Claude runtime when available.
- `api/index.php` — MySQL records, server sessions, upload/download handling and numbering leases.
- `config/database.example.php` — placeholder configuration; the filled configuration belongs outside the public website and must never be committed.
- `.github/workflows/deploy-hostinger.yml` — tests PHP/JavaScript and the backend using disposable MySQL before deploying to Hostinger.
- `tests/backend_test.py` — real MySQL integration tests; run only against the disposable `umang_test` database.
- `tests/adapter_test.cjs` and `tests/check-js.cjs` — browser adapter behavior and application JavaScript checks.
- Other files in `tests/` — existing Playwright checks against `mockdb3.js`.
