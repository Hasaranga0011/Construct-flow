# Full system verification — 17 November 2026

The later [remaining-issues review](REMAINING_ISSUES_REVIEW.md) supersedes the first-pass counts and open items below: backend tests are now 228, frontend lint is clean, the owner's real password reset/login succeeded, and the newly found remote-push delivery gap is documented explicitly.

The available automated and connected QA checks passed after correcting the auth-page hydration issue and updating the email configuration. This is not a claim that every possible device, historical record or production workload is error-free.

## Results

| Check | Result | Scope |
| --- | --- | --- |
| Backend pytest | 208 passed; five existing deprecation warnings | Authorization, input validation, payroll, receipts, assignments, reports, email handling and estimator behavior; isolated services |
| Assignment/workflow SQL | 14 passed | In-memory PostgreSQL |
| Transactional security SQL | 35 passed | Atomic stock, money, approvals, milestones, project scope and retries |
| New role-boundary RLS SQL | 30 passed | Six roles, foreign identities, estimate ownership and private finances; migration applied twice |
| Receipt SQL | 7 passed | Partial receipt/idempotency and rollback boundaries |
| Worker RLS suite | Passed | Own versus other-worker reads/updates and protected wage fields |
| Notification scope | 8 passed | Own/broadcast notification visibility |
| Connected role read audit | 94 assertions passed | Six real QA accounts; eleven tables per account, including assigned-project/site filters |
| Live estimate/API/concurrency checks | 36 passed | PM and client create linked estimates; permitted/forbidden reviews; PDF access; unchanged financials |
| Live browser | 19 pages; zero failures | Existing QA project across all six roles; reads only |
| Whole-portal responsive audit | 822 checks; zero failures | Final fixed build; six widths from 320 to 1440 pixels |
| Dark dashboards | 36 checks; zero failures | Six roles across six widths before the root hydration fix; dashboard behavior also covered by final workflow checks |
| Public/auth responsive audit | 45 checks; zero failures | Nine public/auth routes across five widths; final fixed build |
| Browser workflow scenarios | 28 passed | Procurement, payroll, client approvals, documents, dashboards, QR modal and estimates; includes all 30 cross-portal redirects |
| Auth interaction scenarios | 3 passed | Required email input; missing-session reset protection; simulated valid recovery with length/matching validation, one update and sign-out |
| Frontend regressions | Passed | Security, storage, money, error handling and report metrics |
| Frontend report document regression | Passed | All 81 rows, typed/missing values, escaped HTML, empty sections and stable filename; binary exports tested on backend |
| TypeScript | Passed | No errors after final application changes |
| ESLint | No errors; 180 warnings | Full source audit after role-label import cleanup; final auth files also linted separately |
| Navigation scan | No unmatched links among 21 recognized links | Static scanner found 156 app routes; dynamic links rely on browser coverage |
| Expo Doctor | 18/18 passed | App configuration and native dependency compatibility |
| Expo dependency check | Passed | Installed SDK dependency versions compatible |
| Web/Android/iOS export | Passed | Final source exported together to `.validation-full-platforms`; JS/Hermes artifacts, not installed applications |
| npm production dependency audit | Zero known vulnerabilities reported | Registry advisory snapshot at test time |
| Python lock advisory audit | No known vulnerabilities found | Pinned backend lock; isolated pip-audit environment, no application dependency changes |
| Python dependency consistency | Passed | `pip check` |
| Email delivery | Passed after owner configuration update | Resend accepted test email; owner confirmed Inbox receipt |
| Patch whitespace | Passed | User's existing `frontend/expo-env.d.ts` line-ending notice remains unrelated |

## Issues found and corrected

The initial public-page audit exposed React hydration errors on seven auth routes. The static server render could see no route segments and render a loading indicator while the first browser render already selected the auth page wrapper. The root now keeps the same initial tree until web hydration mounts; auth responsive panels also wait for real browser dimensions. The final public audit and auth interaction tests report no hydration errors. Role guards remain in place and all thirty attempts to open another role's dashboard redirect correctly.

The email provider initially rejected the configured key with HTTP 401, producing a genuine HTTP 502 from the email endpoint. After the owner updated the key and restarted the backend, the same endpoint returned HTTP 200 and the owner confirmed receipt in Inbox. Configuration changes were performed by the owner; no key was printed or written into this report.

An old frontend report test called removed `createExcel`/`createPdf` helpers. Current binary generation belongs to backend exports, already covered by backend tests. The stale frontend test now checks the actual print-document contract rather than reporting missing client functions as an application failure.

Initial dynamic-route fixture failures came from the temporary static test server lacking SPA fallback. That test-server configuration was corrected before the successful final audits; application routes were not changed to hide those failures.

## Live changes and measured limits

Two labelled QA estimates were retained on the existing QA project: one created by its PM and one by its client. For each estimate, two simultaneous approval attempts produced one success and one HTTP 409 conflict. Workers, suppliers, site managers and clients could not review estimates. PM and owning-client PDF downloads succeeded; worker downloads were denied. Project financial responses before and after these operations matched. Orders, inventory, attendance, payroll and user roles were not changed by these live tests.

Twelve read requests with four workers all returned HTTP 200. Median elapsed time was 2.086 seconds and the slowest was 3.349 seconds in this local/network environment. This is bounded concurrency evidence, not a production capacity or high-user-load benchmark.

The connected read audit also passed after the estimates were created. The seventeen historical unlinked estimates remain admin-only. Their ownership cannot be inferred safely from titles; they need owner-reviewed project/creator mapping.

The explicitly approved email recipient had no existing application profile. Consequently, no real password-recovery link was sent to that address and no account was created or reassigned merely to test email. Recovery validation/update/sign-out was exercised with intercepted fixture traffic. Live invitation acceptance and recovery-link use remain unverified.

The owner confirmed no physical device was available. Real camera/QR scanning, location/geofence precision, OS permission dialogs, push delivery, native SecureStore behavior, keyboard/safe areas and installation were therefore not tested on a device. JavaScript exports and responsive browser checks do not replace those checks.

## Repeating checks

Run `.venv/Scripts/python -B -m pytest backend/tests -q`, the SQL suites under `backend/tests/`, and `npm.cmd test` plus `npx.cmd tsc --noEmit` from `frontend/`. Browser fixture suites use `UI_AUDIT_URL`, `RESPONSIVE_URL` or `WORKFLOW_PREVIEW_URL` against a fixture export served with SPA fallback.

Connected scripts `role_flow_live_read.py`, `full_system_live.py`, `email_live_check.py` and `test-live-project-browser.cjs` require the ignored existing QA state/environment. `full_system_live.py` creates new labelled estimates each run; email scripts send real mail only to their explicitly supplied recipient. Do not treat those two as side-effect-free unit tests.

Artifacts: `.validation-ui/full-system-final`, `.validation-web/responsive-auth.json`, `.validation-ui/live-browser-results.json`, `.validation-db/full-system-live-results.json`, `.validation-db/role-flow-live-read-results.json`, and `.validation-db/email-live-results.json`. Credentials remain in ignored local configuration/state, not in this report.
