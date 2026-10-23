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

## Files
- `index.html` — the whole app in one file. It runs as a Claude artifact and uses its database, file uploads, downloads and user capabilities.
- `tests/` — Playwright scripts used to check the app against a mock database (`mockdb3.js`). `mk.py` builds the test page.
