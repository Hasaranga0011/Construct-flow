# Role flow and permission audit — 17 November 2026

**The owner applied the new migration and the connected recheck passed: the six QA roles retain their assigned-project connections and the observed estimate/financial read leaks are closed for these identities.** UI visibility and API guards alone do not protect direct Supabase requests.

## Connected read evidence

`backend/tests/role_flow_live_read.py` signed in with the six existing QA accounts and read eleven tables per role. It did not create or alter business records. Results containing counts only are saved in the ignored `.validation-db/role-flow-live-read-results.json`.

| Role | Expected project/workflow scope | Observed QA connection |
| --- | --- | --- |
| Admin | Global administration, assignments, user approval, project operations | QA project, order, attendance, payroll and commercial records visible |
| PM | Assigned projects; procurement, payroll, milestones and commercial operations | Only its assigned project, order, request, stock and salary visible |
| Site manager | Assigned sites, team, attendance, material requests and progress | Assigned project, order/request/stock and attendance visible; salary hidden |
| Supplier | Own orders and delivery; no internal finances/payroll | Own project/order visible; other operational and salary records hidden |
| Client | Own projects, client commercial records, approvals and project communication | Own project, messages, payment stage and variation visible; procurement/payroll hidden |
| Worker | Assigned project and own attendance/payslips | Own project, attendance and salary visible; orders and requests hidden |

The existing QA project's earlier end-to-end run covers request → PM review → supplier suggestion/confirmation/delivery → partial/final receipt → stock/spend, attendance review → payroll/payment, client payment stages/variation approval, reports, documents and project completion. See `UI_FLOW_VERIFICATION.md`. This audit used read-only evidence rather than replaying payments or stock mutations.

## Findings and remedies

1. **High: estimates leaked across roles.** All six QA accounts could read all 17 historical estimates. The new restrictive RLS policies limit PMs to their own unlinked estimates or managed projects, clients to their own project estimates, and deny operational roles. New estimates record their creator. Old unlinked estimates with unknown ownership remain admin-only; owners must explicitly link/review them rather than infer assignments from names.
2. **High: internal financial rows leaked to operational roles.** Supplier, worker and site manager could read the QA project's expense, payment stage and variation. Restrictive SELECT policies now prepared for internal expenses (management only) and client commercial records (management plus owning client).
3. **High: client invitation used privileged writes without an admin boundary.** Invitation is now admin-only, matching account management. Existing identities return a conflict rather than being reset/reclassified. Project linkage uses the canonical assignment RPC so old assignment rows are reconciled.
4. **Flow: supplier creation created a client.** The supplier form's `access_level: supplier` was ignored by the invitation endpoint. It now creates a supplier profile pending approval, skips client activity/project linkage and reports email/approval state accurately. Phone-save failures are surfaced.
5. **Flow/security presentation: admin directory trusted editable role metadata.** Directory roles now come from protected profiles, matching API authorization. Auth metadata no longer overrides the displayed role.
6. **Flow: estimate approval falsely reported project creation.** Approval formerly changed status, attempted an incomplete project insert, swallowed failure and claimed a baseline existed. A manager-only review endpoint now checks ownership and performs a conditional Pending → Approved/Rejected update. It creates no incomplete projects and rejects repeat/concurrent reviews. Project creation and assignments remain explicit steps.
7. **Flow: client-generated estimates lacked project links.** They now save the selected project ID. New estimate amounts must be finite and positive; creation must begin Pending. The old column-dropping insert fallback was removed so a missing schema cannot silently discard ownership/project scope.
8. **Flow: operational message membership omitted actual assignments.** Supplier purchase-order ownership and worker site assignments (including worker/profile ID mapping) now establish membership for privileged project communication checks. This does not grant financial permissions.

## Validation and remaining action

- Existing backend suite after source changes: 206 passed, five existing deprecation warnings. Two additional focused cases subsequently passed with the 13-case role boundary suite.
- New RLS suite: 30 checks, including all six roles, unrelated PM/client identities, client draft creation, denied approval, and repeat application of the migration.
- Existing in-memory workflow/security suites: 16 assignment/workflow checks plus 35 transactional security checks passed.
- Frontend regression suite, TypeScript and targeted ESLint passed.
- Source changes have not sent invitation emails or changed connected business records.

**Post-migration connected verification:** after the owner confirmed applying `backend/migrations/20261117_role_flow_boundaries.sql`, all 66 role/table read pairs and their QA project/site filters returned successfully. The result verifier passed 94 read, scope and positive-access assertions. Worker, supplier and site manager each see zero estimates, internal expenses, payment stages and variations. The client sees zero internal expenses while retaining its payment stage and variation. PM retains its assigned expense/order and commercial records; worker retains its attendance and payslip; all six roles retain the QA project. Admin sees all 17 historical estimates; PM/client see zero historical estimates because these have no verified ownership/project link. No business writes were performed during this recheck. Fresh estimate creation/review was tested locally, not replayed against live records.

The repeatable read audit is `backend/tests/role_flow_live_read.py`; `--verify-saved` validates the last saved results without contacting services. Focused source boundary tests (13) and the local RLS suite (30) passed again after the owner confirmation.

The connected audit sampled the existing labelled QA identities and records. It does not establish exhaustive coverage of every existing account, historical assignment, storage policy, device permission or production configuration. Email delivery, physical camera/location/push behavior and unknown historical estimate ownership require separate verification.
