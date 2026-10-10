# Worker portal validation

## Local results

- Web export succeeds with the installed Expo 54 dependencies.
- Responsive audit: 144 passing checks (8 routes, 6 widths from 320 to 1440, 3 scenarios: populated, assigned without attendance, unassigned).
- Browser interactions pass: own-row Realtime attendance updates Today without refresh; full-screen QR opens and closes; cached QR remains available when profile requests fail; payslip details and valid PDF download work.
- Backend payroll and attendance scan tests: 9 passed.
- PostgreSQL RLS harness passes migration, historical attendance backfill, scan synchronization, own-row reads, cross-worker read/update denial, protected wage fields, and permitted contact edits. This uses authenticated-role JWT simulation in local PostgreSQL, not live Supabase sign-in.
- TypeScript still reports errors elsewhere in the repository. No diagnostics match WorkerPortal, WorkerAccount, workerData, useAsyncData, StatCard, or reportDelivery.

## Deployment and remaining verification

1. Apply `frontend/supabase/migrations/20261009144201_worker_portal.sql` to the app's Supabase project before deploying the new frontend/backend. The connected Supabase account does not expose that project, so this migration has not been applied remotely.
2. Configure the backend frontend URL and email sender for deployed payslip links and delivery.
3. Run `backend/tests/worker_rls_live.py` with the documented environment variables in that file and two real worker fixtures. The script validates the second worker's fixtures before testing access as the first worker.
4. Verify populated, assigned-empty and unassigned accounts against the deployed database. Test scan authorization with both the assigned site manager and a manager at another site.
5. Test Expo Go on a 360px-class phone: safe areas, QR brightness restoration, photo upload, and native PDF sharing. Browser checks do not validate native device behavior.

Payroll generation remains within the generating manager's RLS scope. A worker who changes between projects managed by different managers within a pay period needs an explicit authorized consolidation workflow; that edge case is not resolved here. A proposed privileged aggregation was rejected by automatic approval review and was not applied.

Worker Realtime subscriptions use filtered INSERT and UPDATE events. Deletes are reconciled by periodic refresh because delete events cannot safely provide the same row-filter privacy guarantee.

## Repeatable commands

Run from the repository root:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH='backend'
.venv/Scripts/python.exe -m pytest backend/tests/test_worker_payroll.py backend/tests/test_attendance_schema.py -q
node backend/tests/worker_rls.mjs
node frontend/scripts/worker-interactions.cjs
```

Browser scripts require the local static export served on port 8085 (or RESPONSIVE_URL), Chrome, and Playwright. The local RLS harness requires the PGlite module under `.validation-db/node_modules`.

Run `npm run audit:responsive` from frontend with RESPONSIVE_URL, RESPONSIVE_ROLES=worker and RESPONSIVE_POPULATED=1. Set WORKER_SCENARIO to populated, no-attendance or unassigned. Audit fixtures are confined to validation scripts and are not used by the portal.
