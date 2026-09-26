# Phase 1: permission and data integrity audit

Status: in progress, not accepted. The read-only staging audit has now been executed; no live database changes were made during this pass.

## Confirmed local fixes

- Project milestone endpoints use the caller JWT, verify project membership, and match both project and milestone IDs on mutations.
- Project expense reads require admin, assigned PM, or assigned client. Creation requires admin or assigned PM; URL/body project mismatch is rejected.
- Shared notification filters require a matching recipient. Role-wide and All notifications match only when target_user_id is null. The database still needs corresponding RLS enforcement.
- The old pending-project-access.patch was applied and subsequently refined. Do not apply it again.
- `20260925_harden_core_rls.sql` now validates required identity columns and the attendance-to-workers foreign key before changing policies.
- The hardening migration removes every existing policy on its 24 covered tables, forces RLS, revokes anonymous DML, and installs role-plus-assignment policies.
- Worker ownership checks use non-recursive security-definer helpers. A local role test exposed and then verified the fix for a recursive workers/site_workers/attendance policy path.
- QR attendance now sends the assigned site ID, resolves `profiles.id` to canonical `workers.id`, and returns a clear conflict when a worker profile has no worker record.
- Legacy labour API access now requires an authenticated profile, rejects worker/client/supplier writes, and scopes PM/site-manager reads and payroll aggregation to managed projects.
- Realtime publication enrollment is guarded and occurs only after replacement policies are installed.
- Repository SQL no longer contains `USING (true)` or `WITH CHECK (true)` policies. Legacy bootstrap schemas now fail closed and no longer insert mock projects.

## Schema conflicts blocking a safe attendance migration

`frontend/supabase/schema.sql` defines labour as a worker directory with name, NIC, trade, and daily_rate. Attendance.worker_id references labour.id. In contrast, `backend/schema_part2.sql` defines labour as daily attendance with worker_name, project_id, hours_worked, and date. The QR endpoint assumes attendance.worker_id identifies a profiles record. The later phase5 migration adds site fields without resolving this identity mismatch.

The target should be attendance for daily records and profiles for authenticated worker identity. A migration must inspect the active generation first and map legacy worker IDs explicitly. Names are not safe identity keys. Unmapped rows must cause a preflight failure or be retained for reconciliation, never silently dropped. No query rename or destructive migration has been attempted.

## Required policy coverage

All rows below require explicit SELECT/INSERT/UPDATE/DELETE review, authenticated denial tests, and real deployed schema confirmation. They are requirements, not claims about existing RLS.

| Table | Read boundary | Mutation boundary |
| --- | --- | --- |
| profiles | Own profile; staff directory restricted to necessary project participants | Own permitted contact fields; role/identity/pay rates admin controlled |
| projects | Admin, assigned PM/client/site manager/worker; supplier only needed order context | Admin or assigned PM; assignment changes checked separately |
| materials | Admin and assigned operational staff | Admin and assigned operational staff; stock through receipt/usage transactions |
| purchase_orders | Admin, assigned PM/site manager, own supplier | Actor-specific state transitions; no direct stock effect on Delivered |
| attendance / legacy labour | Admin, assigned PM/site manager, own worker | Assigned attendance staff; no worker self-editing |
| notifications | Exact recipient or authorized scoped role broadcast | Trusted workflow inserts; recipient read acknowledgement only |
| salary_slips | Admin, assigned PM, own worker | Authorized payroll generation/approval; worker read only |
| milestones | Admin and assigned project participants | Assigned PM/site manager and admin |
| milestone_media | Inherit milestone project scope | Assigned operational staff; immutable uploader identity |
| client_messages | Sender/receiver who are participants in the same project | Own sends; receiver read acknowledgement; no sender impersonation |
| shared_documents | Assigned project participants and sharing visibility | Assigned project management; client read only |
| client_activity | Assigned client and project management | Trusted workflow events |
| issues | Assigned operational staff; client-visible issues restricted to their project | Reporter creation and authorized staff transitions |

Related assignment, site, payroll, invoice, photo, expense, estimate, and request tables also need policies. A secure parent policy does not automatically protect child tables.

## Evidence required next

1. Identify the staging Supabase project. Existing .env files contain application/integration keys but no dedicated database connection or six-role test-account configuration.
2. Execute phase1_schema_audit.sql in the staging SQL Editor and export the single result set containing all nine named metadata sections. It is read-only and exports no business records or credentials.
3. Review active policies, foreign keys, triggers, grants, and Realtime publication before preparing the canonical migration. Apply migrations transactionally and verify reruns/rollback locally first.
4. Use six real authenticated accounts plus foreign-project fixtures. Verify allowed and denied reads and writes for every command. Local JWT simulations are supplementary, not staging acceptance.
5. Perform each portal's end-to-end flows with RLS active. Only then advance the acceptance status to Phase 2.

## Validation

- Backend: 37 tests passed after project-access, goods-receipt, QR identity, and labour-scope changes.
- Notification helper: eight recipient/role checks passed.
- Frontend TypeScript passed after notification changes.
- SQL workflow integrity: 14 checks passed.
- Core RLS migration: applied twice in the local PostgreSQL engine; 12 authenticated isolation checks passed across PM, site-manager, supplier, client, and worker cases. The test also verifies targeted notifications do not leak to another PM.
- Scoped profile access was separately verified to expose an assigned worker to its site manager without policy recursion.
- Identity audit SQL returns columns, foreign keys, missing required columns, and a focused identity summary as four exportable rows.
- Browser/native and real-account RLS tests: not run in this pass.

Phases 2 through 8 remain pending; no claim of zero mock data or full realtime coverage is made.

## User-provided publication result

The supplied audit result provides the following staging evidence:

- `attendance` has `rls_enabled = true`, but `rls_forced = false`. Table owners/service-role behavior must be accounted for in the acceptance test.
- The visible attendance policy is an `ALL` policy with a broad `is_admin_or_pm()` predicate and `roles = {public}`. This is not sufficient evidence of worker/site-manager isolation and must be replaced or constrained after the active schema is confirmed.
- The visible grants include `anon` with `DELETE` on `attendance`. Anonymous destructive access is a release blocker and must be revoked before acceptance.
- Additional grant screenshots show `anon` also has `INSERT`, `UPDATE`, and `DELETE` on projects, materials, sites, inventory, orders, attendance, workers, media, quotations, milestones, messages, payroll, notifications, assignments, issues, expenses, clients, invoices, photos, labour, and estimations. This is a database-wide anonymous mutation exposure, not an attendance-only issue.
- The follow-up audit shows the anonymous DML grants are now removed; the visible remaining `REFERENCES` grant is not an INSERT/UPDATE/DELETE data-mutation privilege.
- The Realtime publication result visibly contains only `client_activity`, `profiles`, and `shared_documents`. Orders, attendance, chat, milestones, and notifications are absent. This is a publication gap, not proof that their RLS policies are correct.

The anonymous privilege blocker is resolved. The next blocker is policy isolation: the visible attendance policy is still `FOR ALL`, applies to `public`, and RLS is not forced. Do not apply the goods-received or full RLS migrations until the complete `04_policies`, `05_command_coverage`, `08_grants`, and `09_realtime_publication` sections have been reviewed against the active schema.

## Full policy export findings

The complete policy export confirms the following additional blockers:

- RLS is disabled on `notifications` and `purchase_orders`.
- `estimations`, `invoices`, `messages`, and `milestones` contain unconditional `true` policies.
- `projects`, `labour`, `materials`, `material_requests`, `pm_projects`, `site_manager_sites`, `site_workers`, `shared_documents`, and related tables contain policies granting all authenticated users broad access.
- `profiles` is publicly selectable through unconditional policies.
- Policies are mostly `PERMISSIVE`; adding a narrow policy would not remove access granted by an existing broad policy because permissive policies combine with OR semantics.
- `attendance`, `labour`, `projects`, `materials`, and other tables have `rls_forced = false`, so table-owner access is not covered by normal RLS enforcement.

The next safe action is a schema/foreign-key export for the critical tables using `backend/reviews/phase1_critical_schema.sql`. A replacement policy migration must be generated from those actual columns and relationships. Do not add more permissive policies and do not drop all existing policies without replacement coverage.

## Critical schema findings

The first column export confirms that the active staging schema is not interchangeable with the older repository SQL:

- `attendance.worker_id` references `workers.id`, not `profiles.id`.
- `labour` has no `worker_id` column and stores `worker_name`, so worker-level RLS cannot be safely enforced there until identity mapping is resolved.
- `materials` uses `current_stock` and `minimum_threshold`; application code and older migrations also refer to other stock column names.
- `client_messages` stores `message_text`, while the legacy `messages` table stores `content`.
- `issues` is scoped through `site_id` and `reported_by`.

These are blocking schema conflicts, not cosmetic naming differences. The remaining identity/assignment/order/notification columns must be exported with `backend/reviews/phase1_identity_schema.sql` before a replacement RLS migration is generated.

## Current deployment gate

The replacement RLS migration is locally validated but remains unapplied to staging. The identity audit confirms that `site_workers` uses `project_id` (referencing `projects.id`) and has no `site_id`; the migration and audit contract now use that relationship. Rerun the updated audit and confirm `03_missing_required_columns` is an empty JSON array and `02_foreign_keys` shows `attendance.worker_id` referencing `workers.id` before applying the migration. The legacy `labour` table remains a deployment blocker because many screens still query it while the canonical attendance identity uses `attendance` plus `workers.user_id`. No name-based migration is acceptable.
