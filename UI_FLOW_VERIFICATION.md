# UI and workflow verification

The shared project workspace connects overview, milestones, reports, issues, expenses, payments and variations, documents, materials, orders and payroll. Admin and manager screens reuse the same components. Clients can discover financial approvals and issue reporting from their sidebar.

## Workflow order

1. Create the project, assign participants, apply the BOQ and define milestones.
2. Request materials; a manager reviews the request and creates an assigned order.
3. Supplier confirms price and delivery; the site manager records actual received quantities. Retries carry an idempotency identifier.
4. Record site progress, milestone evidence, issues and stock-backed expenses.
5. Close attendance, review the period, generate project payroll and record payment.
6. Create payment stages and variations; verify payments with evidence and obtain client approval for budget changes.
7. Review documents, resolved issues, reports and financial totals before project closure.

## UI and performance changes

- Shared fields, notices, responsive modals, status badges and loading states.
- Added project commercial, document and issue screens.
- Shared milestone editing and creation across admin and manager portals.
- Order creation takes an explicit unit price and preserves project selection.
- Material review, receipts and payroll retain their project context.
- Material dashboard panels share one managed-project scope. The browser regression asserts one initial project read.
- Concurrent fresh API reads coalesce; completed responses remain uncached.
- Order search filters loaded rows without a network request per keystroke.
- Independent report sources load in parallel with explicit database project filters.

## Confirmed checks

- Backend: 195 tests passed. Five dependency/deprecation warnings remain.
- Transactional SQL: 35 checks passed in isolated PGlite.
- TypeScript: passed.
- Web static export and Android JavaScript export: passed. No Android device or APK execution was performed.
- Frontend regression suite: passed.
- Browser fixtures: twenty workflow scenarios passed, including the financial/payroll workflows, six role-specific dashboard shortcuts, supplier inbox scrolling and the worker QR dialog.
- Live browser: 19 pages across all six dedicated QA roles passed. The manager payroll page was corrected to show exact cents and passed its targeted retest.
- Final live API run: completed successfully, including ledger reconciliation, recipient read receipts, all report endpoints, CSV export and nine concurrent report reads with no pooled-connection failure.
- Full portal geometry audit: 822 checks across six viewport widths (320–1440px). Initial failures were corrected and all 48 affected checks passed on retest; combined result has zero failures. This tests fixture rendering, not every possible interaction.
- ESLint snapshot: zero errors; existing warnings remain.

The owner applied the SQL activation bundle. Live API and role-scoped Supabase checks then exercised one labelled `is_test` project and six dedicated QA accounts. The project contains BOQ, assignments, milestones, requested and received goods, stock usage, reviewed attendance, payroll, a simulated client payment, a client-approved variation, uploaded synthetic evidence, a site report, a document, a resolved issue, messages and notification receipts. Actual app permission checks were used for workflow operations. Setup used the server credential only for dedicated QA identities; readback used it only to verify the test project.

## Live project and findings

Project ID: `6b896149-ee9f-4b07-b245-1b41afca82b6`. Open it at `http://localhost:8082/admin/projects/6b896149-ee9f-4b07-b245-1b41afca82b6` with an existing administrator account.

| Final record | Value |
| --- | --- |
| Project and milestones | Completed, 100% |
| Budget after approved variation | Rs. 1,015,000.00 |
| Accepted goods | Rs. 19,200.00 |
| Other expense | Rs. 500.00 |
| Paid salary, 9 hours including 1 overtime hour | Rs. 4,156.25 |
| Actual project spend | Rs. 23,856.25 |
| Stock after receiving 12 and consuming 2 | 10 bags |
| Client payment | Rs. 50,000.00, explicitly simulated QA evidence |

No real money was transferred. Test notifications were verified to target only QA participants, and outbound test emails were suppressed. Test records remain for inspection; no existing business records were deleted.

Live testing found and fixed salary month DATE compatibility, legacy salary status compatibility, missing message-to-profile foreign-key assumptions, abbreviated salary amounts, the missing salary payment UI action, and Windows HTTP/2 socket failures during concurrent report reads. Backend clients now use pooled HTTP/1.1 connections while report reads remain parallel. Payment actions confirm the exact amount and scope updates to the project; repeated payment calls do not duplicate ledger cost.

The repeatable API harness is `backend/scripts/verify_live_workflow.py --execute`. Its checkpoint file, account passwords and any tokens remain under ignored `.validation-db`; do not publish that directory. The real browser read-only harness is `frontend/scripts/test-live-project-browser.cjs`. Fixture tests are separate from these live checks.

No physical device, APK or iOS execution was performed. The responsive/browser results cover the tested states, and do not establish that every possible system state is free of defects.

The generated activation bundle combines eight migrations in one transaction. Rebuild it using `backend/scripts/build_workflow_bundle.py` after migration changes.

## Payroll overlap follow-up

The reported raw `23505 / Overlapping payroll already exists` dialog exposed a gap between exact-period duplicate checks and the database's overlapping-period guard. Generation now checks all overlapping slips for the selected project and workers before attempting the batch. Exact-period retries retain existing slips and return an `already_generated` count. Other overlaps return HTTP 409 with existing worker names, dates and statuses; no new slips are inserted. The database guard still protects concurrent requests, which receive a safe conflict message.

Admin and manager screens show an inline explanation and a link to existing payroll instead of exposing database error objects. Changing the project or dates clears stale conflict results. Live checks on the dedicated QA project confirmed overlap handling, exact-period idempotency, and unchanged existing salary records. Ten additional backend regression cases cover boundary overlaps, containing periods, exact retries, adjacent periods, separate projects/workers and concurrent conflicts. No payroll history was deleted or overwritten to resolve the issue.

Both conflict screens passed browser interaction checks at 320, 390 and 768px, including opening the existing salary record. TypeScript and targeted ESLint completed with no errors.

## Attendance identity and monthly payslip follow-up

Attendance reads now resolve project IDs to their physical site IDs before querying attendance and return the actual project ID. Manager scope is applied in the database query. Worker and profile identities are resolved explicitly rather than assuming a PostgREST foreign-key join. The HTTP response now includes the required role/creation fields and the check-out/site/worker identifiers.

Payroll summaries group by project and worker identity, keeping workers with identical names separate. Day totals count a date once and exclude leave; an explicitly zero daily rate stays zero.

Worker monthly summaries combine all recorded payslips overlapping the selected month, including partial periods and multiple projects. They sum stored amounts and deductions, label the result as recorded payslips, and avoid showing one invented daily rate when rates differ. Cross-month slips retain their full recorded period amount with a visible explanation; no unsupported daily proration is calculated. When no slip exists, the endpoint continues to return a clearly labelled attendance estimate.

Thirteen new backend cases verify site mapping, manager boundaries, valid HTTP responses, identical worker names, leave/duplicate days, partial/multi-project slips, cross-month periods, zero amounts and worker-only access. Read-only live checks passed against the existing QA project, and its actual worker screen passed. The combined-slip browser fixture passed at 320, 390 and 768px. Existing payroll records were preserved.

## Dashboard visual follow-up

All six dashboards received shared role headers, aligned metric surfaces, section spacing, accessible workflow shortcuts and light/dark refinements. Detailed role changes and table verification are consolidated below. Final dashboard checks passed at six widths in both themes: 72 checks, zero failures. No connected database changes were needed for this UI task.

### Consolidated dashboard UI notes

- Admin: operations header, aligned metrics, project/material/payroll shortcuts, analytics sections and retryable loading/error states.
- Project manager: matching project workspace, physical-site attendance scope and Sri Lankan workday dates.
- Site manager: five workflow shortcuts, issue states and a site pulse panel.
- Supplier: two-column mobile metrics, refresh control, delivery/message shortcuts, direct inbox scrolling and consistent project cards. Alerts use existing order data rather than requesting global late-order notifications.
- Client: project/payment/message shortcuts, milestone progress and an upright budget-ring label with an actual progress arc, zero-budget handling and preserved over-budget percentages.
- Worker: attendance/pay/message shortcuts, attendance chart, recorded-pay labels and a scrollable QR dialog.
- Shared spacing is 16/24/32px; metric footers reserve room for wrapped labels. Panels share padding, corners and section spacing. Shorter animations respect reduced-motion preferences; AnimatedCard surface classes live on a native View. Dark icon/status contrast matches surrounding surfaces.

Historical dashboard verification covered 320, 360, 390, 768, 1024 and 1440px in both themes: 72 geometry checks and 20 workflow scenarios passed, along with TypeScript, targeted ESLint, frontend regressions, web export and Android JavaScript export. Synthetic service traffic was intercepted. Screenshots are under ignored `.validation-ui/dashboard-before`, `.validation-ui/dashboard-final` and `.validation-ui/dashboard-dark`. These are browser/bundle results, not physical-device or APK execution.

### Consolidated table and status layout notes

Recent Estimates measures its own panel width: wide panels reserve date/cost/status/action space; narrow panels use cards with wrapping groups of whole controls. Dates use `22 Oct 2026` formatting, status badges stay on one line, and action buttons retain usable height. Inventory, attendance, active projects, supplier orders and admin/PM purchase orders use the same container-width approach.

Historical fixture verification included long titles and Approved, Pending, Rejected, Draft and Pending Delivery states: 822 whole-route checks, 18 estimator checks at nine widths from 320 to 1920px, and 22 workflow scenarios passed. Estimator tests covered non-overlapping actions and PDF downloads at eight widths. TypeScript, targeted ESLint, frontend regressions, web export and Android JavaScript export passed. Artifacts are under ignored `.validation-ui/wrapping-final` and `.validation-ui/estimator-wrapping`. No connected business records were changed. These tested states do not establish that every device or live-data combination is error-free.

## Connected, editable BOQ workflow — 2026-11-17

The owner applied `backend/migrations/20261117_boq_connected_workflow.sql`; connected API and real-browser verification are complete as of 2026-11-18. The setup bundle generator now includes all ten migrations; existing installations should use the standalone BOQ upgrade rather than rerunning unrelated setup scripts.

- Every parsed work line is retained instead of the former 100-line preview. Stable references connect project BOQ work/material/labour records to operations. Material-rate sheets are merged by name AND unit. Material/labour references are not added to work amounts a second time when calculating the baseline total.
- Project creation keeps editable budget, assignments, milestone names/dates and BOQ quantities/rates. Source phase references survive renamed milestones. BOQ phases omitted from the editable milestone list still receive a linked phase record, without overwriting existing completion or stored dates. Progress uses BOQ phase-budget weights; projects without weighted phases retain their previous average calculation.
- Admin and assigned PM workspaces support BOQ upload review, paginated item editing, explicit quantity × rate calculation or edited lump sums, trade daily/overtime rates, private agreed project worker rates, revision reasons/history, conflict protection and explicit discard/reload. Clients have a read-only BOQ view. Site managers receive assigned material quantities without financial rates; workers/suppliers cannot open the BOQ register.
- New material requests, purchase orders, expenses, payment stages and variations require a valid project BOQ reference once a baseline is initialized. Requests/orders inherit their material link; order choices prefill the remaining planned quantity and editable BOQ reference price. Request reviews also prefill the BOQ rate. Procurement cannot bypass material quantities by selecting a work or labour row. Payment schedules cannot exceed their work item's value plus its approved variations.
- Supplier delivery and quantity-aware receipt workflows retain the original order reference. Receipts update actual stock/cost as before. BOQ edits only update planning fields, never on-hand quantities or their actual weighted receipt cost. Material renames preserve stock identity; units cannot change once stock/orders exist. Archived BOQ references remain available for past transactions.
- Stock consumption is recorded as a quantity movement with zero additional expense: received goods are already counted in project costs. Additional charges and any legacy opening-stock valuation must be recorded separately. Historical expense amounts are not rewritten.
- Payroll generation and worker estimates use an explicit private project worker rate first, then an exact BOQ daily-trade match, then the worker's agreed profile rate. Hourly rates are not mistaken for daily pay. BOQ overtime hourly rates apply where supplied; otherwise the existing 1.5× rule applies. New BOQ payroll records retain their revision/rate source and matching labour reference; historical paid slips remain unchanged. Private worker overrides are stored outside project JSON and are unavailable to clients/site managers/suppliers/other workers.
- Revisions preserve approved variation amounts and budget adjustments relative to an existing BOQ baseline. The first BOQ on a previously manual project also preserves approved variations. Existing records are not linked by guessing names: managers have an explicit project-scoped reconciliation action. BOQ history prevents permanent project deletion; archive remains available.
- Previously truncated BOQs require the original complete file before revising their baseline. Both the API and database reject a declared item count larger than the saved item list, preventing a partial preview from silently reducing the budget.

Local validation: 248 backend tests passed (five existing deprecation warnings); 57 in-memory PostgreSQL transaction/security checks passed, including applying the migration twice. The full browser workflow run passed 42 scenarios; the focused BOQ run passed seven scenarios, including one additional truncated-source guard (43 distinct scenarios combined). BOQ/form geometry passed 32 light checks and 12 dark checks at 320/390/768/1440px. TypeScript and ESLint passed with zero lint errors/warnings; frontend regression scripts and web/Android/iOS JavaScript exports passed. Physical-device/APK execution was not performed. Current artifacts are consolidated under ignored `.validation-ui/current/`.

Open a project → BOQ. Review/save the first revision for existing BOQs, re-upload any incomplete source, and explicitly reconcile historical records. New projects uploaded through the creation form initialize their baseline automatically.

### Connected verification completed

47 live API checks passed using the existing six synthetic QA accounts and the labelled `CF UI QA - 20261116-163611` project only. Its BOQ is now revision 1: the existing baseline material, two completed phases and agreed labour trade rate are connected. Existing order, request, expense, client payment and approved variation references were explicitly linked. No accounts, real payments or outbound emails were created.

The live checks covered six-role access, stale/unauthorized revisions, invalid references, excessive orders, over-allocated payment schedules, insufficient stock, unchanged historical paid payroll and private rate isolation. The already-paid period remained an idempotent no-op. Project and financial values before/after were identical:

| QA value | Preserved result |
| --- | ---: |
| Project budget, including approved variation | Rs. 1,015,000.00 |
| Actual spend | Rs. 23,856.25 |
| Material cost | Rs. 19,200.00 |
| Paid salary | Rs. 4,156.25 |
| Other recorded expense | Rs. 500.00 |
| Remaining budget | Rs. 991,143.75 |
| Ordered / received / used | 12 / 12 / 2 bags |
| Stock on hand and actual unit valuation | 10 bags at Rs. 1,600.00 |
| Completion / status | 100% / Completed |

Live parser validation exposed a separate numeric-ingestion defect: stripping arbitrary characters could convert negative numbers to positive quantities, exponent notation to a different value, and formatted rupee prices to zero. The parser now preserves signs/exponents, explicitly handles currency formatting, rejects invalid/nonfinite/negative values, and retains literal NaN tokens for rejection rather than treating them as blank cells. Real API checks and six added backend regression cases passed; no further database migration was needed for this backend fix.

Real Supabase browser checks passed for Admin, Project Manager and Client BOQ pages at 390px: correct data, correct edit/read-only access, no failed API requests, no rendering errors and no horizontal overflow. The browser blocked application mutations during these checks. Results are in `.validation-ui/current/live-boq-results.json` and `.validation-ui/current/live-boq-browser-results.json`. Existing non-QA projects and the historical admin-only estimate mappings were not changed.

## Map tile access and project-modal alignment — 2026-11-18

The blocked-map screenshot was reproduced at the request-header level: sandboxed `srcDoc` documents sent no Referer to the tile provider, even with a referrer meta tag. The web map now loads a static document from the separate API origin at `/api/maps/frame`, with origin-only referrers. It retains iframe isolation from frontend storage, validates message source/origin, and transfers configuration through postMessage rather than URL parameters. Same-origin API/frame configurations fail closed with a manual-address fallback; deployment requirements are documented in `frontend/README.md`.

The frame has restrictive CSP/script hashes and configured frontend embedding origins. The backend ships `static/constructflow-map.html`, generated from the same map implementation used by native WebViews; native requests identify the app as ConstructFlow/1.0. OpenStreetMap contributor attribution remains visible. Failed tiles show a readable notice instead of broken images; pinning/address entry remain available. Automated geometry/map tests intercept map tiles instead of downloading them from public providers.

Header text was also overflowing the narrow New Project modal. Its header now shrinks/wraps inside the available width; the footer wraps and keeps its controls within the modal.

Validation: isolated-map Chrome regressions passed for successful/failed tile loading, origin-only referrers, pin callbacks and denied access to frontend storage. A single correctly identified provider diagnostic returned HTTP 200 and a valid Sri Lanka map tile. Backend tests: 250 passed with five existing deprecation warnings; TypeScript, targeted ESLint and frontend regression scripts passed. The date-sensitive attendance test fixture now serializes the check-in's actual Sri Lanka date; production attendance validation was not relaxed. Live project-modal checks use the existing QA admin, mock all tile/geocoding requests and block application mutations; no project is created by these tests.

## Existing-system refinements — 2026-11-18

All six dashboard introductions now use a compact shared component, plain operational headings, restrained orange accents, a date and a divider. The large dark banner and decorative circles have been removed. Live read-only checks passed for all six existing QA roles at 320, 768 and 1440px; screenshots and results are under `.validation-ui/current/`.

Admin and Project Manager purchase-order lists now request 25 rows per page with an exact filtered count and deterministic date/ID ordering. Debounced server search covers PO number, material text and supplier across every page, retaining project/supplier/status filters and RLS. Stale requests are aborted. Fixture browser checks cover forward/back navigation, the last page, cross-page search, status changes and three viewport sizes. Real Supabase reads also passed for both roles, including punctuation in search values.

Both order forms share field-specific validation and a submission hook that keeps a request UUID for uncertain-response retries. The backend derives an actor/project-scoped order primary key from this UUID: existing-row replay and concurrent unique-key recovery do not create another order or supplier notification. Changed payloads conflict instead of silently returning a different order. Replay accommodates BOQ-trigger catalog-to-stock remapping and subsequent order-status changes. This applies to submissions from these forms while their retry state remains mounted; reopening the form begins a new submission. NewMaterialModal now exposes the existing BOQ reference selector. Blank labels and nonfinite derived totals are rejected before writes. API validation arrays become readable field messages without echoing rejected inputs.

`backend/migrations/20261118_boq_read_optimization.sql` replaces repeated per-line financial subqueries with project-scoped grouped aggregates. Response fields, cost rules, privacy filtering and role checks remain intact. Differential SQL checks compare Admin, Project Manager, Client and Site Manager results before/after, deny worker/supplier/unassigned-manager reads and apply the migration twice. All 58 SQL checks passed. Live activation requires the owner to run this migration in the Supabase SQL Editor; it changes a read function only and does not update business records.

Shared dashboard presentation, pagination, order validation and submission state are separated into reusable components/hooks/utilities. TypeScript and ESLint pass. Frontend regression scripts pass, including invalid procurement values, readable errors, concurrent taps and retry-key preservation. Focused backend procurement tests: 23 passed. No new accounts, emails or live business records were created for these checks.

The owner subsequently confirmed applying the BOQ read optimization migration. All 24 read-only live API/Data API checks passed across the existing six QA accounts. Authorized API and RPC responses agree; workers and suppliers remain denied; Client and Site Manager privacy restrictions remain intact. The QA project retains revision 1, budget Rs. 1,015,000, spend Rs. 23,856.25, 100% completion and ordered/received/used quantities 12/12/2. Financial summaries and stock valuations match the pre-optimization checkpoint. Results are in `.validation-ui/current/boq-optimization-live-results.json`. No before/after production benchmark was captured, so no percentage speed improvement is claimed.

## Map search accuracy — 2026-11-18

Location search now merges bounded Sri Lanka Photon/Nominatim results rather than accepting an unrestricted first provider result. Full query terms are retained, textual name/city matches rank first, duplicates and invalid/foreign coordinates are filtered, and results identify their source and partial matches. The frontend displays the first result as well as alternatives and changes the site address/pin only after explicit selection. It cancels stale searches and prevents earlier reverse-geocoding responses from overwriting a newer selection or an edited address. Empty indexes and provider outages have separate messages; no guessed business coordinates are generated.

Nominatim forward/reverse requests use the same backend cache/throttle; direct client-side Nominatim retries and trailing-word searches were removed. Configurable service URLs and the single-worker/public-provider deployment requirement are documented in `frontend/README.md`. Search remains submit-only. No keys or database settings changed.

Fixture browser selection/empty-state/pin checks passed at 320, 390 and 1440px, with no projects saved. TypeScript and targeted lint passed. The backend suite passed 268 tests before the final two focused regression cases were added. Real backend diagnostics returned 10 Sri Lanka results for Negombo, but zero for “Enrich Arcane Negombo”; the business is absent from these tested public search results. The previously configured Google geocoding credential returned REQUEST_DENIED during diagnosis. The business's official website lists 408/1/1, First Floor, Colombo Road, Negombo; that address can be searched or pinned, but no exact indexed-business match is claimed. Live diagnostics are saved in `.validation-ui/current/map-search-live-results.json`.

## Google Maps and Places autocomplete integration — 2026-11-18

The owner explicitly selected Google Maps + Places after the free indexes could not resolve many business names. The shared web/native map component now reads the selected provider from the data-free `/api/maps/config` endpoint. Setting the dedicated browser-restricted `GOOGLE_MAPS_BROWSER_KEY` activates Google maps across these components. The API-origin Google frame uses Google's `PlaceAutocompleteElement` restricted to Sri Lanka, with Google-managed autocomplete sessions, fetching only location/name/formatted address on selection. Selected place details update the map pin and editable project address. Manual pins use Google's geocoder; satellite mode and project markers remain available. The full project-create page and dashboard modal both accept the selected address without overwriting it via another provider. A custom production map ID can be supplied with `GOOGLE_MAP_ID`; local testing defaults to the demo ID.

The isolated Google frame has fresh nonce-based CSP, validates parent messages, does not read frontend storage and embeds only the explicitly browser-visible Google key. Google results are displayed on Google maps, not Leaflet. Attribution links may open separately. No server-only key is copied into browser assets, and `/maps/config` exposes no key. Native uses the same API-hosted document, preserving the existing GPS permission flow. Physical native-device Google SDK checks remain unverified.

Until a Google key is configured, the free UI offers 450ms-debounced, three-character Photon suggestions with bounded cache entries. Explicit Search still merges the existing providers. No autocomplete request uses Nominatim; empty/outage messages remain distinct. The browser cannot silently commit the first suggestion as a project address.

Validation: backend suite 274 passed with five existing deprecation warnings; the final four map-frame tests passed again after map-ID support. TypeScript, targeted ESLint and frontend regression scripts passed, including native GPS branches with the Google WebView URL. Synthetic Google SDK browser tests passed at 320, 390 and 1440px for widget suggestions, selected-field requests, pin/address synchronization, manual pins and parent-storage isolation. The separate project-create page selection also passed. Free typing/selection/empty-state browser regressions passed at the same widths. These Google tests intercept all provider traffic: they prove integration behavior, not live business coverage or credential validity. Results are under `.validation-ui/current/google-map-browser-results.json` and `map-autocomplete-browser-results.json`. No real Google billing requests, project saves, identities or emails were created by these tests.

Live activation and the real “Enrich Arcane, Negombo” check are pending the owner's browser key. The setting remained empty at the final check. `frontend/README.md` and `backend/.env.example` document billing, Maps JavaScript API + Places API (New), Geocoding API for manual-pin addresses, HTTP referrer restrictions for the API frame origins, backend restart and frontend refresh.

## Confirmed Geoapify key and active free-provider flow — 2026-11-18

The owner subsequently supplied a key and explicitly confirmed it belongs to Geoapify. It was saved only as `GEOAPIFY_API_KEY` in the existing ignored backend `.env`; the value is not repeated in this report. No key was sent to another provider. Geoapify configuration now takes priority over optional Google mode, retaining the free Leaflet/OpenStreetMap map. Backend-only Geoapify autocomplete, search and reverse lookup use Sri Lanka filtering, bounded caches, request coalescing and a conservative per-process request throttle. Errors omit authenticated URLs and key values. API metadata exposes provider names only. Geoapify links and OpenStreetMap attribution are visible in the search/map UI. No Google key, billing setup or database migration is required for this configuration.

The popup search was extracted into shared `SiteLocationSearch` and added to the full project-create page. It includes typing suggestions, full-search fallback, keyboard selection, city-aware zoom, stale-request cancellation and explicit address/pin selection. Provider-translated and fuzzy results are retained with partial-match labeling rather than being discarded by literal token matching.

Geoapify accepted the real key (HTTP 200). Negombo resolves successfully. Enrich Arcane was not returned by autocomplete, full address search or a separate bounded named-business lookup within 20km of Negombo; the system does not invent a replacement location. This remains a provider coverage limitation. Raw public diagnostic results, without credentials, are in `.validation-ui/current/geoapify-provider-results.json`.

Verification: backend tests 281 passed with five existing deprecation warnings; TypeScript, targeted ESLint and frontend regressions passed. Eight read-only live API checks passed for active Geoapify selection, valid coordinates, reverse address lookup, cached repeats, absent-business handling and no private key in API/metadata responses. Modal browser checks passed at 320/390/1440px, including keyboard selection at 390px; the full project-create page selection also passed. Browser search responses in those geometry tests were synthetic; the separate real-provider browser check uses Negombo and saves no project. Tests do not create users, send emails or modify live business records. Physical native camera/GPS/device behavior remains outside these browser checks.

The separate real-provider Chrome check passed: typing Negombo returned an actual Geoapify suggestion, choosing it set the matching pin coordinates/address, the Geoapify attribution was visible, and no browser request contacted `api.geoapify.com` or carried the provider key. Map tiles were mocked to avoid public tile downloads. No project was saved. Results and screenshot: `.validation-ui/current/geoapify-real-browser-results.json`, `geoapify-real-browser.png`. Final full-source ESLint passed.

## Search relevance and exact-site precision — 2026-11-18

The owner reported both missing suggestions and inaccurate pins, then supplied ATI Galle, Think Path and Mr Kottu as failing examples. Live checks reproduced misleading partial results: Galle-related businesses for ATI Galle, generic Path records for Think Path, and MR-prefixed schools for Mr Kottu. Multiword Latin queries now require substantial token coverage or a joined-name match; unrelated shared words are removed. Compound names, minor single-word typos and non-Latin translated results remain supported. Full search checks Geoapify's named Places endpoint when ordinary address results do not cover the full query. City suffixes are retained as a geographic constraint; bounded spelling/spacing, Mr. and ATI expansion variants are checked without changing source display names. Typing suggestions remain one autocomplete query to conserve quota.

City/area and street results now preview/zoom the map without assigning a project pin or address. Users click/drag the actual site instead. A coordinate summary explains that reverse lookup gives the nearest mapped address, which remains editable. Valid Sri Lanka decimal latitude/longitude input can set an exact pin without another geocoding request. Shared map refs distinguish preview navigation from pin placement, and the generated Leaflet asset/frame version was updated to avoid stale cached behavior.

Live full search finds Jetwing Blue in Negombo as a full named match ahead of unrelated partial properties. ATI Galle, Think Path, Mr Kottu and Enrich Arcane still have no reliable match in the tested Geoapify paths; provider coverage has not been represented as fixed. For missing results the UI offers an official Google Maps search URL, then instructs the user to copy/paste the desired coordinates. This URL opens only on user click and requires no Google API key; it does not scrape Google results or automatically import a guessed point. See https://developers.google.com/maps/documentation/urls/get-started .

Checks: backend suite 289 passed with existing deprecation warnings; TypeScript, lint and frontend regression scripts passed. Real Chrome tests passed for city preview with no false pin, manual-pin reverse address, exact coordinate entry, and the selected Jetwing Blue marker matching provider coordinates/address. No project was saved. The additional Think Path browser scenario checks that unrelated Path rows and a false pin are absent, the Google Maps fallback is visible and exact coordinate entry remains available. Public result diagnostics and browser reports are in `.validation-ui/current/location-accuracy-live-results.json`, `location-precision-browser-results.json` and `missing-place-browser-results.json`. No accounts, emails or business records were changed.

## Screenshot typo: shrangila — 2026-11-18

The user's screenshot showed the exact query `shrangila`. A public Photon diagnostic resolved it to Shangri-La Colombo, Hambantota and Kandy, despite no relevant Geoapify suggestion. Empty/irrelevant Geoapify results now fall back to bounded, cached Photon suggestions. The private Geoapify key is never sent to Photon. Typing fallback does not use Nominatim. Compound-name prefix similarity accepts this transposition as a partial match while retaining strict rejection of unrelated shared-word results. Photon city/street precision metadata is normalized so broad results still preview rather than commit a site pin. The search explicitly explains that the current site remains unchanged until selection.

Real Chrome verification passed for the screenshot's misspelling: Colombo and Hambantota branches were available separately; a previously selected Negombo coordinate pin/address stayed unchanged while searching; selecting Shangri-La Hotel Colombo updated the marker to the returned Colombo coordinates and replaced the address. No project was saved, provider-key requests stayed on the backend and tile requests were mocked. Report/screenshot: `.validation-ui/current/shrangila-browser-results.json`, `shrangila-search-browser.png`. Backend tests: 291 passed with existing warnings. TypeScript and targeted ESLint passed.

## Delayed map readiness and failed-load recovery — 2026-11-18

Following another reported map failure, checks used the owner's actual `http://localhost:8081` entry point rather than only the secondary QA port. Localhost and numeric-loopback map metadata agreed. Realistic 550ms-per-character typing of shrangila completed successfully, including branch selection and pin/address synchronization. Duplicate development bindings were inspected but were not claimed to be the cause or stopped without evidence.

A separate actual bug was reproduced by delaying the Leaflet script for 15 seconds: choosing Negombo while the map was loading lost the preview navigation, and the final center/zoom assertion failed. Both shared map implementations now retain the last requested navigation until map readiness. It is applied after the initial pin/project-marker effects; a newer immediate command clears an obsolete pending command. Google native preview has the same callable helper as Leaflet.

Web failed loads expose a Reload map action that remounts the frame with current configuration and restarts the loading timeout. Native WebView HTTP/network errors also expose reload. Reload preserves selected coordinates and pending navigation. The owner's-port regression now passes for selecting a city before map readiness. Another browser check injected one HTTP 503 map document, selected coordinates while unavailable, reloaded the map and verified the final pin and zoom 18 without refreshing the app. No project was saved and tile requests were mocked. Reports: `.validation-ui/current/user-port-map-results.json`, `early-search-browser-results.json`, `map-recovery-browser-results.json`.

TypeScript, targeted ESLint, frontend regressions and four backend map-frame tests passed. Physical native Google/WebView recovery remains unverified. These changes fix confirmed lifecycle/recovery defects; they do not expand provider business coverage or establish that every possible reported map issue is resolved. A request for the owner's current exact failing search/action remains pending.
# Project transaction error diagnostics — 2026-11-18

Follow-up: the user supplied the specific `Invalid or unapproved admin assignment` error. A read-only live role/approval audit found an approved `Super Admin` profile alongside approved canonical `super_admin` and `admin` profiles. Assigning the approved display-name role to the labelled QA diagnostic project reproduced the exact P0001 rejection; the transaction rolled back.

Fix: `backend/migrations/20261118_project_assignment_role_names.sql` normalizes assignment role labels while preserving approval checks and the installed transaction/BOQ implementation. It patches only the two known role comparisons, aborts on an unexpected function definition and supports reapplication. It does not rewrite profile or business records. Both project creation forms now list approved profiles only. Local transactional checks: **63 passed**, covering reproduction, approved aliases, canonical stored assignment roles, rejection of unapproved/wrong-role accounts, atomic rollback, PM restrictions and migration reapplication.

Owner confirmed SQL application. Connected verification then repeated the exact approved `Super Admin` assignment on diagnostic QA project `b11f273f-63b1-4753-944a-be5091ab9e00`: HTTP **200**, replacing the previous P0001 rejection. Invalid-worker API checks still return **422** on both localhost and 127.0.0.1, and leave no partial project row. The user's unsaved project/BOQ payload has not been submitted by the agent; the demonstrated admin role mismatch is resolved live.

- Reproduced the connected creation path using existing QA accounts, a small BOQ, materials and a worker assignment. One labelled `is_test=true` project was created successfully: `b11f273f-63b1-4753-944a-be5091ab9e00`. No notification/email endpoint was invoked.
- This does not reproduce the user's exact `BOQ TEST 2` payload; its failure remains unconfirmed. Do not infer that every uploaded BOQ or assignment combination works.
- Replaced the blanket migration error with allowlisted application validation messages and safe messages for permission, missing reference, duplicate, malformed value and date failures. Unrecognized errors include a reference and database error code; SQL details and request payloads are not disclosed.
- Focused backend verification: 37 tests passed, including atomic assignment saves and error disclosure boundaries.
- Connected API verification on both `localhost:8000` and `127.0.0.1:8000`: invalid worker returns HTTP 422 with the specific assignment error. The rejected transaction leaves no partial project row.
- Stopped the previously identified separate QA backend process; the existing reload backend now serves the updated response on both hosts. No SQL migration was applied for this change.

# Supplier notifications route — 2026-11-18

Added the missing `/supplier/notifications` route using the existing shared notification screen (the same implementation used by project manager/client routes), and added Notifications to the supplier sidebar. Existing authenticated notification context and database recipient boundaries are unchanged.

Verified on `localhost:8081` with the existing QA supplier account and application writes blocked: page opens without Unmatched Route, portal page title is present, search and unread filter work at widths 320/390/768/1440 without search-field clipping. Browser result: one page, zero failures. TypeScript and targeted ESLint pass. Report: `.validation-ui/current/supplier-notifications-results.json`.

# Cross-role consistency audit — 2026-11-20

Read-only audit prompted by Worker1's admin/worker payroll screenshots. No application source, salary, attendance, BOQ, project or payment records were changed during this audit.

## Confirmed payroll discrepancies

1. **Different periods without comparable labels.** Admin overview reads all attendance without a date filter; Worker payroll reads the selected month. Live Worker1 has eight Present records: three in October and five in November. The legacy admin formula reproduces Rs.32,016.25 across all eight dates. The canonical November calculation reproduces Rs.21,514.06 across five dates; October is Rs.10,500. The remaining Rs.2.19 difference comes from stored decimal overtime versus timestamp/minute-based canonical calculation. This is not evidence of a missing salary payment: no Worker1 salary slips exist.
2. **“Unpaid” overview does not exclude generated/paid periods.** `frontend/src/app/admin/payroll/index.tsx` fetches salary slips but uses them only to display the latest run. Its pending totals include all matching attendance, regardless of existing slips. Exposure confirmed from code; no paid records were changed to manufacture a live example.
3. **Attendance semantics differ.** Admin overview omits attendance status from its query and accepts any dated record as valid, so leave/absent rows can be counted. Canonical `calculate_payroll` excludes non-Present records and deduplicates daily hours/overtime. Worker1 currently has only Present records, so this is not the cause of its period difference.
4. **Dashboard uses an hourly formula.** `PayrollSummary.tsx` pays `min(total_hours,8*days)*hourly_rate` and derives overtime from aggregated hours. The canonical worker/generated-slip flow pays per Present date and uses daily overtime. Short workdays and days with mixed overtime therefore produce different summaries.
5. **Admin overview is disconnected from project BOQ pay terms.** It uses profile daily rate with a Rs.3,500 fallback and a fixed 1.5x overtime formula. Generation resolves project worker overrides/trade rates through `resolve_boq_pay_terms`. This can disagree when a BOQ pay rate or custom overtime rate is configured.
6. **Zero/missing wage values can be presented as Rs.3,500.** Admin overview/detail and PM slip details contain truthiness-based rate fallbacks. Canonical payroll preserves an explicit zero rate and rejects an unset rate when attendance exists. Stored slip totals often prevent total corruption, but displayed/reconstructed rate breakdowns remain inconsistent.
7. **Worker breakdown cannot explain all BOQ rate combinations.** `PaySummary` always labels estimates as a single daily rate and overtime x1.5. `estimate_project_payroll` can return multiple project rates (daily_rate null) or a custom BOQ overtime rate. The returned total can be correct while the displayed explanation is wrong.
8. **Overview failures/truncation can look like valid results.** Admin overview reads full tables without pagination; rows beyond the Data API row cap may be omitted. Worker-mapping/slip-query errors are not checked; the catch logs errors without a user-visible failure state. These are source-confirmed risks, not a demonstrated row-cap event in Worker1's eight-row dataset.

## Broader checks and limits

- Literal role route references were compared against 155 Expo route files. No additional missing full literal route was found. `/admin` matches basePath configuration rather than a broken screen link. Dynamic templates, data-generated links and all end-to-end actions still require separate interaction coverage.
- Existing-account, read-only role API audit: 13/13 expected responses across all six roles. Notification reads succeed; BOQ reads are allowed to admin/assigned PM/site manager/client and denied to worker/supplier; worker monthly payroll reads succeed.
- Backend suite: 299 passed. Transactional/security/BOQ SQL suite: 63 passed. Frontend security-boundary script passed. These checks do not establish that all business flows are correct; the contradictions above survive the current suite.
- An older multifunction BOQ verifier was rejected by automatic approval review because it contains financial-write functionality. It was not executed. A separate script with no mutation branch performed only existing-account authentication and GET requests; no financial-write approval was requested or needed.
- Audit artifacts: `.validation-ui/current/payroll-consistency-audit.json`, `route-link-audit.json`, `role-read-audit.json`. These are ignored local QA artifacts; no passwords or tokens are included in their output.

# System layout fixes — 2026-11-20

Fixed the reported Project Manager payroll batch modal: attendance review and generation failure content now occupy separate full-width sections above the action row. Mobile/tablet dates and actions stack; desktop actions share available width and align. Long project selector labels wrap within the modal. Cancel has a named accessible button target.

Shared fixes: buttons have vertical padding and can grow for wrapped labels (no two-line label truncation); toolbar/search/filter containers shrink/wrap within their available width; FormModal actions stack full-width on compact screens; filter chips constrain long labels and have vertical padding. New Project BOQ and milestone header containers now shrink and wrap within narrow columns. Attendance review content and its load action are bounded by their parent width.

Verification uses synthetic fixture data and intercepts all database/API calls; no payroll generation, approvals, payments or business records were changed. The live localhost check uses the existing QA PM account with application writes blocked.

- Broad page geometry: 144 role routes at 320/768/1440. Initial pass completed 429 width checks and one PM issues navigation timeout. PM issues passed all three widths on a dedicated rerun. No other overflow, outside-content, wrapped status/date token or render-error failures were detected. This covers closed-page geometry, not every action's state.
- Interactive modals: New Project, project variation, PM batch payroll, site attendance, site issue reporting and supplier counter-offer: 30 checks at 320/390/768/1024/1440. Initially found BOQ/milestone headings and long attendance worker chips extending outside narrow panels; fixed and rerun passed 30/30.
- PM payroll: empty review and loaded attendance/conflict notice layouts each passed six widths, including 1680. Fixture conflict POST is intercepted and returns a synthetic 409; it cannot create salary records.
- Live `localhost:8081` PM payroll modal: passed six widths, cancellation tested, no application writes.
- TypeScript, targeted ESLint, frontend security-boundary and error-regression scripts passed. Web export with fixture-only environment values succeeds. Physical mobile devices/native keyboards are not covered by these browser checks.
- Artifacts under `.validation-ui/current/`: `layout-system-audit`, `pm-issues-layout-recheck`, `system-modal-layout`, `payroll-modal-layout`, `payroll-modal-conflict-layout`, `live-payroll-modal-layout.json`.

# Central audit history — 2026-11-20

Implemented `/admin/audit`, an admin sidebar entry, page metadata, and administrator-only `/api/audit/` reads using the caller's authenticated database client and RLS. Includes action/table filters, keyset pagination, precise string bigint cursors, expandable changed-field details, Sri Lanka timestamps, loading/empty/error states and refresh. API also supports actor/project UUID and timestamp filters.

`backend/migrations/20261120_audit_events.sql` installs append-only audit storage and AFTER INSERT/UPDATE/DELETE triggers on existing supported business tables: projects, account profiles/worker records, assignments, attendance, materials/requests/orders/receipts, expenses, payslips, milestones, commercial records, BOQ revisions/rates, estimates, issues/reports and document/media metadata. Optional absent tables are skipped. Apply it after existing workflow migrations; tables created later require rerunning it to attach their trigger. The migration does not backfill, rewrite or delete business records. Existing purchase-order `workflow_audit`, inventory logs and BOQ version history remain intact.

Audit events capture authenticated actor ID/role where available, action, table, record/project IDs, transaction/time, changed field names and allowlisted operational before/after values. Private message/note bodies, passwords, tokens, file URLs, profile contact details and arbitrary nested payloads are omitted. Fields outside the allowlist show as changed but without values. Service/SQL operations may lack an individual human actor; the UI explicitly states this. Login attempts and auth-provider events are not covered by these public-table triggers. Ordinary users cannot forge/update/delete/truncate logs; even direct owner DML is rejected by immutable triggers, but a database owner can still change schema/disable triggers and is not treated as an adversary this system can defeat.

Audit insertion occurs in the same transaction as the business write, without swallowing errors: rollback removes the audit event, and audit failure prevents the business change. History has no business-record foreign keys, so deleting a project does not delete its history. No automatic retention deletion or historical-event synthesis was added.

Validation: backend suite 307 passed; audit SQL 13 passed; workflow/security/BOQ SQL 64 passed with audit enabled and reapplied on the complete workflow schema; focused audit API 8 passed; TypeScript, targeted ESLint and frontend regression/title checks passed. Audit page before/after details fit widths 320/390/768/1024/1440 and dark mode 390/1440 (7 fixture browser checks passed). SQL application on connected Supabase is pending owner SQL Editor access; live persisted-event capture must be verified afterwards.

Artifacts: `.validation-ui/current/audit-log-ui`, `audit-log-ui-dark`, `audit-live-boundaries.json`; SQL installation: `backend/migrations/20261120_audit_events.sql`.

# Bounded content and compact actions across portals — 2026-11-20

Added a shared `ContentScrollView` and pure route width policy: forms/profile/settings/site screens cap at 920px, worker reading views and messages/notifications at 1040px, project detail workspaces at 1160px, broad dashboards/lists at 1280px. Content is centered within the existing viewport; header/sidebar positioning is preserved. Public pages retain their layouts. Horizontal scrollers and nested scroll surfaces keep their local layout; refs, keyboard and scroll props are forwarded. Screens retain narrower existing child containers. The client milestone FlatList workspace has its own bounded wrapper.

Replaced 120 existing scroll imports with the shared surface (one supplier dashboard import was subsequently removed because only its ref type was needed; its actual scrolling is handled by `DashboardContent`). Desktop shared buttons now size to their labels unless callers explicitly request a width. Mobile form actions retain their existing full-width behavior. Shared cards use softer explicit shadows, subtle theme-aware borders and rounded corners. Worker My Site uses a compact project/location card plus manager contact card side-by-side on desktop and stacked on smaller screens, with label-sized Maps/Call actions. No assignment, location, payroll, database or permission changes were made.

Verification:

- All **145 portal routes across six roles**, widths **320/768/1440/1680**: **580 geometry/content-width checks passed**, including bounds, status/date wrapping, headers, render errors and constrained scroll content.
- Six interactive modals at five widths: **30 passed**. Representative dark-mode screens at 390/1680: **12 passed**. Worker site/payroll/profile at six widths: **18 passed**. Final card styling was checked again on these representative light/dark screens.
- TypeScript passed. ESLint over **125 affected files: zero errors and zero warnings**. Frontend error/security regressions passed, including new content-width policy checks. Web export and Android bundle export succeeded. Physical device/native keyboard behavior is not verified.
- Connected localhost QA worker: site page opens and its no-current-site empty state fits six widths. This QA account has no current site; assigned-site cards and Maps/Call sizing were verified with intercepted fixture data, without changing live assignments or opening external maps/phone applications.
- Reports under `.validation-ui/current/`: `content-width-system-audit`, `content-width-modal-audit`, `content-width-dark-audit`, `content-width-site-preview`, `content-width-lint.json`, `live-content-width-site.json`. Source coverage manifest: `content-width-files.json`. Full page geometry does not prove every modal state or every possible content length.

# Dashboard layout exception — 2026-11-20

Per user correction, all six role dashboards (including portal root aliases) are excluded from the content-width redesign. `contentWidth` returns no override for these paths, preserving the original DashboardContent/WorkerPortal widths. Shared Button keeps its former alignment and Card keeps its former styling on dashboard paths. Other screens retain bounded widths and compact desktop actions. Regression checks cover all 12 dashboard/root paths; TypeScript and targeted ESLint pass.

# Human-readable audit entries — 2026-11-20

Audit reads now resolve current actor, affected profile/project and selected business-record labels in bounded batches through the caller's existing authenticated database client. No service-client bypass, schema migration, historical event rewrite or private contact-value storage was introduced. Failed/deleted-name lookups retain the event with a clear unavailable-name fallback. Display names are explicitly current-record labels, not asserted historical identity snapshots.

The admin page uses friendly headings/table filters/role names, named affected records, readable Sri Lanka dates, comma-separated rupee amounts, Yes/No flags and reference names. Omitted contact/private fields show one privacy message rather than two empty Before/After values. Raw actor/record/project IDs and transaction identifiers are behind Show technical details. Routine ID/timestamp metadata is excluded from the main changed-field list.

Verification: backend suite **311 passed** (12 focused audit API/name-resolution checks); TypeScript and targeted ESLint passed; frontend display regressions passed. Browser details/technical-toggle/hidden-value layouts passed five light widths (320/390/768/1024/1440) and two dark widths (390/1440). Live existing audit event resolves both its actor and affected record name; contact-number values remain absent. Admin GET returns 200 and all five other roles remain denied (403). No live business records were modified.

Artifacts: `.validation-ui/current/readable-audit-ui`, `readable-audit-ui-dark`, `audit-live-boundaries.json`.

# Super Admin business-detail visibility — 2026-11-20

Owner confirmed migration application. A proposed live test would temporarily change the existing labelled QA worker contact number and restore it, producing two permanent audit events. Automatic approval review rejected that exact mutation because it lacked explicit authorization for the record change and persistent test history. The script was not executed; no contact value was changed. Live before/after capture verification is pending explicit approval for that QA test (or a genuine subsequent business change). Existing-account GET-only audit authorization checks remain available and do not create business records.

User explicitly requested contact and other business before/after values rather than privacy masking for Super Admin. Prepared `backend/migrations/20261120_audit_business_details.sql`, to apply after the base audit migration. It captures all changed business fields, including contact numbers, emails, names, addresses and notes. UPDATE events retain changed fields only to avoid duplicating unchanged large BOQs; INSERT/DELETE snapshots retain the business record. Recursive filtering still excludes passwords, tokens, credentials, sessions, private/API keys, OTP/recovery and QR authentication material; URL credentials/query tokens and binary data URLs are not copied. Access remains administrator-only under existing RLS/API controls.

The UI now displays all captured changed fields and record references directly in expanded details, including full reference IDs alongside names. Structured values can be viewed in full. Missing legacy values explicitly say they were never captured; historical snapshots are not rewritten or invented. Email addresses and other business strings retain their literal underscores. The old privacy-masking message has been removed for ordinary business fields.

Validation: audit SQL **17 passed**, workflow/security/BOQ SQL **64 passed**, frontend display regressions, TypeScript and targeted lint passed; full-detail/contact before-after/legacy omission/reference layout passes five browser widths. No connected business records were changed. Database application is pending owner SQL Editor access; actual future contact snapshots must be verified after application. The contact event shown in the user's screenshot cannot acquire historical values that were never stored.

# Legacy audit context for administrator review — 2026-11-20

Added separate read-only `current_values` context for older omitted fields on known named entity tables. Super Admin can now see the current saved contact/business value on the screenshot's older profile event, while the UI explicitly states it is not historical before/after evidence. Original snapshots remain untouched. Lookups are batched through the caller's existing authenticated client, restricted to known tables and validated field names, and exclude credentials; nested secrets and signed URL authentication data are removed. No service-role fallback or business mutation was introduced.

Verified live: one existing audit event resolves actor name, affected record name and current context; administrator reads succeed and all other five roles remain denied. No QA profile/contact change or permanent test audit entry was performed. Targeted audit API/context tests: 14 passed; TypeScript/lint passed. Browser checks cover captured before/after values plus separate current-context/legacy warning and visible references.

# Expo Go startup diagnosis — 2026-11-20

Confirmed phone-specific failure after HTTPS retry: tunnel inspection of protocol/version headers (no auth headers or bodies) shows the Android device reaches the server but receives manifest HTTP 500. Device headers identify Expo Go **57.0.9**, runtime **exposdk:57.0.0**, while this project is SDK **54.0.0**. The phone requests `expo-root` manifest signing. CLI logs show the manifest request fails because it needs Expo authentication but the server is non-interactive; `expo whoami` confirms **Not logged in**. Earlier generic HTTP-200 checks omitted signature negotiation and did not reproduce the real phone request; they were insufficient to establish phone compatibility.

Installed CLI source confirms configured EAS project manifest-signing requests fetch a development certificate through authenticated Expo access. Do not disable verification, remove the EAS association, or upgrade the application SDK blindly. Owner action required: install the official SDK-54-compatible Android Expo Go build and log in to the project-authorized Expo account on the computer. The approved tunnel remains running; phone-specific signed manifest verification must be repeated after those steps.


User supplied screenshots showing Expo Go's blue fatal update-download screen after the HTTP tunnel link. Verified both HTTP and HTTPS public manifests with Android-like headers. Created `exps://y3asfzi-anonymous-8082.exp.direct` and `.validation-ui/current/expo-go-tunnel-https-qr.png` so Expo Go requests HTTPS. HTTPS manifest advertises an HTTPS launch asset; full bundle downloads with HTTP 200/application-javascript (20,617,907 bytes), without a warning-bypass header. This is a transport alternative, not proof of a phone-side fix. Installed Expo Go version is requested to confirm SDK 54 compatibility; no SDK upgrades, app data resets or backend exposure were performed.

Follow-up: user provided `java.io.IOException: Failed to download remote update` and said phone/PC cannot share one network. After explicit user approval, started a temporary Expo/ngrok tunnel on port 8082, leaving the original 8081 server intact. Public Android manifest and full native development bundle both return HTTP 200; bundle download verified (20,617,907 bytes). Expo Go link: `exp://y3asfzi-anonymous-8082.exp.direct`; QR artifact `.validation-ui/current/expo-go-tunnel-qr.png`. Running exec session: 56335. The tunnel exposes the Metro development server only; the local backend has not been exposed publicly. Phone execution remains to be confirmed. SDK remains 54.0.0; no dependency upgrades, firewall changes, account/data changes or backend tunnel were performed.

User clarified the error occurs while opening the project from Expo Go's development QR, before the app opens, rather than inside the worker/site scanner. Camera/QR-specific exploratory runtime changes were reverted after that clarification. The native scanner mock now recognises the shared ContentScrollView import; native scanner and permission branch tests pass.

Read-only checks: Expo SDK 54 dependency compatibility passes; Android manifest is served successfully; a LAN-address request advertises the matching LAN bundle URL and downloads the native development bundle with HTTP 200 (20,617,992 bytes). TypeScript passes. These checks do not reproduce device execution or establish phone-to-PC connectivity. The actual Expo Go error message/device screenshot is still required to distinguish download, SDK/runtime or JavaScript startup failure. No startup fix is claimed without that evidence.

# Table heading sorting — 2026-11-20

Added shared ascending/descending column controls across project, user, supplier, materials, stock, attendance, payroll, estimate, historical comparison and management-report tables, including shared role routes. Desktop headings are clickable; compact card layouts have a column selector and direction control. Initial ordering remains unchanged until a column is selected. Dashboard sizing/design is preserved.

Sorting handles natural text, numeric quantities, currency amounts and dates, keeps empty values last, and preserves stable ties without mutating source records. Report detail links stay paired with their original rows. Paginated purchase orders use database ordering before pagination and reset to page one when the sort changes; permissions and filters remain in force. No database migration or live business writes are needed.

Verification: TypeScript, targeted lint, sorting regressions, existing error/security/native-scanner regressions and web export passed. Browser interactions verified natural project-name ascending/descending sorting and mobile direction changes. A synthetic 51-order test verified sorting across page boundaries and returning to page one. Focused responsive checks: 51 checks across 17 routes at 320/768/1440 pixels, zero failures. Browser database/auth/API requests were intercepted; this does not establish physical-device coverage.

Whole-portal follow-up covered 145 routes at three widths (435 route/width combinations). Two PM supplier routes overlapped a preview export rebuild and initially produced network/load failures; both were repeated after export completion and all six combinations passed. The remaining 429 combinations passed in the full run. Final sorting interaction rerun passed all six geometry checks, including 320-pixel mobile layouts; the harness now waits for the responsive sidebar transition before measuring off-screen content.

# Vercel read-only startup correction — 2026-11-20

Owner runtime traceback identifies `services/email_service.py` creating `/var/task/logs` during import (`OSError: [Errno 30] Read-only file system`). Added `core/runtime_paths.py` to place Vercel-only scratch logs and the historical SQLite cache in the OS temporary directory. The bundled historical database seeds a separate writable cache; model files remain in the original read-only model directory. Temporary files are not durable business storage; Supabase remains the hosted database.

Production/serverless startup no longer creates or exposes a local uploads directory. Local uploads remain available only in explicitly enabled development mode, and the generic storage service refuses an ephemeral fallback on Vercel if remote storage fails.

Added an isolated subprocess regression that rejects all application-directory creation, prevents network connections, imports the full FastAPI app, checks health, queries the seeded cache, and verifies Vercel cannot fall back to local uploads even with development flags. This passes locally. No GitHub push or Vercel redeployment was performed; `/health` and `/docs` must be checked after the owner publishes these files. Scheduled jobs and model retraining persistence require separate serverless adaptation; this correction alone is not full production certification.

# Vercel direct-link / refresh routing correction — 2026-11-20

Live read-only checks reproduce the screenshot: frontend `/admin/insights` returns 404 while `/admin/insights.html` returns 200. The static Expo export is present, but Vercel has no clean-URL configuration. Added `frontend/vercel.json` with the existing web build/output settings, `cleanUrls: true`, and a root fallback for client-resolved dynamic routes. Existing exported files/assets retain filesystem precedence; application authentication and role checks remain in the client/API.

Added `frontend/scripts/test-hosted-routing.cjs`: all 156 source routes (including dynamic IDs and auth/reset pages) return HTML under a local server modelling clean URLs and fallback; existing route HTML and three JS/CSS assets are verified separately. This is local routing coverage, not proof of the not-yet-redeployed Vercel configuration. Existing error regressions passed.

Public backend checks: `/health` and `/openapi.json` return 200; `/api/ai/insights` without credentials returns the expected 401. Actual-origin CORS and authorization preflight allow `https://construct-ai-frontend.vercel.app`. The dashboard's aggregate 52.4% error rate alone cannot identify individual backend failures and includes earlier request history; no authenticated production API coverage is claimed. No business records or deployed settings were changed. Publish `frontend/vercel.json` to GitHub and redeploy the frontend before checking extensionless deep links live.

# Expo authenticated tunnel retry — 2026-11-20

Owner successfully logged in (`expo whoami` -> `dimuthu1234`), then encountered ngrok connection timeout. Retried the previously authorized public Metro tunnel on port 8083 without another cache clear. Tunnel reached `Tunnel ready` (exec session 14262). Process-only API URL points to the already deployed HTTPS backend; no `.env` changes were made.

New URL: `exps://y3asfzi-dimuthu1234-8083.exp.direct`; QR `.validation-ui/current/expo-go-logged-in-qr.png`. Public Android manifest verification with `expo-root` signature negotiation returns HTTP 200, SDK 54.0.0, an `expo-signature` header and an HTTPS launch bundle URL. This resolves the earlier reproduced unauthenticated signed-manifest failure at the server; physical phone launch still requires owner confirmation. Leave this tunnel terminal/process running while scanning the new QR.

# Whole-system mobile responsiveness follow-up — 2026-11-20

Preserved dashboard layouts and improved shared controls rather than narrowing desktop dashboards. `useVisibleViewport` observes browser visual-viewport resize/scroll with native window-dimension fallback; shared modals and Select menus use the visible keyboard-safe area. Select geometry clamps narrow/landscape menus, options have 48px targets and wrapped full labels, search uses 16px text and no automatic focus on phones. Small-screen web inputs use 16px text to avoid focus zoom, and shared section headings/actions stack on phones.

Fixed two screen-specific issues found during interaction checks: Insights sorting was displayed only in its loading branch, and site-report material entry had a non-scrolling modal plus an unbounded long quick-select chip. Sorting now appears in the historical-data section. The material modal scrolls, close/action targets are accessible, and chips fit the modal's available width.

Verification: 145 portal routes at four phone widths (580 checks), 145 landscape route checks, 11 public/auth pages at three sizes (33 checks, input focus/scroll reachability), six existing modals under simulated keyboard bounds plus scroll-to-action checks, and the seventh site-report material modal at four phone widths. Final Insights dropdown filtering/selection and simulated keyboard positioning pass four phone widths. All remote data/auth/API traffic in browser checks was intercepted; no business writes or emails were sent. Dropdown geometry has 60 cases plus viewport hook event/cleanup/native fallback tests; TypeScript, targeted lint, regression scripts and web export pass. Native permission/scanner tests use mocks. Actual Expo Go/iOS/Android rendering, physical keyboards, camera/GPS and push remain unverified. Changes are local and need GitHub publication/frontend redeployment to reach Vercel.

