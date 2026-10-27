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

By default the PHP API stores data in a private SQLite file (`config/umang-data.sqlite`) to avoid hosting MySQL connection limits, copying any existing MySQL data across once; set `'driver' => 'mysql'` in the config to use MySQL. The API creates its `umang_` tables without deleting existing tables. Original Claude data is not migrated automatically. Uploaded documents remain private and require a signed-in session. Employees share application reads; module/master write permissions are checked on the server. Only the configured administrator manages accounts and roles.

## Files
- `index.html` — application screens and workflows.
- `assets/hostinger.js` — browser adapter for the PHP backend; retains the original Claude runtime when available.
- `api/index.php` — MySQL records, server sessions, upload/download handling and numbering leases.
- `config/database.example.php` — placeholder configuration; the filled configuration belongs outside the public website and must never be committed.
- `.github/workflows/deploy-hostinger.yml` — tests PHP/JavaScript and the backend using disposable MySQL before deploying to Hostinger.
- `tests/backend_test.py` — real MySQL integration tests; run only against the disposable `umang_test` database.
- `tests/adapter_test.cjs` and `tests/check-js.cjs` — browser adapter behavior and application JavaScript checks.
- Other files in `tests/` — existing Playwright checks against `mockdb3.js`.

## Operations improvements (27/10/2026)

Shared controls and management reporting live in `assets/operations.js` and `assets/operations.css`. The five department dashboards include employee/date/status filters, stage totals, overdue ageing, workload and drill-down lists. Projects without any job are in Pending Job Creation; projects with at least one job appear in Projects In Progress. Pending Delivery includes QC-passed quantities minus all recorded dispatches. Outsource reads existing department records without duplicating tasks.

Table exports are real XLSX workbooks; the paginated Project Sheet view exports every filtered row. Project Details, Project Sheet and Job PDFs are available from their respective views. Quotation item photos are included as labelled appendix pages in quotation PDFs. Images are resized/compressed before upload; PDFs are compacted only when smaller and signed PDFs retain their original bytes.

Server validations cover required customer fields, follow-up remarks, uploaded screenshot proof, inherited source locks, master dependencies and duplicate quotation projects. A quotation-only permission permits project creation from successful quotations without granting general project editing.

Run `python3 tests/operations_backend_test.py` for isolated SQLite validations. Run `node tests/operations_test.cjs` with Playwright and pdf-lib available via `UMANG_NODE_MODULES`; optionally set `UMANG_CHROMIUM` to a Chromium executable. CI runs these alongside the existing backend and adapter suites before deployment.
