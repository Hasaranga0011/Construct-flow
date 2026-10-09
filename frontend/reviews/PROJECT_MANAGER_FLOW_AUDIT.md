# Project manager flow audit - 2026-10-07

## Changes

- Replaced placeholder payroll calculations with saved salary slips scoped to managed projects. Worker names follow the current profile-ID salary contract; details open in a scrollable modal instead of deleted routes. Search and payment-status filters use recorded data.
- Labour reads project-scoped attendance and worker assignments, normalizes object/array joins and displays actual check-in/out, hours and current presence. Team queries expose failures and normalize worker relations.
- Materials use canonical stock names and project-scoped requests/orders. Approval and rejection check the pending status and mutation result, require a rejection reason and notify the requesting manager. Approval does not claim a supplier order was automatically created.
- Restored PM purchase-order creation/details routes using shared components. Order creation validates quantity/date and prevents selecting another project's stock item. Detail screens handle missing dates, constrain PM project scope, support web/native confirmations and wrap on narrow screens. Counter-offers validate quantity, date and price.
- Restored milestone list/create and budget/procurement routes. Milestone completion persists 100 percent progress, prevents duplicate submissions and refreshes on return from creation. Saved media opens from image thumbnails. Budget/procurement explicitly distinguishes order commitments from recorded spend.
- Project detail queries constrain ownership. Staff relations normalize consistently. Reports use the authenticated backend project endpoint and request fresh data on refresh.
- Dashboard attendance uses project IDs, low-stock counts use stock thresholds, and cost charts receive PM scope. View All opens the project list. Project searches no longer interpolate text into PostgREST OR syntax.
- Client statistics include managed projects across status labels. Client queries constrain project scope and expose retryable errors. PM client details are read-only; account-wide update/delete endpoints now require administrator authorization. Supplier queries expose errors rather than silently showing an empty list.
- PM estimator uses the shared full-input form. Removed fake notification badge and non-persisting notification preference controls.
- Responsive controls, wrapping, padding and scrollable modals cover the changed screens.

## Verification

- Backend suite: 63 passed, 13 dependency/deprecation warnings. Added HTTP permission regressions for PM client-account update/delete denial.
- Whole-project TypeScript: zero errors. Targeted ESLint for PM pages, shared order/client/dashboard components, API services and browser harness: zero errors and warnings.
- Mocked Chrome: 7 functional scenarios passed; 57 viewport checks passed (19 screens at 320x568, 768x1024 and 1440x900). Zero recorded JavaScript runtime errors. Coverage includes request decisions/rejection validation, saved payroll/details/filtering, PO detail/create navigation with a missing date, milestone completion and create-date validation, read-only PM client details and query failure/retry.
- Final Android and iOS JavaScript/Hermes bundle exports both passed after all code changes. These are bundle checks, not installed APK/IPA or physical-device tests.

- Changed PM/shared files pass `git diff --check`. Repository-wide whitespace checking still flags pre-existing trailing spaces in concurrently modified `backend/api/routes/labour.py`; those unrelated changes were preserved.

## Reproduce

From `backend`, run `../.venv/Scripts/python.exe -m pytest tests -q`.

Start Expo web on port 8083, then run `node frontend/scripts/audit-pm.cjs` from the repository root. Playwright and Chrome must be installed. `PLAYWRIGHT_MODULE_PATH` can point to an installed Playwright module, `RESPONSIVE_URL` overrides the preview URL and `FLOW_ONLY` filters scenario names. Results are written to `.validation-web/pm-flow-results.json`. All auth/database/API requests use synthetic fixtures; the harness does not mutate live data.

## Limits

- Live Supabase RLS/schema, production API integration, Cloudinary credentials and physical Android/iOS behavior were not exercised. Bundle export is not an installed APK/IPA test.
- No deployment or new SQL migration was performed. The earlier receipt migration was reported applied by the user, not independently verified here.
- Browser checks cover the named scenarios and viewport bounds, not every possible account/data combination or all native device permissions.
