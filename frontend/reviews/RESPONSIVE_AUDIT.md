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
- Focused lint passed with zero errors and two pre-existing unused-code warnings in the landing page.
- Whole-project TypeScript checking retains eight existing errors: order receive argument, stock/project relation shapes, client/PM report relation shapes, supplier dashboard prop, obsolete `/home` tab link, and an implicit parameter type in ProfileScreen. Responsive components introduce no additional type errors.
- Passing a viewport matrix cannot establish that every possible device, data value and OS/browser combination has zero defects. No deployment or native store release was performed.
