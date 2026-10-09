# Responsive implementation and verification

Updated: 2026-10-06. This records the responsive work, including changes saved in commit `cbdb8ffb` and the follow-up changes in the working tree.

## Implementation

- Shared width-based breakpoints now apply to browser and native: phone below 640, compact portal below 1024, persistent sidebar from 1024. Dimensions update on rotation/resizing.
- Portal shells reserve space for navigation and constrain content to the available viewport. Mobile page headers retain their actions without repeating account/navigation controls. Drawers dismiss on navigation, backdrop press and Android Back.
- Login, registration, admin login and password forms use a bounded, scrollable auth layout with visible logos and reachable footers.
- Form dialogs use safe-area padding, keyboard avoidance, bounded height and scrolling. This includes project/material/worker/client forms and inline issue, photo, milestone, counter-offer and assignment dialogs. Long alerts and logout confirmations scroll as well.
- Attendance cards and purchase-order toolbars fit narrow screens and the 1024px desktop transition.
- Native charts use React Native rows/bars; browser charts retain Recharts. Google Maps script loading is isolated to web. Project status selection works with native controls.
- Native configuration enables tablet layouts, both orientations and Android keyboard resizing. Configuration changes require a new native build.
- Landing navigation fits phone/tablet widths and section links use the shared ScrollView on web and native. Unassigned-site messages can scroll on short screens.

## Verification

The final portal matrix passed **540 viewport checks across 135 route entries** (including redirects and a duplicated attendance route pattern), with zero detected overflow/control-boundary/runtime-overlay failures. The development server exhausted its default heap during the first attempt; remaining routes were resumed on a restarted preview. Failed infrastructure attempts are not counted as passes. Browser tests use fabricated sessions and mocked data; they do not validate production authorization or change production records.

- Authentication: 32 checks covering partner/team login and registration at 1920x933, 1536x746, 1366x657, 1024x768, 768x1024, 390x844, 320x568 and 844x390; scrolling, logo and footer reachability checked.
- Populated checks: **40 passed** across all six role dashboards plus admin client/material/project/attendance screens, using long project labels and sample budget/stock data.
- Additional auth/landing checks: **24 passed** across admin login, forgot/reset password and landing. A further six landing checks verified interactive control bounds and section-link scrolling.
- Project modal and drawer: portrait phone, landscape phone, tablet and desktop checked; submit action reachable and input widths bounded.
- Report calculations: 8 tests passed. PDF/XLSX export test passed with 81 rows, paginated PDF, numeric spreadsheet cells and escaped print HTML.
- Android and iOS JavaScript bundles exported successfully after the responsive changes. This is not an APK/IPA installation or physical-device test.

| Portal | Route entries | Viewport checks |
| --- | ---: | ---: |
| admin | 48 | 192 |
| pm | 28 | 112 |
| client | 18 | 72 |
| site-manager | 20 | 80 |
| supplier | 7 | 28 |
| worker | 7 | 28 |
| site | 7 | 28 |

## Reproduce the portal audit

Start the Expo web preview on port 8083 (wait for Metro readiness), then run `node frontend/scripts/audit-responsive.cjs` from the repository root. The script needs Playwright and Chrome; `PLAYWRIGHT_MODULE_PATH` can point to an existing Playwright installation. Configuration:

- `RESPONSIVE_URL`: preview URL, default `http://localhost:8083`.
- `RESPONSIVE_ROLES`: comma-separated portals, default all seven route namespaces.
- `RESPONSIVE_ROUTE`: optional exact route for a targeted recheck.
- `RESPONSIVE_RESUME=1`: preserve passing checks and retry only unfinished/failed routes.
- `RESPONSIVE_OUTPUT`: JSON result path, default `.validation-web/responsive-results.json`.
- `BROWSER_CHANNEL`: Playwright browser channel, default `chrome`.

The matrix checks rendered portal chrome, document width, controls outside the viewport, runtime errors and development error overlays at 320x568, 768x1024, 1024x768 and 1440x900. Dynamic routes use a fixture ID and may show an empty/not-found state. Aliases and redirects are included. This does not exercise every populated detail record or every mutation flow.

## Remaining verification limits

- Android SDK `adb devices -l` returned no connected devices/emulators. No iOS runtime was available. Native keyboard interaction, touch gestures, large accessibility fonts, iPad split view and device safe areas still need physical/simulator QA.
- Follow-up full frontend lint: zero errors, 120 warnings (mostly unused variables/imports and hook dependencies). Warnings are not suppressed.
- Follow-up whole-project TypeScript: **zero errors**. Fixed all eight previous errors: approval payload (the earlier audit incorrectly called this a receipt argument), relation shapes, obsolete supplier callback/tab, and profile metadata typing.
- Passing a viewport matrix cannot establish that every possible device, data value and OS/browser combination has zero defects. No deployment or native store release was performed.

## Error-fix follow-up (2026-10-06)

- Fixed all 8 TypeScript errors and all 24 ESLint errors found by the follow-up checks. Node-only lint globals are scoped to tooling files; JSX quotes are escaped without changing visible text.
- To-one database joins now normalize object, array and missing responses before UI rendering/search. No unsafe type assertions were added.
- Backend authorization now reads the authenticated caller's protected profile; editable metadata cannot elevate roles.
- Delivery/receipt use database RPC transactions rather than separate Python stock and status writes. Database rejection codes retain meaningful HTTP statuses.
- Cost estimates no longer label tree agreement as calibrated confidence; provenance comes from metadata and defaults to `unverified`. The synthetic-estimate regression uses the current required request fields and a deterministic model fixture.
- Frontend relation/approval regressions passed. Backend suite: **48 passed**, with 13 dependency/deprecation warnings. No live database writes were performed by these tests.

**Deployment prerequisite:** apply `backend/migrations/20261006_receipt_stock_boundary.sql` before deploying the changed order endpoints. It reinstalls the atomic RPCs and removes the delivery-time inventory trigger so receipt is the sole stock increment. The migration passed 7 isolated in-memory PostgreSQL (PGlite) checks, including repeatable application, authorization, idempotent delivery/receipt, legacy material resolution and rollback on failure. Run `node backend/tests/receipt_boundary.mjs` to reproduce. It has not been applied to a live database. It does not reconcile stock already double-counted by earlier deployments.

Remaining warnings: frontend has 120 lint warnings; backend tests report dependency/lifecycle deprecations and persisted scikit-learn 1.9.0 models loaded under 1.9.1. These are separate from the corrected compilation/lint errors and failing tests.

## Site manager follow-up (2026-10-07)

See [SITE_MANAGER_FLOW_AUDIT.md](SITE_MANAGER_FLOW_AUDIT.md) for functional fixes, 61 backend test passes, 10 browser workflow scenarios, 33 viewport checks, native bundle verification and current project-wide TypeScript limitations. The user reports the receipt-stock migration has been applied.

## Whole-app responsive follow-up (2026-10-08)

The shared portal layouts now show one compact header and drawer below 1024 px; native always uses the drawer. Text wraps and scales to 1.3, touch controls meet the 44 px target, forms keep keyboard access, and shared modals and assignment/search overlays remain inside the viewport. Data-heavy views use compact cards where needed. Auth forms retain their logo and scroll at normal browser zoom. Admin project and attendance site details now have distinct routes. The app resolves a native API host from the Metro LAN address, with an explicit `EXPO_PUBLIC_NATIVE_API_URL` option for tunnel use. Native date inputs use the Expo-compatible date picker.

The populated-fixture web matrix passed for 113 portal screens at 360, 390, 768, 1024 and 1440 px: 593 recorded checks including targeted rechecks, with zero failures, browser exceptions, outside controls, or controls below 44 px. Nine auth/public screens passed the same five widths (45 checks). Sixty-five separate drawer, header, account, modal and dropdown interactions passed. The site-manager flow passed 24 functional and viewport checks, including manual attendance, QR image/camera decoding and team removal; the project-manager flow passed 26 functional and viewport checks. See the per-screen verification lines in the root AGENT.md. These browser checks use synthetic populated data and mocked APIs; they do not verify live production permissions or every data state.

Android and iOS JavaScript bundles exported successfully. TypeScript, Expo dependency alignment and ESLint were rerun after source changes. No physical Android/iOS device or iOS simulator was available here, so native keyboard behavior, camera permission prompts, notch/safe-area variants, font scaling on device and iPad split view still require device QA. The LAN API also needs a reachable backend bound to the network interface for physical Expo Go testing.

Final static checks: `npx tsc --noEmit` passed; `npx expo install --check` passed; `npx expo lint` finished with zero errors and 91 warnings (mostly pre-existing unused imports/variables and hook dependencies). Final-source Android and iOS exports passed after the last route changes.
