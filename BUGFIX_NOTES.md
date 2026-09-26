# Bug-fix validation and rollout

Changes in this pass preserve the existing uncommitted work. No live database migration, deployment, email, or commit was performed.

## Implemented

- Replaced the incomplete server-rendering Supabase stub with one consistent client API; fixed asynchronous native session storage.
- Fixed TypeScript errors in navigation props, native tabs, styles, chart formatters, icon names, realtime subscriptions, and supplier links.
- Fixed password-recovery URL detection and redirects; blocked unauthorized portal rendering and removed role fallback to editable user metadata.
- Public registration now requests the client role only. Admin signup uses an isolated client so it cannot replace the administrator's session.
- Authentication normalizes role aliases and denies missing/unknown roles instead of assuming Manager.
- Scoped report, document, material, message, estimation, purchase-order, attendance-scan, payroll-generation, client, and project-list queries to the caller's token where changed.
- Added purchase-order ownership checks and numeric validation; calculate order totals server-side.
- Project create/update and purchase-order delivery now use the transactional functions in the migration below. Project budgets are no longer dropped by request validation.
- Fixed attendance checkout subtraction for timezone-aware and legacy timestamps.
- Fixed message sender impersonation and the invalid Python message-order argument.
- Added missing Python runtime/test dependencies and settings; scheduled checks call their services directly instead of making unauthenticated localhost HTTP requests.
- Synthetic estimates no longer claim validated confidence or fabricated market/model accuracy. The estimator UI identifies prototype output.
- Fixed invalid Content-Length handling and made production CORS origins configurable.

## Required database rollout

Before running the updated project-save or delivery endpoints, apply `backend/migrations/20260925_workflow_integrity.sql` to a backed-up staging Supabase database, then validate its role workflows before production.

The migration expects the existing canonical schema: `profiles` with `email` and lowercase role support, `projects` with the fields used by the current API (including `total_budget`, dates and location), `project_role_assignments`, `pm_projects`, `materials`, `purchase_orders`, and `notifications`. It is not a replacement for the older schema files.

The migration:

- Restricts the known permissive assignment policies and denies anonymous assignment access.
- Makes Auth signup create clients regardless of submitted role metadata, and prevents self-service profile role changes.
- Saves a project, its role assignments and its PM relation in one transaction. Omitted assignment lists are preserved; an empty list clears the selected role.
- Locks an order and atomically increments stock on delivery; repeated delivery calls do not increment stock again.

It was executed twice successfully against an isolated PostgreSQL-compatible test schema. Its rollback and role behavior were exercised, but the live Supabase schema and policies were not inspected or changed. Other historical permissive policies require a separate database review; this is not a claim of complete tenant isolation.

## Runtime settings

- Install backend dependencies with `.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt` from the repository root.
- `CORS_ORIGINS` is a comma-separated list of allowed production frontend origins.
- Scheduled jobs default to disabled. Set `ENABLE_SCHEDULER=true` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in one designated scheduler process. Do not expose the service key to the frontend.
- `EXPO_PUBLIC_API_URL` should include `/api`, for example `http://localhost:8000/api`.

## Validation

- Frontend: `node node_modules/typescript/bin/tsc --noEmit --pretty false` from `frontend`.
- Frontend lint: `node node_modules/eslint/bin/eslint.js src` from `frontend`.
- Web build: `node node_modules/expo/bin/cli export --platform web --output-dir ../.validation-web` from `frontend`.
- Backend: `..\.venv\Scripts\python.exe -B -m pytest tests -q -p no:cacheprovider` from `backend`.
- Database tests: install the temporary engine with `npm install --prefix .validation-db --no-save --package-lock=false @electric-sql/pglite`, then run `node backend/tests/workflow_integrity.mjs` from the root. This uses only an in-memory test database, with no real credentials or network calls.

Generated validation output is ignored by Git. Existing frontend lint warnings and backend deprecation warnings are separate from the passing checks. Native builds and authenticated end-to-end role flows have not been tested.

## Pending approval

Automatic approval review rejected the additional milestone/expense endpoint and project RLS changes, citing authorization and service-availability regression risk. Those changes were not applied.

`backend/reviews/pending-project-access.patch` is a concrete review-only diff for the endpoint portion. It adds caller-scoped milestone/expense queries, role/project membership checks, milestone project-ID filtering, expense URL/body consistency, and preservation of deliberate HTTP errors. It has been Python-syntax checked and passes `git apply --check`, but requires application and regression testing after approval. It does not change live database policies.


## Full completion brief: Phase 1 follow-up (2026-09-25)

The previously pending project-access patch is now applied and refined. Its old approval blocker no longer applies to this local patch. Project expense creation is limited to admin/PM. The shared notification helper now respects explicit recipients before role-wide matching. See `backend/reviews/PHASE1_AUDIT.md` for current scope and the read-only staging preflight. Phase 1 remains incomplete until schema reconciliation and authenticated staging tests pass; no later phase is marked complete.
