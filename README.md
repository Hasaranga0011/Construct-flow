# ConstructFlow

ConstructFlow is a construction project management system for teams operating in Sri Lanka. It brings project planning, labour attendance, materials, supplier orders, payroll, client communication, media, and construction cost insights into one role-based workspace.

This repository contains both the cross-platform application and its FastAPI service:

- `frontend/`: React Native application built with Expo Router. It runs on web, Android, and iOS.
- `backend/`: FastAPI REST API, Supabase data access, scheduled checks, document generation, integrations, and ML endpoints.
- `frontend/supabase/` and `backend/*.sql`: Supabase/PostgreSQL schema and migration scripts. These files are still being consolidated; read the database section before applying SQL.

## Current Status

The main role-based workflows are implemented and connected to Supabase:

- Authentication, password recovery, role-based routing, and profile management.
- Admin dashboards, project CRUD, user directory, project assignments, milestones, expenses, materials, purchase orders, suppliers, labour, and payroll views.
- Project Manager dashboards, assigned-project filtering, material approval, labour summaries, payroll views, client/project team views, supplier summaries, and AI estimation.
- Site Manager project/site selection, worker assignment, QR attendance, site-scoped labour, material requests, stock viewing, site photos, and issue reporting in the existing `site` route.
- Supplier purchase-order dashboard and order actions: confirm, reject, suggest a counter-offer, and mark delivered.
- Worker attendance history, QR code display, and salary-slip views.
- Client project progress, milestones, media, invoices/financials, documents, estimates, notifications, and messaging surfaces. Some auxiliary client components still contain mock data and require production wiring.
- Role-limited data views: non-admin portals filter records to the signed-in user's projects, sites, orders, or personal records. PM supplier/team views and site-manager labour views follow this rule.
- Responsive portal shell: desktop sidebars switch to an overlay drawer below 1024px; dashboard columns, cards, forms, and list surfaces reflow for phone, tablet, and desktop widths.
- Stable authenticated navigation: role prefixes are composed from `basePath` plus suffix-only sidebar hrefs, and session initialization is guarded against stale asynchronous auth events.
- Supabase Auth, Postgres, Realtime subscriptions, Storage, Cloudinary upload support, Resend email support, scheduled late-order/low-stock checks, and RandomForest-based cost estimation.

Some generated screens are intentionally incomplete. Search for `Page stub generated successfully`, `Stub`, or `coming soon` before treating a route as production-ready. The most visible unfinished areas are report pages, supplier delivery tracking, some client auxiliary components, and parts of the site-manager portal. The core role dashboards and scoped operational screens still require authenticated multi-role smoke testing.

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

## Prerequisites

- Node.js 20 or newer. Node.js 22 or newer is recommended.
- npm.
- Python 3.10 or newer.
- A Supabase project with Auth and the required database tables.
- Expo Go for physical-device testing, or Android Studio/Xcode for native simulators.

## Environment Configuration

Do not commit real credentials. Create local environment files from the following templates.

### `frontend/.env`

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<optional-google-maps-key>
```

`EXPO_PUBLIC_API_URL` must be reachable from the device. `localhost` points to the device itself on a physical phone; use the host machine's LAN IP instead, for example `http://192.168.1.20:8000/api`.

### `backend/.env`

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<supabase-key>

# Optional email integration
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=ConstructFlow <noreply@example.com>

# Optional Cloudinary integration
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<cloudinary-api-key>
CLOUDINARY_API_SECRET=<cloudinary-api-secret>
```

The current backend config uses `SUPABASE_KEY`. Use the key appropriate for the way the backend is deployed and keep service-role credentials server-side only. The frontend must use an anon key.

## Local Development

Open two terminals from the repository root.

### 1. Start the backend

PowerShell:

```powershell
& ".\.venv\Scripts\Activate.ps1"
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

If the virtual environment does not exist yet:

```powershell
python -m venv .venv
& ".\.venv\Scripts\Activate.ps1"
cd backend
pip install -r requirements.txt
```

Useful backend checks:

```text
http://localhost:8000/
http://localhost:8000/health
http://localhost:8000/docs
```

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run web
```

Other frontend commands:

```powershell
npm start              # Expo developer menu
npm run android        # Android device/emulator
npm run ios            # iOS simulator, macOS only
npm run lint           # Expo ESLint command
npm start -- --clear   # Clear Metro cache when web is blank or imports are stale
```

From the Expo developer menu, `w` opens the web version, `a` starts Android, and `i` starts iOS. For a physical phone, use Expo Go and ensure the phone can reach the backend host.

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

Run the pipeline from `backend/data_pipeline`:

PowerShell:

```powershell
cd backend/data_pipeline
python prepare_dataset.py
python train_models.py
```

Or use the included scripts:

```powershell
cd backend/data_pipeline
\.\run_pipeline.bat
```

The pipeline creates `cost_data.csv` and `delay_data.csv`, then trains a cost regressor and delay classifier. The API's current AI route still uses its in-memory synthetic model, so retraining the persisted models does not automatically change `/api/ai/predict-cost`. Treat ML output as an estimate, not a financial commitment, until the model/data contract is unified and evaluated with real project data.

## Integrations and Storage

### Supabase Storage

The frontend site-photo flow uses a `project-images` bucket and stores rows in the active photo table. Confirm the bucket exists and has policies allowing the intended authenticated uploads and reads.

### Cloudinary

The backend endpoint `POST /api/media/upload` accepts multipart form data:

- `file`: image file
- `project_id`: required project ID
- `site_id`: optional site ID
- `caption`: optional caption

Use `/api/media/health` to verify that Cloudinary variables are configured.

### Resend

Email features are optional. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, then verify `/api/notifications/email/health`. Without a key, the custom sender reports that delivery was skipped.

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

Do not use `localhost` in the phone's frontend environment. Set `EXPO_PUBLIC_API_URL` to the development machine's LAN IP, bind Uvicorn to the network interface if needed, and ensure Windows Firewall allows port 8000.

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
