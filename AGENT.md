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
  - `admin/materials/`: Purchase orders and site stock inventory tables, detailed `[id]` PO view, intelligent create forms.
  - `admin/labour/`, `admin/attendance/`, `admin/payroll/`: Unified workforce suite for checking in workers, viewing site logs, and auto-calculating wages.
  - `admin/users/`: Directory and CRUD forms for platform users.
- **`/frontend/src/components/`**: Shared and domain-specific UI components.
  - `common/`: `TopNav`, `Sidebar`, `StatCard`, `AnimatedCard`.
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

## 4. Current State & Progress
- **COMPLETE & Working**:
  - Global authentication and role-based routing (6 role dashboards).
  - Cross-role Realtime Notifications (via WebSockets).
  - User Directory and CRUD management (`/admin/users`), with automatic syncing to Supabase Auth.
  - Materials & Inventory: Site stock tables (`/admin/materials/stock`), Purchase Order creation forms with dynamic dropdowns (bypassing manual entry), and detailed Order views with Confirm/Reject logic.
  - Labour Force Dashboard: Real-time dashboard (`/admin/labour`) summarizing `profiles` and `labour` table attendance.
  - Check-In System: Admins can manually add worker attendance for a site.
  - Attendance Logs: Site-specific worker presence logs (`/admin/attendance/[id]`).
  - Automated Payroll: Real-time wage calculation (`/admin/payroll`) based on `labour` table base hours and overtime rules.
  - Supplier / Purchase Order workflow (Create, Approve, Reject, Suggest, Deliver).
  - Admin Project Creation mapping PMs and Clients.
  - Project milestone tracking (Creation by Admin, Updating by PM, Viewing by Client).
  - Full Client Portal (Dashboard, Milestone timeline viewer, Real-time Chat with PM, AI Cost Estimator Form).
  - AI Estimator integration and ML Delay Risk cron jobs.
  - Direct Cloudinary integration for site photos.
  - Email notifications (Resend API hooked into material request flows).
  - Background Cron Jobs (APScheduler running inside FastAPI).
- **IN PROGRESS**:
  - Wiring up remaining UI stubs (e.g. Master Reporting).
- **PLANNED**:
  - Site Manager Issue Reporting.
  - Supplier Delivery Tracking dashboard.
  - Admin Master Reporting (react-native-chart-kit).
  - WhatsApp Business API notifications.
- **KNOWN BUGS / ISSUES**:
  - Occasional Expo Router Metro bundler file import pathing issues due to deeply nested scaffolded folders. Must ensure `../../` depth is accurate.

## 5. Architecture & Key Design Decisions
- **Client-Server Split**: The frontend handles UI, local state, and direct Supabase Realtime subscriptions (for WebSockets). The backend handles complex business logic (e.g., fulfilling orders, generating alerts, integrations, ML processing, salary generation).
- **Routing**: Strict role-based URL namespacing (`/admin/dashboard`, `/supplier/dashboard`). If a user logs in, their role from `public.profiles` dictates where they are pushed. Web navigation relies on Expo Router's `<Link asChild>` for stability.
- **State Management**: React local state (`useState`, `useEffect`) and optimistic UI updates upon API success. The application relies on `refreshTrigger` integer increments passed to components to re-trigger `useEffect` data fetches instead of a complex Redux store.
- **API Design**: The frontend fetches basic read-only or realtime data directly from Supabase via the JS SDK. Complex mutations (like Bulk Payroll or QR Scans) are routed through the FastAPI backend to ensure atomicity.

## 6. Data Models / Schemas (PostgreSQL / Supabase)
- **`profiles`**: Links to `auth.users`. Contains `role` (`super_admin`, `pm`, `site_manager`, `client`, `worker`, `supplier`), `full_name`, `email`, and `qr_code`.
- **`projects`**: The core entity. Belongs to a PM (`pm_id`) and Client (`client_id`). Includes `latitude` and `longitude`.
- **`materials`**: Site inventory stock catalog. Requires a `project_id`.
- **`purchase_orders`**: Formal orders assigned to a `supplier_id`. 
  - Statuses: `Pending Delivery`, `Confirmed`, `Delivered`, `Cancelled`, `Rejected`, `Suggested`.
- **`labour`**: Acts as the unified attendance log and daily timesheet. Tracks `worker_name`, `check_in_time`, `hours_worked`, `status` (Present/Absent/On Leave), and `date`. (No separate `attendance` table is used).
- **`notifications`**: Generic alert table. Fields: `target_user_id`, `target_role`, `type`, `message`, `is_read`.
- **`salary_slips`**: Auto-generated objects capturing total days, overtime hours, and total payouts.
- **`milestones` & `milestone_media`**: Defines project phases and tracks Cloudinary progress images.
- **`client_messages`**: Central chat logs linking a Client and their Project Manager via `sender_id` and `receiver_id`.

## 7. API / Interfaces
- **FastAPI Endpoints**: Secured via `Depends(get_current_user)`.
  - `POST /api/purchase-orders`: Create PO.
  - `PATCH /api/purchase-orders/{id}/(approve|reject|suggest|deliver)`: Supplier/Admin actions.
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
- **Strict RLS Testing**: Frontend data fetching needs testing against the active RLS policies to ensure tenant isolation works as expected for non-admin accounts. Attempting to seed dummy data via Python anon scripts often fails due to RLS; direct SQL via Supabase Editor is the preferred workaround.
- **Stubs Remaining**: There are still some UI pages that show "Page stub generated successfully" (e.g., specific Reports pages).

## 10. Next Steps
- **Immediate Task**: Prioritize building out the remaining stubs for Site Manager Incident Reporting, Supplier Delivery Tracking, and Admin Reports.
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
