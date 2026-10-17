# ConstructFlow

ConstructFlow is a construction project management system for teams operating in Sri Lanka. It brings project planning, labour attendance, materials, supplier orders, payroll, client communication, media, and construction cost insights into one role-based workspace.

This repository contains both the cross-platform application and its FastAPI service:

- `frontend/`: React Native application built with Expo Router. It runs on web, Android, and iOS.
- `backend/`: FastAPI REST API, Supabase data access, scheduled checks, document generation, integrations, and ML endpoints.
- `frontend/supabase/` and `backend/*.sql`: Supabase/PostgreSQL schema and migration scripts. These files are still being consolidated; read the database section before applying SQL.

## Current Status

The main role-based workflows are implemented and connected to Supabase:

- **Authentication & Role Security**: Secure login, password recovery, role-based URL namespacing (`/admin`, `/pm`, `/site-manager`, `/supplier`, `/client`, `/worker`), and protected layout session guards.
- **Cinematic Landing Page**: Features a scroll-scrubbing 3D-orbit construction video background (`homepage_scroll.mp4`) with smooth forward/reverse lerping on web and native video playback on mobile. Redesigned with a centralized, high-impact hero headline (responsively scaled from 42px on mobile to 78px on wide screens), centered dual portal CTAs ("Team Portal" and "Partner Portal"), horizontal metrics bar, and an integrated public inquiry form connected to `/api/public-inquiry` with automated admin notifications.
- **Universal Multi-Platform API Resolution**: Centralized `getApiUrl()` (`lib/apiUrl.ts`) automatically resolves backend endpoints across web browsers (window hostname) and physical mobile devices on Expo Go (dynamically resolving computer LAN IP via Metro bundler metadata, eliminating loopback connection failures).
- **Notification System**: Full cross-platform alert center with Supabase Realtime subscriptions, role-targeted broadcast alerts, and a hardened "Mark all as read" API (`PATCH /api/notifications/mark-read`) utilizing backend service-role client permissions with client-side direct Supabase update fallbacks.
- **Admin Suite**: Global oversight for projects, users, assignments, milestones, expenses, materials, purchase orders, suppliers, labour, and payroll.
- **Project Manager Portal**: Assigned-project scoping, material approvals, labour summaries, salary-slip generation, client/project team views, supplier summaries, and AI cost estimation.
- **Site Manager Operations**: Site selection, worker assignment, QR attendance scanning, site-scoped materials, stock tracking, site reports, photos, and incident issue reporting.
- **Supplier Portal**: Purchase-order review and response workflows: confirm, reject, suggest counter-offers, and mark orders delivered.
- **Worker Experience**: Mobile-first personal profile, QR identity badge, daily attendance logs, and salary-slip history.
- **Client Transparency**: Project progress, milestone tracking with media, invoices, document repository, cost estimates, and real-time messaging with project managers.
- **Responsive Portal Shell**: Desktop sidebars gracefully switch to an animated slide-over drawer below 1024px; dashboard cards, charts, and tables stack seamlessly across phone, tablet, and desktop viewports.
- **NativeWind Stability**: UI components adhere to strict React Native styling conventions, avoiding dynamic CSS variable classes (`ring-*`) on interactive state toggles to prevent CSS interop React Fiber serialization crashes.
- **Background Automation & ML**: FastAPI background scheduler (APScheduler) monitors overdue purchase orders and low stock levels daily/hourly with `job_runs` database logging, alongside scikit-learn `RandomForest` cost and delay prediction models.

Some generated screens remain intentionally phased. The core role dashboards and scoped operational screens are active and connected. Report export pages, live GPS delivery tracking, and auxiliary client components are targeted for subsequent production hardening.

## Technology Stack

### Frontend

- React 19.1 and React Native 0.81
- Expo SDK 54 and Expo Router 6
- TypeScript 5.9
- NativeWind and Tailwind CSS
- Supabase JavaScript client for Auth, database queries, Realtime, and Storage
- React Native Reanimated, Expo Camera, Image Picker, Location, Notifications, Sharing, and QR Code SVG
- Recharts and React Native chart components used by dashboard surfaces

### Backend

- Python 3.10+ recommended
- FastAPI with Uvicorn
- Pydantic and pydantic-settings
- Supabase Python client
- NumPy, pandas, scikit-learn, and joblib for the ML pipeline
- APScheduler for periodic background checks
- ReportLab for PDF invoices
- httpx, python-multipart, Cloudinary HTTP upload flow, and Resend email integration

### Managed services

- Supabase: authentication, PostgreSQL, Realtime, and object storage
- Cloudinary: backend site-photo upload endpoint
- Resend: optional email delivery

## Roles and Portals

Roles are stored in `profiles.role`. The canonical lowercase role values used by current routing are:

| Role | Portal | Main responsibilities |
| --- | --- | --- |
| `admin` or `super_admin` | `/admin` | Global users, projects, materials, suppliers, labour, payroll, reports, and ML insights |
| `pm` | `/pm` | Assigned projects, approvals, labour, payroll, clients, and estimates |
| `site_manager` | `/site-manager` and legacy `/site` | Site workers, attendance, material requests, photos, and issues |
| `supplier` | `/supplier` | Purchase-order review and delivery workflow |
| `client` | `/client` | Project progress, media, invoices, documents, estimates, and messages |
| `worker` | `/worker` | Personal QR code, attendance, profile, and payroll |

The signup form also contains display labels such as `Project Manager` and `Site Manager`. The auth layout maps both display labels and lowercase values, but new database records should use the lowercase values above.

### Role data boundaries

- `admin`/`super_admin`: global management of users, projects, materials, suppliers, labour, payroll, reports, and insights.
- `pm`: only assigned projects and their related clients, team members, suppliers, materials, labour, payroll, milestones, and estimates. PM order creation filters project choices to PM-managed projects.
- `site_manager`: only assigned sites, workers, attendance, materials, requests, photos, and issues. Site-manager labour views do not use the global admin workforce directory.
- `supplier`: only purchase orders and delivery actions relevant to the supplier account.
- `client`: only client-owned projects and related progress, media, invoices, documents, estimates, and messages.
- `worker`: only the worker's QR identity, attendance, payroll, profile, and settings.

## Repository Layout

```text
Construct-flow/
├── README.md
├── instructions.md                 # Short local run instructions
├── AGENT.md                        # Detailed project notes and conventions
├── frontend/
│   ├── src/app/                    # Expo Router pages and role portals
│   ├── src/components/             # Shared dashboard and domain components
│   ├── src/context/                # Auth, theme, and sidebar state
│   ├── src/hooks/                  # Realtime, responsive, and notification hooks
│   ├── src/lib/supabase.ts         # Supabase client
│   ├── src/services/api.ts         # Authenticated API wrapper
│   ├── src/global.css
│   ├── package.json
│   └── supabase/                   # Frontend-era schema and migration SQL
├── backend/
│   ├── main.py                     # FastAPI app and router registration
│   ├── api/routes/                 # Domain API routers
│   ├── api/models.py               # Pydantic request/response models
│   ├── core/                       # Config, security, database, and Supabase clients
│   ├── services/                   # Email, PDF, and Cloudinary-related services
│   ├── jobs/                       # Scheduler-related code
│   ├── models/                     # Generated ML model files
│   ├── data_pipeline/              # Dataset preparation and model training
│   ├── requirements.txt
│   └── schema*.sql                 # Backend-era schema scripts
└── *.csv                           # Root-level project datasets
```

## Installation & Getting Started

### 1. Prerequisites

Before setting up ConstructFlow, ensure you have the following installed on your development machine:

- **Node.js**: v20 or v22+ LTS recommended (Node 22 avoids engine deprecation warnings with Supabase).
- **npm**: v10+ (bundled with Node.js).
- **Python**: v3.10, v3.11, or v3.12 (with `pip` and `venv`).
- **Supabase Account**: A free or paid Supabase project with PostgreSQL, Auth, and Storage enabled.
- **Expo Go** *(Optional for mobile testing)*: Installed on your physical Android or iOS device from Google Play or Apple App Store.
- **Android Studio / Xcode** *(Optional)*: If running emulators or simulators locally.

---

### 2. Environment Configuration

ConstructFlow requires environment variables configured for both the frontend (Expo) and backend (FastAPI).

#### A. Frontend Configuration (`frontend/.env`)
Create a `.env` file inside the `frontend/` directory:

```dotenv
# Supabase Project Credentials (Found under Supabase Dashboard > Settings > API)
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>

# Backend API Endpoint
# Default localhost for Web development:
EXPO_PUBLIC_API_URL=http://localhost:8000/api

# Optional: Override for physical mobile devices when Metro bundler is tunneling or backend is hosted:
# EXPO_PUBLIC_NATIVE_API_URL=http://<your-computer-lan-ip>:8000/api

# Optional: Google Maps integration key for project geolocation pins
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<optional-google-maps-api-key>
```

> **Note on Mobile LAN Resolution**: You do NOT need to hardcode your local IP address for standard Wi-Fi testing. ConstructFlow's `frontend/src/lib/apiUrl.ts` automatically extracts your computer's LAN IP from the Expo Metro bundler host URI when running on Expo Go.

#### B. Backend Configuration (`backend/.env`)
Create a `.env` file inside the `backend/` directory:

```dotenv
# Supabase Database Credentials
SUPABASE_URL=https://<your-project-ref>.supabase.co
# Anon key for user-level requests:
SUPABASE_KEY=<your-supabase-anon-key>
# Service role key (REQUIRED for administrative background jobs, mark-all-read notifications, and bypass operations):
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

# Transactional Email Service (Optional: Resend)
RESEND_API_KEY=<optional-resend-api-key>
RESEND_FROM_EMAIL=ConstructFlow <noreply@constructflow.lk>

# Cloudinary Media Storage (Optional: Site photo uploads)
CLOUDINARY_CLOUD_NAME=<optional-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<optional-cloudinary-api-key>
CLOUDINARY_API_SECRET=<optional-cloudinary-api-secret>
```

---

### 3. Database Initialization (Supabase)

ConstructFlow utilizes Supabase PostgreSQL with Row Level Security (RLS) policies, Realtime publications, and triggers.

1. Navigate to your **Supabase Dashboard > SQL Editor**.
2. Run the foundational schema migrations from `frontend/supabase/`:
   - `schema.sql`: Core tables (`profiles`, `projects`, `materials`, `labour`, `material_requests`).
   - `schema_part2.sql`: Media, messages, and invoices.
   - `schema_pm.sql`: Payroll, milestones, and notification schemas.
   - `phase5_migration.sql`: Site manager sites, site workers, suppliers, issues, and salary slips.
   - `02_add_expenses.sql`: Project expenses and financial cost tracking.
   - `schema_fixes.sql`: Role normalization, foreign key constraints, and RLS adjustments.
3. Ensure the storage bucket `project-images` is created under **Supabase Storage** with public read access or appropriate authenticated policies.
4. Enable **Realtime** on `notifications`, `client_messages`, and `purchase_orders` tables under **Database > Publications > supabase_realtime**.

---

### 4. Step-by-Step Installation & Run Guide

#### Step 4.1: Start the FastAPI Backend

Open a terminal in the project root:

**Windows (PowerShell):**
```powershell
# 1. Create and activate a Python virtual environment
python -m venv .venv
& ".\.venv\Scripts\Activate.ps1"

# 2. Navigate to backend and install dependencies
cd backend
pip install -r requirements.txt

# 3. Start Uvicorn server bound to 0.0.0.0 (enables LAN connections for mobile devices)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**macOS / Linux (Bash):**
```bash
# 1. Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Navigate to backend and install dependencies
cd backend
pip install -r requirements.txt

# 3. Start Uvicorn server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify backend health in your browser:
- **API Status**: [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

#### Step 4.2: Start the React Native / Expo Frontend

Open a second terminal in the project root:

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Launch directly on Web
npm run web
```

Alternatively, launch the **interactive Expo developer menu**:
```bash
npm start
```
From the interactive CLI prompt:
- Press `w` to open the **Web application** (`http://localhost:8081`).
- Press `a` to open in an **Android Emulator**.
- Press `i` to open in an **iOS Simulator** (macOS only).
- Scan the QR code using the **Expo Go** app on your physical mobile phone.

---

### 5. Running on Physical Mobile Devices (Expo Go)

To test seamlessly on an Android or iOS phone:
1. Ensure your computer and phone are connected to the **same Wi-Fi network**.
2. Run Uvicorn with `--host 0.0.0.0` (as shown above).
3. Ensure your OS firewall (e.g., Windows Defender Firewall) allows incoming TCP traffic on port `8000`.
4. Scan the QR code printed in the terminal by `npm start`.
5. ConstructFlow will dynamically identify your host machine's IP (e.g., `192.168.1.X:8000/api`) and route API requests without requiring localhost tunnels.

---

### 6. Training the Machine Learning Models (Optional)

ConstructFlow includes synthetic and historical construction datasets to train cost estimation regressors and delay classifiers:

```powershell
# From the project root with .venv activated:
cd backend/data_pipeline
python prepare_dataset.py
python train_models.py
```
This generates serialized model artifacts under `backend/models/` (`cost_model.joblib` and `delay_model.joblib`).

## Architecture and Data Flow

1. `frontend/src/app/_layout.tsx` mounts the global CSS, providers, auth guard, push-notification hook, and Expo Router slot.
2. Supabase Auth provides the session. The user's role is read from auth metadata or `public.profiles` and determines the dashboard redirect.
3. The frontend reads many ordinary dashboard records directly through the Supabase JS client and subscribes to selected Realtime changes.
4. Mutations requiring server-side logic use the FastAPI API. The frontend API wrappers add the Supabase access token as a Bearer token.
5. FastAPI validates JWTs through `core/security.py`, uses the Supabase client for database operations, and exposes domain routers under `/api`.
6. The backend starts an APScheduler instance with FastAPI. It checks overdue purchase orders hourly and low stock daily by calling the corresponding API handlers.

The frontend auth provider resolves the Supabase session before rendering protected portal content, normalizes role variants such as `Project Manager` and `site_manager`, and ignores stale role lookups. Web auth tokens remain in the storage used by the Supabase client; the login screen only persists the optional remembered email.

There is no Redux store. Most screens use local React state, `useEffect`, explicit reload functions, and a `refreshTrigger` counter. Preserve that local pattern unless a new feature genuinely needs shared state.

## Backend API Surface

The generated API contract is in [backend/openapi.json](backend/openapi.json). When the backend is running, interactive documentation is available at `/docs`.

### Secured routers

These routers are registered with `Depends(get_current_user)` in [backend/main.py](backend/main.py):

- `/api/projects`: project CRUD, milestone creation/update, and project expenses.
- `/api/materials`: material reads/creation and low-stock checks.
- `/api/labour`: labour records, QR attendance scans, payroll aggregation, and salary generation.
- `/api/clients`: client records and client invitation/update/delete flows.
- `/api/estimations`: estimation CRUD and the legacy `/predict` endpoint.
- `/api/notifications`: email delivery helpers and email health check.
- `/api/purchase-orders`: create, approve, reject, suggest, deliver, and late-order checks.
- `/api/reports`: project, material, and payroll report aggregations.
- `/api/messages`: send and retrieve project messages.

### Currently registered without the global auth dependency

- `/api/ai/predict-cost` and `/api/ai/insights`: cost estimator and ML dashboard insight responses.
- `/api/documents/invoice/{project_id}`: PDF invoice generation.
- `/api/media/upload` and `/api/media/health`: Cloudinary upload and configuration check.

The comment in `main.py` describes these as testing/demo routes. Add explicit authentication and authorization before exposing them in production.

### Important API examples

```text
GET   /health
POST  /api/projects/
PATCH /api/projects/{project_id}
POST  /api/projects/{project_id}/milestones
PATCH /api/projects/{project_id}/milestones/{milestone_id}
POST  /api/labour/scan
POST  /api/labour/salary/generate
POST  /api/purchase-orders
PATCH /api/purchase-orders/{po_id}/approve
PATCH /api/purchase-orders/{po_id}/reject
PATCH /api/purchase-orders/{po_id}/suggest
PATCH /api/purchase-orders/{po_id}/deliver
POST  /api/ai/predict-cost
GET   /api/ai/insights
POST  /api/media/upload
GET   /api/documents/invoice/{project_id}
```

Use a valid Supabase access token for protected routes:

```http
Authorization: Bearer <supabase-access-token>
```

## Supabase Database Setup

The SQL history contains overlapping schemas from the original MVP and later architecture phases. Names and columns are not completely uniform: for example, some older scripts use `attendance`, `material_requests`, and `invoices`, while later scripts add assignment tables, `salary_slips`, `milestones`, `client_messages`, `site_manager_sites`, and `site_workers`.

Before applying migrations to a real project:

1. Back up the Supabase database.
2. Inspect the active database schema and compare it with the frontend queries and backend models.
3. Apply only the scripts needed to reach the intended state. Do not run every `.sql` file alphabetically.
4. Verify foreign keys, enum/check constraints, Realtime publication settings, Storage buckets, and RLS policies.
5. Test with one account for each role.

The most relevant scripts are:

- [frontend/supabase/schema.sql](frontend/supabase/schema.sql): initial project, labour, attendance, materials, and material-request tables.
- [frontend/supabase/schema_part2.sql](frontend/supabase/schema_part2.sql): invoices, photos, and messages.
- [frontend/supabase/schema_pm.sql](frontend/supabase/schema_pm.sql): payroll, milestones, and notifications.
- [frontend/supabase/phase5_migration.sql](frontend/supabase/phase5_migration.sql): later assignments, sites, suppliers, milestones, issues, salary slips, and RLS work.
- [frontend/supabase/02_add_expenses.sql](frontend/supabase/02_add_expenses.sql): project expenses and `spent_cost`.
- [frontend/supabase/schema_fixes.sql](frontend/supabase/schema_fixes.sql): role normalization, missing columns, tables, and RLS changes.
- `backend/schema*.sql`: earlier backend-oriented schema and ML scripts.

### Core entities used by the current application

- `auth.users` and `profiles`: authentication identity, name, email, role, worker data, and QR code.
- `projects`: project name, location/address, status, budget, dates, client, PM, and coordinates.
- `pm_projects`, `site_manager_sites`, and `site_workers`: role-to-project/site assignments.
- `materials`, `site_materials`, and `material_requests`: catalog, site stock, and approval workflow.
- `purchase_orders`: supplier order, quantities, pricing, expected delivery, status, and invoice data.
- `labour` and/or `attendance`: attendance data. The repository currently contains code using both models, so this needs to be standardized before production hardening.
- `milestones`, `milestone_media`, and `milestone_notes`: project progress tracking.
- `salary_slips`: generated payroll records.
- `notifications`: role/user-targeted alerts.
- `client_messages`: client-PM project communication.
- `project_expenses`: logged project costs.
- `site_photos` or `photos`: site media, depending on which schema generation is active.
- `estimations`, `historical_costs`, and `ml_predictions`: estimation history and ML-related data.

### RLS warning

Several development scripts contain permissive policies such as `USING (true)`. Other scripts attempt stricter role-based policies and include fixes for recursive `profiles` policies. Treat the database as development-only until RLS has been tested for every role and every table. Direct SQL in the Supabase SQL Editor is preferred for migration and seed work when anon-key inserts are blocked.

## ML and Data Pipeline

There are two related estimation paths:

1. `backend/api/routes/ai.py` trains a synthetic 1,000-row `RandomForestRegressor` when the module loads and serves `/api/ai/predict-cost` and `/api/ai/insights`.
2. `backend/data_pipeline/` prepares the construction dataset and trains persisted models with `train_models.py`. The generated files are written under `backend/models/`.

### Machine Learning Architecture: Log-Scale Hybrid Cost Estimator

The AI cost estimator uses a **hybrid bottom-up quantity and log-scale ML architecture**:
1. **Physical Bottom-Up Calculation**: Computes quantities of cement bags, steel kg, river sand cubes, aggregate cubes, site labour worker-days (calibrated to the standard Sri Lankan daily rate of Rs. 3,500/day), and a 15% preliminaries/overhead margin.
2. **Log-Scale Model ($\ln(\text{Cost}/\text{SqFt})$)**: Random Forest and Gradient Boosting models predict log-scale cost per square foot, calibrated by district, site conditions, structure type, and finishing levels.
3. **Honest Prediction Uncertainty**: Produces a conformal/uncertainty range ($\pm 15\text{--}20\%$, e.g. "LKR 14.5M to LKR 18.2M") reflecting early-stage design variance.
4. **Real Evaluation Gate**: Accuracy is evaluated strictly against verified completed projects using **MAPE** (Mean Absolute Percentage Error) and **MAE**. Synthetic rows are never used for accuracy claims; if real projects $N < 5$, ML Insights displays `"Not enough real data yet (based on N real projects)"`.
5. **Deterministic Delay Risk**: Delay risk is calculated 100% deterministically from overdue milestones, delayed purchase orders, and low site attendance.
6. **Continuous Learning Loop**: Automatically adds completed project actuals to `historical_projects` and confirmed supplier prices to `material_prices`. Admins can import past contractor/QS BOQs via CSV validation against the 25 Sri Lankan districts.
7. **Legacy Synthetic CSVs**: Uncorrelated random datasets (`construction_project_dataset.csv`, `construction_project_performance_dataset.csv`) have been decommissioned and moved to `data/legacy_synthetic/` with a deprecation notice.

Run the pipeline from `backend/data_pipeline`:

PowerShell:

```powershell
cd backend/data_pipeline
python prepare_dataset.py
python train_models.py
```

## Integrations and Storage

### Email Infrastructure & Railway Deployment

- **Railway SMTP Block**: Outbound SMTP ports (587, 465, 25) are blocked on Railway Trial, Free, and Hobby plans. ConstructFlow prioritizes HTTPS REST APIs:
  - **Resend HTTPS API**: `https://api.resend.com/emails` (configured via `RESEND_API_KEY`)
  - **Brevo HTTPS REST API**: `https://api.brevo.com/v3/smtp/email` (configured via `BREVO_API_KEY`)
  - **Legacy SMTP**: Only attempted if `ENABLE_SMTP=true` is explicitly set in environment variables.
- **Zero-Password Logging**: Plaintext passwords are strictly redacted from development logs and audit trails (`CREDENTIALS: [PROTECTED / REDACTED]`).
- **Resilient Delivery**: Failed network deliveries record standardized error codes (`RATE_LIMIT_EXCEEDED`, `AUTH_KEY_INVALID`, `EMAIL_DELIVERY_FAILED`), allowing administrators to generate one-time invite and password reset links.

### Supabase Storage

The frontend site-photo flow uses a `project-images` bucket and stores rows in the active photo table. Confirm the bucket exists and has policies allowing the intended authenticated uploads and reads.

### Cloudinary

The backend endpoint `POST /api/media/upload` accepts multipart form data:

- `file`: image file
- `project_id`: required project ID
- `site_id`: optional site ID
- `caption`: optional caption

Use `/api/media/health` to verify that Cloudinary variables are configured.

### PDF invoices

`GET /api/documents/invoice/{project_id}` returns a generated PDF. The implementation currently uses fallback/mock estimate values in some cases and should be reviewed before financial use.

## Development Conventions

- Use NativeWind classes for normal styling and keep the existing brand tokens in `frontend/tailwind.config.js`.
- Preserve role-prefixed Expo Router paths, for example `/admin/dashboard` and `/supplier/dashboard`.
- Do not create conflicting route shapes such as both `route.tsx` and `route/index.tsx` for the same path.
- Use `<Link href="..." asChild>` for web navigation where the surrounding route already follows that pattern.
- Keep relative import depth accurate in deeply nested route files. Prefer the existing `@/` alias where configured.
- Include Supabase session tokens when calling protected backend endpoints.
- For confirmation dialogs, use `window.confirm`/`window.alert` on web and `Alert.alert` on native.
- Keep asynchronous screen effects guarded with an `isMounted` cleanup where that is the existing local pattern.
- Use `LKR` or `Rs.` consistently for user-facing currency, and do not hard-code production credentials.

## Known Limitations and Next Work

Prioritize these before a production release:

1. Consolidate the SQL schema and choose one canonical attendance, photo, site, supplier, notification, and milestone model.
2. Harden and test RLS policies for every role; remove development-wide `true` policies.
3. Add automated backend tests, frontend tests, and an authenticated smoke test for each portal.
4. Replace remaining generated route stubs and mock client auxiliary gallery/milestone/chat/payment data with real queries and mutation flows.
5. Complete Admin reporting, supplier delivery tracking, client dashboard, and site-manager issue/detail workflows.
6. Align the frontend API wrappers with the routes actually registered in `backend/main.py`; remove or implement unused wrapper methods.
7. Make the AI estimator use the persisted training pipeline, version models, validate inputs, and record model metadata.
8. Restrict CORS, secure the currently unauthenticated demo routers, configure production secrets, and deploy the backend/frontend with a reachable API URL.
9. Add proper background-job observability and avoid making scheduler callbacks depend on a single local Uvicorn process.

## Troubleshooting

### Frontend opens a blank web page

Run `npm start -- --clear` from `frontend`, confirm that `package.json` is in the current directory, and check the browser console for a route import error.

### API requests fail from Expo Go

Run Metro in LAN mode and Uvicorn with `--host 0.0.0.0`. The phone and computer must share a network and Windows Firewall must allow port 8000. If Metro is tunneled, set `EXPO_PUBLIC_NATIVE_API_URL` to the deployed backend HTTPS URL or a phone-reachable LAN URL. The native resolver rejects unresolved localhost instead of sending requests to the phone itself.

### Supabase reports RLS violations

Confirm that the user is authenticated, that the JWT role/profile is correct, and that the target table has a policy for the operation. Apply and test SQL in the Supabase dashboard rather than bypassing RLS in application code.

### Metro cannot resolve a nested import

Check the relative path from the route file to `src/components`, `src/lib`, or `src/context`. Nested dynamic routes are especially sensitive to `../../` depth.

### AI or media features return errors

Check that the backend is running, `EXPO_PUBLIC_API_URL` has the `/api` suffix, and the optional Cloudinary/Resend variables are configured. Use `/api/health`, `/api/media/health`, and `/api/notifications/email/health` where applicable.

## Additional Project Notes

- [instructions.md](instructions.md) contains the short local run guide.
- [AGENT.md](AGENT.md) contains detailed implementation notes and historical decisions. Verify those notes against the current source before using them as an API contract.
- [backend/openapi.json](backend/openapi.json) is the generated API snapshot. Regenerate or update it when routes change.
