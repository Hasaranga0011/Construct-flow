# Approved assignment repair - 2026-10-08

The user explicitly approved repairing KDU and Enrich Arcane and allowing unknown NIC values to remain null. This section supersedes the earlier statements that no live data was changed.

## Root cause and completed repair

- Project assignment created `site_manager_sites` and `site_workers` rows, but did not provision the actual `sites` and `workers` records required by attendance.
- Live inspection found no site for either reported project. KDU had one assignment pointing to a profile without a worker record; Enrich Arcane had no worker assignments.
- Repaired both projects: each now has one site. KDU now has one linked worker record and the existing worker QR code is present. Enrich Arcane remains without assigned workers; no assignments were fabricated.
- Verified the database now permits null `workers.nic_number`. The matching migration is `backend/migrations/20261008_attendance_worker_setup.sql`. No fabricated NIC was stored, and existing NIC values/attendance records were preserved.
- New server setup uses stable IDs and insert-on-conflict-do-nothing behavior. Re-running live setup kept one site per project and reused existing worker records.
- Project create/update now provisions attendance records after assignment synchronization. An authenticated `POST /api/projects/{project_id}/attendance-setup` endpoint repairs older missing records after verifying role and persisted project access, before creating the privileged database client.
- Site-manager data loading invokes setup when a site or assigned worker record is missing. Both worker-ID and profile-ID assignment formats remain supported.

## Verification

- Backend suite: **74 passed**, 13 dependency/deprecation warnings. Added repeat-safety, existing-data preservation, empty-roster and authorization tests; assignment-save tests verify setup is called.
- Whole-project TypeScript and targeted frontend lint passed.
- Missing-site + missing-worker recovery followed by manual check-in passed in Chrome with mocked database/API traffic.
- Final Chrome rerun: **13 functional scenarios and 33 viewport checks passed** (11 screens at three viewport sizes), with zero captured JavaScript runtime errors. Includes missing-record setup recovery, manual check-in/out, QR image and camera-frame decoding.
- Local frontend: port 8083. Local API: port 8000. The new endpoint is loaded after API restart.

Live verification checked records and repeat-safe setup, not actual attendance writes under the user's login. Browser attendance/QR mutations use fixtures. Physical-device camera/permissions remain unverified.

---

# Site manager live-schema correction - 2026-10-08

This follow-up supersedes the attendance/worker schema assumptions in the earlier audit below. The earlier mocked fixtures did not reflect the deployed database and therefore missed the failures reported by the user.

## Confirmed causes and fixes

- Zero-row requests against the configured Supabase instance confirmed that `attendance.status` does not exist. Reads and manual/QR inserts no longer require that column; attendance display derives presence from check-in timestamps.
- `attendance.site_id` references `sites.id`, not a project ID or site-manager assignment ID. Manual attendance, QR backend resolution and dashboard counts now resolve the project's actual site first. Projects without a linked site produce an explicit setup error rather than an invalid insert.
- The deployed schema lacks both the `site_workers -> workers` and `workers -> profiles` joins used by the UI. Worker lists now fetch assignments, worker records and profiles separately. Assignment IDs stored as either worker-record IDs or profile IDs are resolved to the worker-record ID required by attendance.
- Site issues are stored in `issues` via `site_id`; the `site_issues` table is absent. Issue creation, list, resolution and dashboard counts now use the existing table and its `reported_by` field.
- `milestone_media.caption` is absent. Media reads/inserts use verified fields; progress notes remain in milestone description.
- PostgREST errors are plain objects, not necessarily JavaScript `Error` instances. Pages now show the actual error message instead of replacing every failure with the same generic site-data error.
- Web QR scanning bundles `jsqr` locally rather than depending on Expo's external CDN worker. Camera frames and uploaded QR images share decoding; permission failures are visible, duplicate scans are guarded and camera tracks stop on close. Native camera mount failures have visible retry/close controls.
- The frontend targets `http://localhost:8000/api`; no backend was listening when this follow-up resumed. Started the local backend and confirmed its scan route is available. Expo preview is running on port 8083.

## Verification

- Live, read-only schema probes: **12 passed**, all with `limit=0`; no live records read or changed. Reproduce with `node frontend/scripts/check-site-schema.cjs`.
- Backend suite: **68 passed**, 13 dependency/deprecation warnings. Added tests for actual site keys, both worker-assignment ID formats, and denial of foreign project/unassigned worker writes.
- Mocked Chrome suite: **12 functional scenarios passed**, including manual check-in/out and hours, QR-image decoding, permission denial, camera-frame decoding, duplicate-scan prevention and stream cleanup. **33 viewport checks passed** across 11 screens at 320x568, 768x1024 and 1440x900. Zero captured JavaScript runtime errors.
- Whole-project TypeScript and targeted ESLint: zero errors/warnings. Changed site-manager files pass whitespace checks.
- Final Android and iOS JavaScript/Hermes bundle exports both passed. These are bundle checks, not installed physical-device tests.

Schema probes establish query compatibility, not authenticated RLS behavior. Browser mutations use fixtures, not live accounts. Physical cameras/native permissions and authenticated production attendance writes remain unverified. No new SQL migration or production deployment was performed.

---

## Earlier audit (2026-10-07; schema claims above take precedence)


## Changes

- Materials show the canonical `materials.name` field. Delivery queries no longer depend on an invalid material-name join. Receipt uses the shared authenticated API. Request quantities must be finite and positive; whitespace-only names/units are rejected. History is scoped to the selected project and no longer silently truncates to five entries.
- Assigned projects remain selectable regardless of status-label capitalization. Issues support selecting each assigned project, trim required fields, constrain resolution to the selected project and wrap cards on phones.
- Team/attendance queries resolve `site_workers.worker_id` through `workers` to `profiles`. Assignment inserts use worker record IDs. Attendance matches the current labour endpoint's project-ID contract. Check-out persists hours; completed attendance cannot be checked in again. Mutation results explicitly refresh without relying on realtime.
- QR scanners open as native modals and can retry after a scan. Worker removal requires confirmation. Manual attendance uses a scrollable, keyboard/safe-area-aware modal.
- Reports and milestones use a real browser/native image picker and authenticated multipart upload. The upload signature now includes the exact context sent to Cloudinary. Report dates, worker counts and content are validated on both client/server; a supplied site assignment must belong to the report project and manager.
- Milestone percentage and notes now reach the backend instead of being ignored. Assigned managers can be authorized through their site assignment. Media inserts include the uploader required by RLS, and media failures are surfaced. Saved photo evidence is viewable.
- Report lists refresh on navigation back from creation. Web/native feedback, visible data-load failures and assignment retry controls replace silent failures. Assignment state clears on sign-out/failure, and stale assignment requests cannot restore it.
- Notifications have an actual All/Unread filter. The hard-coded sidebar badge is removed. Site-manager settings hide notification/SMS/scheduled-email toggles that previously only changed local component state. Profile saves reject blank names and duplicate submissions; password reset links return to the web reset route.

## Verification

- Isolated backend suite: **61 passed**, 13 existing dependency/deprecation warnings. Includes new report-validation, milestone-persistence, assignment-boundary and exact upload-signature regressions.
- Chrome with mocked authentication/database/API responses: **10 functional scenarios passed** and **33 viewport checks passed** (11 screens at 320x568, 768x1024 and 1440x900), with zero recorded JavaScript runtime errors.
- Functional coverage: material request validation/creation and receipt; second-project issue creation/resolution; milestone percentage/notes; real browser file picker and multipart report upload; manual check-in/out/hours; confirmed worker removal; profile edit and theme/navigation; notification filter/read; data-load recovery; unassigned-site empty state.
- Targeted frontend ESLint: **zero errors and warnings** for site-manager pages, changed workflow utilities, scanner, notification page, assignment hook and browser audit script.
- Android and iOS JavaScript/Hermes bundle exports both passed after final UI changes. These are not installed APK/IPA or physical-device tests.
- Changed files passed `git diff --check`.

## Reproduce

Start Expo web on port 8083. From the repository root run `node frontend/scripts/audit-site-manager.cjs`. Playwright/Chrome are required; `PLAYWRIGHT_MODULE_PATH` can point to an installed Playwright package. `RESPONSIVE_URL` overrides the preview URL. `FLOW_ONLY` runs scenarios whose name contains the supplied text. Results are written to `.validation-web/site-manager-flow-results.json`. The audit uses synthetic sessions and intercepted requests; it must never be used as evidence of live authorization or production data correctness.

From `backend`, run `../.venv/Scripts/python.exe -m pytest tests -q`. The standalone root-level backend diagnostic scripts require services and are not part of this isolated suite.

## Limits and remaining project-wide issues

- Live Supabase schema/RLS, live Cloudinary credentials, actual camera QR recognition and physical Android/iOS keyboard/permission behavior were not exercised. No live records were changed and no deployment was performed.
- The user reported applying `20261006_receipt_stock_boundary.sql`; this audit does not independently verify its production deployment. No new SQL migration was applied in this follow-up.
- Follow-up PM work resolved the three earlier TypeScript errors (payroll detail navigation and team relation typing). Whole-project TypeScript now passes. See [PROJECT_MANAGER_FLOW_AUDIT.md](PROJECT_MANAGER_FLOW_AUDIT.md) for PM changes and updated verification.
