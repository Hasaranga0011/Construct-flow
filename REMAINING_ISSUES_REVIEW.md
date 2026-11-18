# Remaining issues review — 17 November 2026

The frontend now passes TypeScript and full-source ESLint with **zero errors and zero warnings**. Unused imports/bindings were removed; stale effect dependencies were corrected with stable callbacks and normalized identities. The conditional native push import retains one documented, scoped lint exception because importing that module on web/Expo Go is intentionally prevented.

## Fixes and evidence

- **Native scanner manual fallback:** permission-denied and hardware-error branches previously returned before the manual form could render. Manual entry is now available before those branches, releases CameraView while entering a code, preserves failed codes and rejects concurrent submissions. Two component-state regressions pass with mocked native modules.
- **GPS/push permission handling:** eight mocked branches pass: GPS denied/granted/failure; push web/Expo Go/denied/granted/simulator. These prove code branches, not real hardware operation or push delivery.
- **Manual attendance:** the admin modal had no opening control; the API looked up people by name, confused project/site identity and referenced a missing request date. The admin page now exposes Record attendance; the form selects approved, assigned workers by ID. The backend resolves physical sites, checks project/worker assignment, handles duplicate records as HTTP 409, validates finite hours/timezones/dates and rejects future completed work. Zero hours represents an open check-in. Thirteen new backend cases pass, including a valid HTTP response contract. Six connected rejection checks pass without creating attendance rows. A browser scenario verifies the actual worker ID, project and check-in timestamp sent once.
- **Labour distribution:** replaced the legacy labour read and case-sensitive active-project filter with canonical attendance/physical-site mapping. Counts use unique worker identities and the Sri Lanka day, excluding absence/leave records.
- **Password recovery:** Supabase's built-in mail endpoint returned HTTP 500 even though the application's Resend transport worked. The new public, rate-limited `/api/auth/password-recovery` endpoint generates recovery links and sends them through the configured app transport. It validates redirects against configured origins, returns a generic response for unknown accounts and never exposes action links in API responses or logs. The signed-out frontend uses a public fetch rather than an authenticated API wrapper. Seven new recovery/account-creation boundary tests pass.
- **Expired recovery links:** invalid/used links keep password fields disabled, explain the reason and offer a new-link request. Hash-only navigation is handled. Successful resets return Client/Supplier users to Partner Login. Four browser auth scenarios pass, including expired-link handling and simulated update/sign-out.
- **Existing-identity protection:** the approved test email already had an older Auth identity with no profile. No duplicate identity was created and its password was not reset by the agent. After confirming no project/team bindings, the explicitly authorized QA Client profile was restored. The owner used a fresh email link, changed their own password and confirmed Partner Login and Client dashboard access. The account has no assigned project. Admin user creation now returns HTTP 409 for existing Auth identities, including those missing profiles, rather than silently changing their password or role.

## Final checks

- Backend: **228 passed**, five existing dependency/lifecycle deprecation warnings.
- Connected role reads: **94 assertions passed**; manual-attendance rejection checks: **6 passed**.
- Whole-portal UI: **822 checks, zero failures** on the remaining-fixes build.
- Browser workflows: **30 passed**, including all thirty cross-portal redirects, manual attendance and denied browser-camera fallback.
- Public/auth geometry: **45 checks, zero failures**; auth interactions: **4 passed** on the final browser build.
- Frontend security/error/money/report/native-state regressions: passed; included in `npm test`.
- Web/Android/iOS JavaScript exports passed. The final browser-only recovery hash-change adjustment was separately web-exported and checked.
- Current OpenAPI contract regenerated with unique operation IDs and the new request fields.

## Owner decisions and open limits

**Historical estimates:** 17 unlinked records were inventoried. Four unique exact-name candidates and thirteen unmatched records are documented in `LEGACY_ESTIMATE_LINK_REVIEW.md`. The owner chose to keep all 17 admin-only. No creator was guessed and no legacy estimate link was changed.

**New invitation identity:** the owner declined creating another account or Gmail alias. A brand-new invitation/acceptance journey was therefore not performed. Recovery for the preserved existing identity was completed with owner confirmation.

**Physical devices:** the owner has no available device for these checks. Camera focus/QR decoding in real lighting, native permission dialogs, GPS precision, push receipt, SecureStore, keyboard/safe areas and installation still need device testing.

**Remote push is a functional gap:** the source registers Expo push tokens and handles permissions, but no backend Expo push dispatcher/outbox was found. Current notifications are delivered in-app through the database/Realtime path. Token registration must not be presented as proof of remote push delivery. Implementing and operating a dispatcher requires additional work; it was not silently simulated as a passing feature.

**Location policy:** map location selection exists. Attendance currently uses supervised worker identity/assignment checks, not server-enforced GPS geofencing. No radius or presence rule was invented during testing.

**Capacity:** the earlier four-worker/twelve-request concurrency smoke check passed; production throughput and high-user-count capacity remain unestablished.

Live QA artifacts and account identifiers remain in ignored `.validation-db/` files. No production budgets, purchase orders, inventory or payroll were changed by this review. User-requested application servers are preserved; QA preview servers are stopped after testing.
