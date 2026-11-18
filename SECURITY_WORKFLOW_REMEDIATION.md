# ConstructFlow security and workflow remediation

Initial repository changes were prepared on 2026-11-16. The owner subsequently activated the workflow bundle on connected Supabase and authorized one labelled live QA project. Current UI and live verification results are in [UI_FLOW_VERIFICATION.md](UI_FLOW_VERIFICATION.md). Credential rotation, real email delivery, paid builds and deployment remain outside this verification. Passing checks do not establish that the entire system is defect-free.

## Correct operating order

1. Register through the appropriate portal, verify the email, and obtain administrator approval for internal staff and suppliers. Clients are approved at signup but still verify their email. Google onboarding assigns only a pending account's role. The approved profile, rather than editable auth metadata, determines authority.
2. An administrator or PM creates the project and assigns its approved client, manager, site managers, workers, and suppliers. The project, canonical assignment tables, initial milestones, BOQ material baselines and BOQ document reference commit together. PMs manage their own projects.
3. A site manager submits a material request. The PM/admin selects an assigned supplier, price, and delivery date. Approval atomically creates one linked purchase order; rejection creates none.
4. The supplier confirms, rejects, or proposes a counter-offer. The PM/admin reviews a counter-offer. Suppliers cannot approve their own proposed terms. Only a confirmed order can be reported delivered.
5. Assigned project staff count the accepted goods and record the actual quantity and delivery note. Partial receipts leave the remainder outstanding. The receipt ledger, stock increment, and order status commit together; retrying the same receipt does not increment stock twice.
6. Site staff record attendance using an assigned worker identity. Workers check out. The PM/admin reviews the attendance period before salary generation. Wage rates must exist; duplicate days and overlapping salary periods cannot inflate pay. Paid project wages enter actual spend.
7. Staff record other expenses and stock usage. Insufficient stock and materials belonging to another project are rejected. Purchase-order costs must not be recorded again as the same expense.
8. Milestones carry consistent status and percentage. Progress includes partial milestones. An update and its media commit together. The client reviews pending variations once; approval adjusts the budget once. PM/admin verification of actual amount and evidence marks scheduled payments paid.
9. Reports use authorized project scope and fail explicitly if their source queries fail. Notifications use recipient/project scope and a separate read receipt for each user. Messaging requires both participants to belong to the project.
10. Historical BOQs are imported as unverified evidence. A different administrator reviews real source evidence before it is eligible for model training. With insufficient reviewed data, cost estimates use an explicitly labelled rate baseline; delay risk is rule-based. The UI no longer fabricates predictions during API failures.

## Changes and evidence

| Area | Defect addressed | Main implementation |
| --- | --- | --- |
| Authentication | Cached/revoked authority, metadata roles, self-approved staff, half-created registrations | `backend/core/security.py`, `backend/api/routes/auth.py`, profile guards, `AuthContext.tsx` |
| Data isolation | Cross-account API cache, financial cache before authorization, unrestricted chat/notification writes | `frontend/src/services/api.ts`, backend project access checks, notification receipt RPCs |
| Project persistence | Privileged fallback bypass and partial assignment updates | Transactional `save_project_with_assignments` including nested BOQ/milestone/document data; atomic BOQ reapplication; no service-role retry |
| Procurement | Lost counter-offer price, unsupported role actions, stock corruption, missing request-to-order link | Reviewed requests, purchase-order guards, quantity-aware immutable receipts |
| Payroll | Duplicate-day overtime, absent rates, unchecked attendance, overlapping/unscoped slips | Payroll calculator, attendance review RPC and generation guards |
| Finance | Received goods/expenses double counting, unpaid or unrelated wages, inconsistent stored spend | Verified-receipt costs, project-paid wages, transactional expense stock usage, ledger refresh triggers |
| Milestones/client review | Partial progress omitted, conflicting states, non-atomic media, missing variation budget update | Atomic milestone RPC, progress trigger, pending-only variation/payment review |
| Uploads/maps | Path traversal, trusted MIME, oversized/invalid images and spreadsheet expansion, embedded script injection | Project authorization, bounded parsing, image decoding/re-encoding, safe map serialization and iframe isolation |
| ML evidence | Imports counted as verified, unsupported uncertainty claims, local fake fallback predictions | Evidence review queue, authoritative remote history, eligibility gate, baseline comparison, atomic model publication and digest check |
| Public inquiries | Unvalidated input and success without durable inquiry storage | Validated API and service-only transactional inquiry persistence/notifications |
| Dependency/repository hygiene | Known dependency advisories, tracked secrets/dependencies/bytecode | npm overrides and reviewed local compatibility patches, tested Python lock, ignored/untracked generated files and secrets |

Focused tests reside in `backend/tests/test_audit_regressions.py`, `backend/tests/security_workflow_sql.mjs`, and `frontend/scripts/test-security-boundaries.cjs`. Browser workflow fixtures in `frontend/scripts/test-workflow-browser.cjs` block external services and assert real UI requests against synthetic responses.

## Database activation

The application and database changes must be released together. Missing RPCs intentionally fail rather than fall back to privileged writes.

1. Take a database backup and use a staging clone. The repository contains multiple legacy schema variants: do not execute every SQL file blindly. Start from the deployed canonical schema and its already-applied migration history, including the prior core RLS/workflow hardening and worker/payroll/material-catalog migrations.
2. Run `backend/scripts/workflow_preflight.sql`. Reconcile duplicate attendance, duplicate/overlapping payroll, and duplicate historical project identities before adding uniqueness indexes. Do not delete financial records merely to make a migration pass. Confirm `salary_slips.project_id`, period/amount fields, material catalog references, and canonical worker/profile identities exist. Resolve missing tables/columns first.
3. Apply these owner-run transaction files in this exact order:
   - `backend/migrations/20261116_security_workflow_integrity.sql`
   - `backend/migrations/20261116_workflow_receipts.sql`
   - `backend/migrations/20261116_workflow_reviews.sql`
   - `backend/migrations/20261116_workflow_security_boundaries.sql`
   - `backend/migrations/20261116_workflow_z_milestones.sql`
   - `backend/migrations/20261116_workflow_zz_inquiries.sql`
   - `backend/migrations/20261116_workflow_zzz_project_payload.sql`
   - `backend/migrations/20261117_project_commercial_ui.sql`

   The owner-run atomic bundle is `backend/reviews/APPLY_UI_WORKFLOW.sql`. Current UI checks and completed live workflow tests are documented in `UI_FLOW_VERIFICATION.md`.
4. Inspect existing milestone status/progress inconsistencies and reconcile them before validating the new `milestone_status_canonical` constraint. Legacy rows are not silently reclassified. The migration bridges the legacy `url`/`media_url` columns for future attachments.
5. Reconcile historical received orders against physical stock before entering any new receipt. Existing `Received` rows are treated as previously received; the new ledger must not be used to receive them again. Review pre-existing financial inconsistencies, then refresh stored spend for authorized projects with owner-run `SELECT public.refresh_project_spend(id) FROM public.projects;`. Review partial milestone aggregates similarly; triggers maintain future changes.
6. Test every role using separate staging accounts, including disabled/pending identities and direct SDK/RPC calls. Confirm Realtime and Storage policies and the deployed Supabase Auth email-confirmation, password, redirect allowlist, and OAuth configuration. The PGlite checks validate transaction logic and representative restrictive policies; they do not reproduce the complete deployed schema and policy history.
7. Deploy the backend and frontend together, verify one complete project/request/order/partial receipt/attendance/payroll/client-review journey, and monitor failures. If a migration fails, fix staging schema/data first; do not disable authorization or enable privileged fallbacks. Backups and coordinated application/database versions are the rollback mechanism.

## Configuration and remaining operational work

- Rotate the credentials formerly tracked in `backend/.env` and `Credintials`, and revoke old tokens at each provider. Removing tracked files does not remove copies from Git history. Local credential files were preserved; generated dependencies and bytecode were removed from the index, not erased from disk.
- Copy `backend/.env.example` to a private environment file. Production needs its actual HTTPS `FRONTEND_URL`, explicit `CORS_ORIGINS`, server-only service key, functioning verified email transport, and configured object storage. `ALLOW_LOCAL_UPLOADS` remains off in production. Never ship fixture build URLs or service keys in `EXPO_PUBLIC_*` variables.
- Run scheduled tasks in one designated process. The in-process public request limit is a local safeguard; deployment should enforce a shared limit at its trusted proxy/gateway across workers and instances. Do not trust arbitrary forwarded-IP headers.
- The repository contains a tested Python runtime lock. NumPy requires Python 3.12+; checks here used Python 3.14 on Windows. Validate wheel availability and installation on the deployment OS. Install dependencies from the lock and keep the model-training runtime compatible. Use Node 22.22+ for the frontend; `npm ci` runs the reviewed NativeWind/Metro compatibility patch.
- Native session tokens now use Expo SecureStore; upgrading the native binary is required. Web sessions retain browser storage, so production must continue to prevent script injection. Android JS export is not an APK/device test. Real iOS/Android camera, location, push, SecureStore, keyboards, email verification and OAuth require staging/device checks.
- The worker QR is a supervised identity badge. It does not independently prove a worker's physical presence. Attendance review remains necessary.
- No new real training evidence was invented or verified. Old unreviewed model artifacts fall back to baseline estimates until eligible evidence is reviewed and training publishes matching artifacts. Prediction ranges with insufficient data are planning ranges, not validated accuracy guarantees.
- Existing lint/deprecation warnings remain separately visible; zero TypeScript/lint errors do not mean all screens and integrations have exhaustive test coverage.

## Repeatable verification

Initial local results on 2026-11-16 (superseded by the current UI/live results linked above):

| Check | Result |
| --- | --- |
| Backend pytest suite | 167 passed; 7 dependency/lifecycle deprecation warnings |
| PostgreSQL/PGlite transaction and security checks | 31 passed |
| Frontend security/error/report regression scripts | Passed |
| Fixture browser scenarios | 4 passed: PM request approval, actual partial receipt, pending-user block, profile role overriding forged metadata |
| PM material review viewport widths | 360, 390, 768, 1024, 1440; no document horizontal overflow |
| TypeScript | No errors |
| ESLint on application source | 0 errors; 215 existing warnings |
| Expo web and Android JavaScript exports | Passed with fixture configuration; no APK or physical-device claim |
| npm and installed Python package vulnerability audits | No known vulnerabilities reported at check time |
| Python dependency consistency | `pip check` passed |
| OpenAPI contract | Regenerated; quantity receipt body and unique operation IDs checked |
| Patch whitespace | `git diff --check` passed |

Those initial checks stopped their preview server and did not modify live records. Subsequent authorized UI/live QA created a labelled test project and dedicated accounts, documented in `UI_FLOW_VERIFICATION.md`; user-requested application servers remain running.

From the repository root (Windows):

```powershell
.venv/Scripts/python -m pip install -r backend/requirements-lock.txt
.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
.venv/Scripts/python -B -m pytest backend/tests -q
npm.cmd install --prefix .validation-db @electric-sql/pglite@0.5.16
node backend/tests/security_workflow_sql.mjs
```

From `frontend/`:

```powershell
npm.cmd ci
npm.cmd test
npx.cmd tsc --noEmit
node node_modules/eslint/bin/eslint.js src --no-cache
npm.cmd audit
```

For fixture browser QA, set `EXPO_PUBLIC_API_URL=https://api.fixture.invalid/api`, `EXPO_PUBLIC_SUPABASE_URL=https://fixture.supabase.co`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key`; export web to `.validation-web`, serve that directory on `127.0.0.1:8085`, then run `node scripts/test-workflow-browser.cjs`. It requires Playwright and an installed Chrome channel. Export native JS separately with Expo's `export -p android`. These fixture artifacts are for testing only.
