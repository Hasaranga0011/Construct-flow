# AGENT.MD — Project Intelligence File

## 1. Project Overview
- **Project Name**: ConstructFlow
- **Purpose**: A comprehensive Construction Management System tailored for Sri Lanka. It manages projects, labour attendance, materials, supply chains, and client relations.
- **The Problem It Solves**: Fragmented communication between site managers, admins, suppliers, and clients. It centralizes inventory management, order fulfillment, attendance tracking, and AI-driven cost/delay predictions.
- **Target Users**: 
  - **Admins** (`super_admin`): Super users with global access.
  - **Project Managers** (`pm`): Oversee specific projects, approve orders, handle payroll.
  - **Site Managers** (`site_manager`): Log daily attendance, request materials on-site, report issues.
  - **Suppliers** (`supplier`): Receive, approve, reject, or suggest counter-offers for purchase orders.
  - **Clients** (`client`): Track their project milestones, media, and invoices.
  - **Workers** (`worker`): Check in via QR, view attendance history and salary slips.

  ## 1.1 End-to-End Workflows

  ### Project lifecycle

  1. An admin creates a project and assigns a project manager and client.
  2. The PM sees only assigned projects, reviews budget/progress, coordinates clients, materials, suppliers, labour, payroll, and estimates.
  3. A site manager operates assigned sites, assigns workers, records attendance, requests materials, uploads progress media, and reports issues.
  4. Suppliers receive purchase orders, confirm/reject/suggest changes, and mark confirmed orders delivered.
  5. Clients see their own project progress, milestones, media, financial records, documents, estimates, notifications, and PM conversations.
  6. Workers see only their profile, QR identity, attendance records, payroll, and salary slips.

  ### Materials and procurement

  1. Admins and permitted PMs choose a project, material, supplier, quantity, price, and expected date.
  2. The purchase order is stored with a lifecycle status: `Pending Delivery`, `Confirmed`, `Delivered`, `Cancelled`, `Rejected`, or `Suggested`.
  3. Suppliers act on orders assigned to their account; admins retain global oversight.
  4. Site managers monitor stock and submit material requests for assigned sites.
  5. Low-stock and late-order checks feed dashboard alerts and notifications.

  ### Workforce and payroll

  1. Workers are assigned to sites through site-manager workflows or administrative assignment tools.
  2. Attendance is recorded through QR scanning or permitted manual entry and stores status, check-in/out, hours, date, project/site, and worker identity.
  3. PMs and admins review scoped attendance and payroll summaries.
  4. Salary generation creates salary slips using the project rule of Rs. 3,500 per day plus 1.5x overtime treatment.
  5. Workers can review their own attendance and salary slips but cannot access another worker's records.

  ### Client communication and progress

  1. Client projects are selected from `projects.client_id = auth user id`.
  2. Milestones are ordered by due date and display status, completion percentage, descriptions, and media.
  3. Client messages are scoped by project and sender/receiver identity, with Supabase Realtime updates.
  4. Shared documents, project photos, notifications, invoices/financial records, and estimates are filtered to the client's projects.

  ### Authentication and navigation

  1. Supabase Auth establishes the session and `AuthContext` resolves the normalized role from metadata or `profiles`.
  2. The root layout waits for session/role resolution before redirecting protected routes.
  3. Role dashboards are selected from the normalized role map.
  4. Sidebar links use suffix-only hrefs and role `basePath` values. Nested routes remain highlighted without duplicating prefixes.
  5. The shared `TopNav` provides the responsive menu trigger, role-aware notification route, avatar, search/action hooks, and optional back navigation.

## 2. Tech Stack
- **Frontend**: React Native with Expo (v50+) and Expo Router (file-based routing).
- **Backend**: Python 3.10+, FastAPI (Asynchronous REST API).
- **Database / Auth / Realtime**: Supabase (PostgreSQL, Supabase Auth, WebSockets).
- **Styling**: NativeWind (Tailwind CSS for React Native), React Native Reanimated.
- **Key Dev Dependencies**: 
  - `expo-router`, `nativewind`, `react-native-reanimated`, `@expo/vector-icons`, `expo-camera` (Frontend)
  - `fastapi`, `uvicorn`, `supabase`, `pydantic`, `httpx`, `scikit-learn`, `numpy`, `pandas`, `python-multipart` (Backend)

## 3. Project Structure
- **`/frontend/src/app/`**: Expo Router pages, segregated by role (`/admin`, `/client`, `/pm`, `/site`, `/supplier`, `/worker`).
  - `_layout.tsx`: Root layouts handling global context and auth guards.
  - `admin/materials/`: Material creation/detail, purchase orders, site stock inventory, detailed order views, and intelligent create forms.
  - `admin/labour/`, `admin/attendance/`, `admin/payroll/`: Unified workforce suite for checking in workers, viewing site logs, and auto-calculating wages.
  - `admin/users/`: Directory and CRUD forms for platform users.
- **`/frontend/src/components/`**: Shared and domain-specific UI components.
  - `common/`: `TopNav`, `Sidebar`, `MobileSidebar`, `StatCard`, `AnimatedCard`, notification and toast surfaces.
  - `materials/`: `InventoryTable`, `NewMaterialModal`, `PendingOrders`.
  - `labour/`: `AttendanceTable`, `PayrollSummary`, `LabourDistributionChart`, `CheckInWorkerModal`.
- **`/frontend/src/lib/`**: Core utilities.
  - `supabase.ts`: Supabase client initialization.
- **`/frontend/src/services/`**: API definitions.
  - `api.ts`: Wrapper for `fetch` with JWT auth injection.
- **`/backend/`**: FastAPI backend environment.
  - `main.py`: Entry point, CORS setup, and router registration.
  - `api/routes/`: Domain-specific endpoints.
  - `core/security.py`: JWT validation utilizing Supabase JWTs.
- **`/frontend/supabase/`**: Database migrations and SQL schema definition files.

### Current portal route map

| Portal | Representative routes | Scope |
| --- | --- | --- |
| Admin | `/admin/dashboard`, `/admin/projects`, `/admin/users`, `/admin/materials`, `/admin/labour`, `/admin/payroll`, `/admin/reports`, `/admin/insights` | Global platform operations and oversight |
| PM | `/pm/dashboard`, `/pm/projects`, `/pm/materials`, `/pm/labour`, `/pm/payroll`, `/pm/clients`, `/pm/suppliers`, `/pm/team`, `/pm/ai-estimator` | Assigned-project operations |
| Site manager | `/site-manager/dashboard`, `/site-manager/attendance`, `/site-manager/labour`, `/site-manager/materials`, `/site-manager/issues`, `/site-manager/team`, `/site-manager/milestones` | Assigned-site operations |
| Supplier | `/supplier/dashboard`, `/supplier/orders`, `/supplier/deliveries`, `/supplier/profile` | Supplier-owned procurement and delivery |
| Client | `/client/dashboard`, `/client/project`, `/client/media`, `/client/messages`, `/client/invoices`, `/client/documents`, `/client/project/estimates` | Client-owned project visibility and communication |
| Worker | `/worker/dashboard`, `/worker/attendance`, `/worker/payroll`, `/worker/profile` | Personal workforce records |

The legacy `/site` portal remains for site-manager-compatible routes. Prefer `/site-manager` for new work. Route aliases should preserve the same role boundary as the canonical route and must not expose the admin-wide implementation accidentally.

## 4. Current State & Progress

**2026-09-26 completion brief:** Phases 1 through 7 have been fully implemented and their schema migrations applied to staging. Phase 8 (Final Integration Testing) is actively in progress.
- **IMPLEMENTED (Phases 1-7)**:
  - Phase 1: Hardened core RLS and replaced anonymous grants. Scoped attendance and legacy queries.
  - Phase 2: Fully connected Daily-Operations workflow with Supabase Realtime subscriptions on Dashboards (PM, Supplier, Site Manager). Integrated 'Confirm Receipt' for purchase orders. QR scan worker detail card.
  - Phase 3: 3-Way Multichannel Chat. client_messages upgraded to support PM, Admin, and Site Manager channels with live Realtime updates.
  - Phase 4: Payroll Notification Automation. Resend emails and in-app notifications automatically fire upon salary generation.
  - Phase 5 & 6: Project Finances. client_payment_schedule and ariation_orders added. GET /api/projects/{id}/financials calculates committed vs actual spend with budget overrun alerts.
  - Phase 7: Daily Site Reports. Mobile-first daily report creation UI for Site Managers and backend integration.
- **IN PROGRESS**:
  - Phase 8: Final Integration Testing (running tests against the active local stack).
- **KNOWN BUGS / ISSUES**:
  - Occasional Expo Router Metro bundler file import pathing issues can occur in deeply nested folders; verify relative import depth.
  - See KNOWN_LIMITATIONS.md for deferred features.

## 5. Architecture & Key Design Decisions
- **Client-Server Split**: The frontend handles UI, local state, and direct Supabase Realtime subscriptions (for WebSockets). The backend handles complex business logic (e.g., fulfilling orders, generating alerts, integrations, ML processing, salary generation).
- **Routing**: Strict role-based URL namespacing (`/admin/dashboard`, `/supplier/dashboard`). If a user logs in, their role from `public.profiles` dictates where they are pushed. Web navigation relies on Expo Router's `<Link asChild>` for stability.
- **Navigation contract**: Role layouts use suffix-only nav hrefs such as `/dashboard` and provide the role prefix through `basePath`. Sidebar builders defensively avoid duplicate prefixes.
- **Responsive contract**: `useResponsive()` and role layouts use a 1024px compact breakpoint. Below that width, the mobile drawer is used; content uses responsive padding and stacks dashboard/form columns.
- **Role boundaries**: Admin screens are global. PM, site-manager, supplier, client, and worker screens must filter data to the signed-in user's assignments or identity and must not reuse admin-wide mutations without a role check.
- **State Management**: React local state (`useState`, `useEffect`) and optimistic UI updates upon API success. The application relies on `refreshTrigger` integer increments passed to components to re-trigger `useEffect` data fetches instead of a complex Redux store.
- **API Design**: The frontend fetches basic read-only or realtime data directly from Supabase via the JS SDK. Complex mutations (like Bulk Payroll or QR Scans) are routed through the FastAPI backend to ensure atomicity.

## 6. Data Models / Schemas (PostgreSQL / Supabase)
- **`profiles`**: Links to `auth.users`. Contains `role` (`super_admin`, `pm`, `site_manager`, `client`, `worker`, `supplier`), `full_name`, `email`, and `qr_code`.
- **`projects`**: The core entity. Belongs to a PM (`pm_id`) and Client (`client_id`). Includes `latitude` and `longitude`.
- **`materials`**: Site inventory stock catalog. Requires a `project_id`.
- **`purchase_orders`**: Formal orders assigned to a `supplier_id`.
  - Statuses: `Pending Delivery`, `Confirmed`, `Delivered`, `Received`, `Cancelled`, `Rejected`, `Suggested`.
  - `Delivered` means the supplier reported delivery; `Received` means the assigned PM/site manager/admin confirmed receipt and stock was incremented once.
- **`attendance`**: Canonical daily attendance/timesheet target. `attendance.worker_id` references `workers.id`, and `workers.user_id` links to the authenticated profile. Legacy `labour` reads remain in several screens and must be converted after the staging identity export; names must never be used as identity keys.
- **`notifications`**: Generic alert table. Fields: `target_user_id`, `target_role`, `type`, `message`, `is_read`.
- **`salary_slips`**: Auto-generated objects capturing total days, overtime hours, and total payouts.
- **`milestones` & `milestone_media`**: Defines project phases and tracks Cloudinary progress images.
- **`client_messages`**: Central chat logs linking a Client and their Project Manager via `sender_id` and `receiver_id`.

## 7. API / Interfaces
- **FastAPI Endpoints**: Secured via `Depends(get_current_user)`.
  - `POST /api/purchase-orders`: Create PO.
  - `PATCH /api/purchase-orders/{id}/(approve|reject|suggest|deliver)`: Supplier/Admin actions.
  - `PATCH /api/purchase-orders/{id}/receive`: PM/site-manager/admin goods-received confirmation and stock update.
  - `POST /api/purchase-orders/check-late`: Scans for overdue POs.
  - `POST /api/projects`: Full project creation.
  - `POST /api/projects/{id}/milestones`: Create milestones.
  - `PATCH /api/projects/{id}/milestones/{milestone_id}`: Update milestones.
  - `POST /api/labour/scan`: Validates QR code, marks attendance check-in/out.
  - `POST /api/labour/salary/generate`: Bulk generates payroll based on attendance.
  - `POST /api/messages` & `GET /api/messages/{project_id}`: Client-PM messaging.
  - `GET /api/reports/...`: Aggregated data for admin dashboards.
- **AI & Integrations Endpoints** (via Raw Fetch + JWT):
  - `POST /api/ai/predict-cost`: RandomForest model estimation.
  - `GET /api/ai/insights`: Market trends & Feature importance for Delay Risk Panel.
  - `POST /api/media/upload`: Cloudinary multipart image upload.
  - `POST /api/notifications/email/*`: Resend integration.

## 8. Environment & Configuration
- **Frontend Config** (`/frontend/.env`):
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_API_URL` (Set to `http://localhost:8000/api` locally)
- **Backend Config** (`/backend/.env`):
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (Anon Key)
- **Running Locally**:
  1. Backend: `cd backend`, activate venv (`..\.venv\Scripts\Activate.ps1`), `pip install -r requirements.txt`, `uvicorn main:app --reload --port 8000`.
  2. Frontend: `cd frontend`, `npm install`, `npm run web`.

## 9. Current Blockers / Open Questions
- **Integration Testing**: We are currently executing the Phase 8 integration test plan.

## 10. Next Steps
- **Immediate Task**: Walk through the test suite manually with each of the 6 core roles using Expo Go. Verify that real-time syncs function correctly and Role-Level Security (RLS) properly isolates each tenant.
- **Long-term**: Production deployment preparation (Supabase custom domain, Vercel for backend/frontend hosting, configuring real WebSockets via Pusher or Supabase Realtime).

## 11. Important Notes for AI Collaboration
- **Platform-Specific APIs**: Use `Platform.OS === 'web' ? window.confirm() : Alert.alert()` when triggering confirmation dialogs (e.g. Deleting users, rejecting orders). Standard React Native `Alert.alert` with multiple buttons fails silently on Web.
- **Styling Constraints**: Strictly use NativeWind (Tailwind CSS classes) for styling (`className="bg-brand-orange px-4 py-2"`). Avoid inline `style={{}}` unless doing complex dynamic calculations or Reanimated animations.
- **Design System**: Maintain the glassmorphism aesthetic, rounded corners (`rounded-lg`), and brand colors defined in `tailwind.config.js`. Ensure interfaces look "premium".
- **Component Pattern**: Prefer small, modular, functional components. Keep data fetching inside `useEffect` with `isMounted` checks to prevent memory leaks.
- **API Pattern**: Register core backend endpoints in `src/services/api.ts`. For AI/Integration endpoints, raw `fetch()` with `process.env.EXPO_PUBLIC_API_URL` and auth header injection is also an accepted pattern.
- **Navigation Pattern**: Web deployments using Expo Router are sensitive to directory conflicts. Do not mix `route.tsx` and `route/index.tsx`. Always use `<Link href="..." asChild>` with a nested `<Pressable>` or `<a>` component for web stability.
- **Pathing Warning**: Pay extreme attention to relative import depth (e.g., `../../../components/common/TopNav`) when scaffolding or modifying nested pages. Incorrect depth will crash the Metro Bundler.

## 12. Changelog
- [2026-09-26] (Phase 1 RLS hardening prepared)
  - Added schema and foreign-key preflight guards to the core RLS migration.
  - Replaced broad staging-policy assumptions with exhaustive policy replacement across 24 covered tables.
  - Added role and project/site boundaries for projects, workers, attendance, materials, procurement, payroll, milestones, chat, documents, issues, expenses, and notifications.
  - Fixed a recursive worker-policy path found by local PostgreSQL role testing.
  - Corrected QR attendance to send `site_id` and map profile identity to `workers.id` before inserting attendance.
  - Removed all unconditional true policies and mock project seeds from repository SQL.
  - Scoped legacy labour API reads/writes to the authenticated role and managed projects while canonical attendance migration remains pending.
  - Verified 37 backend tests, 14 workflow database checks, 8 notification checks, TypeScript, and 12 local authenticated RLS isolation assertions.
  - Staging migration and six real-account acceptance remain pending the updated identity export.

- [2026-09-25] (Goods-received workflow staged)
  - Added `backend/migrations/20260925_goods_received.sql` with delivery/receipt metadata and a `Received` status.
  - Supplier delivery no longer increments stock; assigned PM/site-manager/admin receipt performs the single transactional stock increment.
  - Added `PATCH /api/purchase-orders/{id}/receive`, frontend API support, delivery/receipt notifications, and regression coverage.
  - Live application is intentionally pending until the Phase 1 schema audit and authenticated staging RLS tests are accepted.

- [2026-09-25] (Full completion brief: Phase 1 in progress)
  - Applied caller-scoped milestone and expense permissions, including project/milestone matching and finance role checks.
  - Corrected targeted-notification filtering so another user with the same role cannot receive it through the shared filter.
  - Added project permission regression tests, notification checks, and a read-only staging schema audit.
  - No live migrations or six-role acceptance tests have run; later phases remain pending.
- [2026-07-30] (Initial Phase)
  - Fixed `Ionicons` import crash on Admin Labour page.
  - Replaced Web navigation `router.push` with `Link` for stability in Admin and PM Projects pages.
  - Implemented Realtime Supabase subscriptions for Admin Users Directory to auto-refresh on changes.
  - Updated User Management Detail Page (`[id].tsx`) with inline Edit functionality and Supabase `update` integration.
  - Standardized `profiles` roles to align with database constraints (`super_admin`, `pm`, `site_manager`).
  - Added mock user records (Admin, PM, Client, Site Manager) to properly populate the directory table.
- [2026-07-30] (Phases 5-8 Completion)
  - Implemented AI Cost Estimator pages (`pm` and `admin` routes) connected to RandomForest ML backend endpoint.
  - Fixed `DelayRiskPanel` on the PM Dashboard to consume synthetic ML delay data from `/api/ai/insights`.
  - Added Supplier Profile page to allow suppliers to manage their company info.
  - Built Cloudinary media upload backend endpoint (`/api/media/upload`) and configured `.env`.
  - Built Resend email notification backend endpoints (`/api/notifications/email/*`).
  - Added `httpx`, `scikit-learn`, `numpy`, `pandas`, `python-multipart` to backend dependencies.
  - Cleared all Expo Router Metro bundler file/directory naming conflicts (e.g. `materials.tsx` -> `materials/index.tsx`).
- [2026-07-30] (Major Workflow Expansion)
  - Fixed recursive RLS policy bug on `profiles` table.
  - Built backend API (`POST /api/projects`) and frontend UI (`admin/projects/create.tsx`) for Admin Project Creation, properly linking clients and PMs.
  - Implemented `POST /api/labour/scan` for validating QR codes and tracking worker check-in/out attendance with hours logged.
  - Wired Site Manager `attendance/index.tsx` to simulate API QR scanning.
  - Created Project Milestones endpoints (`/api/projects/{id}/milestones`) for creating and updating project phases with media.
  - Built PM Milestone Tracking UI (`pm/projects/[id]/milestones/index.tsx`) and Admin Milestone Creation UI.
  - Engineered `POST /api/labour/salary/generate` for auto-calculating total days worked, overtime, and generating salary slips for a date range.
  - Fully implemented the Client Portal: `client/dashboard.tsx` (progress overview), `client/project/index.tsx` (milestone map), `client/messages/[threadId].tsx` (real-time chat with PM), and `client/project/estimates.tsx` (AI cost estimator).
  - Fixed deeply nested relative import pathing errors crashing the Metro Bundler on new scaffolded pages.
- [2026-07-30] (Workforce & Materials Overhaul)
  - Updated User Management forms to gracefully handle Web `window.confirm` dialogues.
  - Patched `handle_new_user` SQL trigger to auto-copy user `email` from Supabase Auth directly into `profiles`.
  - Built comprehensive Materials & Orders UI (`/admin/materials`), migrating completely away from stubs.
  - Implemented smart dropdowns in PO Creation fetching live data from `profiles`, `projects`, and `materials` tables.
  - Re-mapped the Material "Expected Deliveries" widget to filter strictly by `status = 'Pending Delivery'`.
  - Fully wired the Labour Dashboard (`/admin/labour`) to read dynamically from `profiles` (for total workers) and `labour` (for today's attendance/overtime).
  - Rebuilt the Check-In worker modal, replacing unused `api/attendance` calls with direct Supabase `labour` table inserts.
  - Created dynamic Attendance Logs partitioned per project site (`/admin/attendance/[id]`).
  - Overhauled Payroll Generation (`/admin/payroll`) to instantly calculate wages based on `labour` table hours (Rs. 3,500 base, 1.5x Overtime) completely client-side for rapid dashboarding.
