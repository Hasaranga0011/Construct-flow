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

## Landing Page, Video Background & Expo Go Connectivity (2026-10-11)

### Fixed
- **Scroll-Driven Video Background Scaling (`frontend/src/app/index.tsx`)**:
  - Fixed video sizing and aspect ratio fitting across Web and Native.
  - Accommodated baked-in ~420px letterboxing/pillarboxing in `homepage_scroll.mp4` by applying `scale(1.78)` to ensure a crisp, seamless full-screen fill without side bars.
  - Maintained bidirectional scroll-scrubbing via `requestAnimationFrame` on Web and auto-looping on Native.
- **Expo Go Dynamic API URL Resolution (`frontend/src/lib/apiUrl.ts`)**:
  - Resolved `TypeError: Network request failed` on mobile devices caused by requests directed to device loopback (`localhost`).
  - Added robust detection of development machine IP via `Constants.expoConfig?.hostUri`, `Constants.manifest2?.extra?.expoGo?.debuggerHost`, and `Constants.experienceUrl`.
  - Added LAN IP fallback (`10.24.163.40`) to maintain connectivity when Expo config metadata is missing.
  - Ensured Web continues dynamically detecting the browser hostname for local LAN access.
- **Centralized Endpoint Resolution in Services & Contexts**:
  - `frontend/src/context/AuthContext.tsx`: Replaced direct `process.env.EXPO_PUBLIC_API_URL` usage with `getApiUrl()` for `/auth/google-role` sync, eliminating redbox network failure modals on app launch.
  - `frontend/src/utils/notifications.ts`: Replaced duplicate and un-prefixed ad-hoc `getApiUrl` with centralized resolver from `lib/apiUrl.ts`.
  - `frontend/src/app/index.tsx`: Integrated public contact inquiries with backend `POST /api/public-inquiry` and improved client-side error handling/logging.
- **Worker QR Code Download on Mobile (`worker/dashboard.tsx` & `WorkerPortal.tsx`)**:
  - Switched from root `expo-file-system` to `expo-file-system/legacy` to eliminate SDK 54 deprecation runtime errors when calling `writeAsStringAsync`.
  - Replaced `FileSystem.documentDirectory` with `FileSystem.cacheDirectory` (with safe fallback) so Android/iOS FileProvider can share/download QR images without permission errors.
  - Used stable `useRef` for `svgRef`, cleaned base64 header prefixes (`data:image/png;base64,`), sanitized filenames, and added proper mime-type and UTI metadata to `Sharing.shareAsync`.
- **Project Manager & Admin Dashboard Layout Overlap Fix (`pm/dashboard.tsx`, `admin/dashboard.tsx`, `CostTimelineChart.tsx`, `DelayRiskPanel.tsx`)**:
  - Replaced fragile NativeWind dynamic ternary classes with explicit React Native flexbox layout styles (`flexDirection`, `width`, `gap`).
  - Removed root `flex-1` from `CostTimelineChart` and `DelayRiskPanel` inside `ScrollView` so children size by their content/minHeight instead of collapsing to 0 height and overlapping adjacent cards.
  - Restored proper `fullWidth` prop and responsive wrapping to top stat cards.
- **Silenced Reanimated Strict Mode Warnings (`frontend/src/app/_layout.tsx`)**:
  - Silenced `[Reanimated] Reading from value during component render` terminal flood by configuring `configureReanimatedLogger({ strict: false })` and `LogBox.ignoreLogs`.
  - Converted `AnimatedCard.tsx` to React Native's standard `Animated` API for maximum stability.
- **Worker Profile & Settings Unified Across Roles (`ProfileScreen.tsx` & `SettingsScreen.tsx`)**:
  - Removed worker-specific branch that previously redirected workers to an isolated `WorkerAccount` component.
  - Workers now utilize the standard, rich `ProfileScreen` and `SettingsScreen` shared by Admin, PM, Site Manager, Client, and Supplier roles.
  - Added support in `ProfileScreen` to query assigned project info via `workers.site_id` so workers see their assigned construction site card.
- **Top-Level Authentication Route Normalization**:
  - Fixed unhandled navigation action warnings by updating logout redirects in `Sidebar.tsx`, `MobileSidebar.tsx`, `SettingsScreen.tsx`, and `useAuth.ts` from `/login` to `/team-login`.
