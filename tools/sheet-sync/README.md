# Hourly Google Sheets → app sync

Brings records entered in the AppSheet / Google Sheets into the app at system.umangcommunications.com.
Only records that are new or changed **in the sheets** since the last sync are sent. If the same record was
also edited in the app, the sheet version replaces it. Existing master entries (users, sub-categories, vendors …)
are never changed; only new ones are added. Customers are added and updated. Nothing is ever deleted.

The sheets are only read, never edited.

No customer data is kept in this repository: `state/baseline.json.gz` holds record ids and one-way
fingerprints only. Sheet exports go in a temporary folder. The record file sent to the server is sealed
with the server's public key (`api/migration/data-sync-*.enc`), and only the server can open it.

## Each run

Work in a temporary folder `SRC` (for example `/tmp/umang-src`), **not** inside the repository.

1. **Download the sheets** with the Google Drive connector (`download_file_content`), saving each file in `SRC`
   with these exact names. Use the export type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   for the `.xlsx` files and `text/csv` for `jobs.csv`. The connector saves the download to a file; copy that file to `SRC`.

   | File in SRC | Spreadsheet | Drive file id |
   |---|---|---|
   | customers.xlsx | Customers | 1ZaZUWGMz2Q3cVXtT8e23y_dIlSpGqoZaiEF_ngOjSt4 |
   | leads.xlsx | Leads | 17Uzqcmu7l3KO9wxPq3et9rgbqLr62ZGmBLBGiEUCB2M |
   | users.xlsx | Users | 1T22SQ3LYixy30M4GlwMuz9YSvKpUJAEABmLfGbjFd1Y |
   | vendors.xlsx | Vendors | 13ykrHRSWR8T7EdW3Br56XF1ceJIjMtn8PCNvS4Q_C2Y |
   | projects.xlsx | Projects | 1OpM-XEfPjbcofG1HJ7E8kvDNtoBGMFrluOwOYiDua-I |
   | recce.xlsx | Recce | 1S5gSd9z8eO9W14HRz7kihgBI7MZCQKNIXFUAt94rXL0 |
   | dc.xlsx | Delivery Challans | 1vAPbGr5ZNWuAa2wbKxX9S49TXO35ula22OJpWBlWpqU |
   | invoices.xlsx | Invoices | 1NmLhQL6bpRHGbPeNRCkFxp_7UBDUwBF3ipLsc1c5GbM |
   | complaint.xlsx | Complaint | 1BuaaFdx6aqLkz4uM8uXqtPFbHE4T2_hMfxPG6qMyF-Y |
   | jobs.csv | Jobs (first tab, CSV export) | 1NrT128F4eNLjFksQ1YamxIH53raRPbyFR6VdYrjfNrQ |

2. **Job Items tab** (too big for a Drive export): read it with the Google Sheets connector `get_values`,
   spreadsheet `1NrT128F4eNLjFksQ1YamxIH53raRPbyFR6VdYrjfNrQ`, in ranges of 1,500 rows:
   `'Job Items'!A1:EZ1500`, `'Job Items'!A1501:EZ3000`, … until a range comes back empty or past the last row
   (the sheet has about 20,000 rows; check the row count with `get_spreadsheet`, fields
   `sheets.properties.title,sheets.properties.gridProperties.rowCount`). Each result is saved to a file:
   copy them in order to `SRC/jobitems01.txt`, `jobitems02.txt`, … (two digits). The ranges must not overlap.

3. **Build and seal:** `python3 tools/sheet-sync/sync.py build SRC` (needs `pip install openpyxl cryptography --break-system-packages`).
   - `RESULT: nothing new or changed` → stop here; nothing to commit.
   - `RESULT: stopped …` or any error → stop and report it; do not commit.
   - `RESULT: N records to send` → it wrote `api/migration/data-sync-<time>.enc` and removed older `.enc` files.

4. **Deploy:** commit `api/migration/` (the new `.enc` and the removed old ones) to `main` and push.
   Wait for the **Deploy to Hostinger** run for that commit to finish with success:
   `gh run list --workflow deploy-hostinger.yml -L 1 --json headSha,status,conclusion`.

5. **Apply and remember:** `python3 tools/sheet-sync/sync.py confirm`. This calls the server once, which applies
   the sealed file, then updates `state/baseline.json.gz`. Commit and push `tools/sheet-sync/state/` (this does not
   start a deploy).

6. **Report** the counts printed in step 3 and the `Applied:` line from step 5, including any `unresolved` names
   (people or masters in the sheets that the app doesn't have).

If a run stops between steps 4 and 5, the next run's `build` still works: it compares with the last confirmed
baseline, so the same records are simply sent again.
