# How to Run ConstructFlow

This project consists of a cross-platform React Native frontend (built with Expo Router for Web, Android, and iOS) and a FastAPI backend (Python) integrated with Supabase.

---

## 1. Prerequisites

- **Node.js**: Node 20+ required (Node 22+ LTS recommended to avoid Supabase engine warnings).
- **npm**: Installed with Node.js.
- **Python**: Python 3.10, 3.11, or 3.12 installed.
- **Supabase**: A Supabase project with database schema applied and API credentials.
- **Expo Go App** *(Optional)*: Installed on your physical Android or iPhone device if testing on mobile.

---

## 2. Environment Configuration

### Frontend (`frontend/.env`)
Create `frontend/.env` (or copy from `frontend/.env.example` if available):
```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
EXPO_PUBLIC_API_URL=http://localhost:8000/api
# Optional: set for hosted backend or tunnel access in Expo Go
EXPO_PUBLIC_NATIVE_API_URL=http://<your-computer-lan-ip>:8000/api
```

### Backend (`backend/.env`)
Create `backend/.env`:
```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_KEY=<your-supabase-anon-or-service-role-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

# Email Delivery Options (Railway Free/Trial/Hobby blocks SMTP ports 587/465)
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=ConstructFlow <onboarding@resend.dev>
BREVO_API_KEY=<optional-brevo-api-key>
BREVO_FROM_EMAIL=<verified-sender@domain.com>
ENABLE_SMTP=false # Set to true only on Railway Pro plan or servers with unblocked SMTP ports

# Optional Media Integrations
CLOUDINARY_CLOUD_NAME=<optional-cloud-name>
CLOUDINARY_API_KEY=<optional-cloudinary-api-key>
CLOUDINARY_API_SECRET=<optional-cloudinary-api-secret>
```

---

### Database Setup (Supabase SQL Editor)
Run the migration scripts located in `frontend/supabase/` in your Supabase SQL Editor:
1. `schema.sql`, `schema_part2.sql`, and `schema_pm.sql` (Core tables, auth profiles, projects, labour, materials, milestones).
2. `phase5_migration.sql` and `02_add_expenses.sql` (Sites, assignments, purchase orders, expenses, salary slips).
3. `real_ml_tables.sql` (**Critical for ML Engine**: `historical_projects`, `material_prices`, `price_indices` tables with indexes and RLS policies).
4. `schema_fixes.sql` (Role constraints and RLS policy hardening).
5. Create a public storage bucket named `project-images` in **Supabase Storage**.

---

## 3. Install and Run Backend (FastAPI)

Open a terminal in the root workspace folder:

### Windows (PowerShell):
```powershell
# 1. Activate or create virtual environment
if (!(Test-Path ".\.venv")) { python -m venv .venv }
& ".\.venv\Scripts\Activate.ps1"

# 2. Install dependencies
cd backend
pip install -r requirements.txt

# 3. Start API server on 0.0.0.0 (allows mobile devices on LAN to connect)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### macOS / Linux (Bash):
```bash
# 1. Activate or create virtual environment
if [ ! -d ".venv" ]; then python3 -m venv .venv; fi
source .venv/bin/activate

# 2. Install dependencies
cd backend
pip install -r requirements.txt

# 3. Start API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify backend health at:
- **API Health**: [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 4. Install and Run Frontend (Expo / React Native)

Open a second terminal in the workspace root:

```bash
cd frontend
npm install
npm run web
```

Or run with the full Expo developer CLI:
```bash
npm start
```
From the interactive Expo terminal menu:
- Press `w` to open the **Web application** in your default browser (`http://localhost:8081`).
- Press `a` to open in an **Android Emulator** (Android Studio).
- Press `i` to open in an **iOS Simulator** (macOS Xcode).
- Scan the printed QR code with **Expo Go** on your physical phone (both phone and PC must be on the same Wi-Fi network).

---

## 5. Helpful Commands & Scripts

```bash
# Frontend commands (run inside frontend/ directory):
npm run web              # Direct Web launch
npm run android          # Direct Android build launch
npm run ios              # Direct iOS build launch
npm start -- --clear     # Clear Metro bundler cache (recommended when updating dependencies or assets)
npm run lint             # Check TypeScript / ESLint

# Machine Learning Training (run inside backend/data_pipeline/):
python prepare_dataset.py
python train_models.py
```

---

## 6. Common Troubleshooting

1. **Frontend opens a blank page on web**:
   Run `npm start -- --clear` inside `frontend/` to reset the Metro bundler cache.
2. **`Network request failed` on mobile / Expo Go**:
   - Ensure the backend is running with `--host 0.0.0.0` (not `127.0.0.1`).
   - Ensure your computer and phone are connected to the exact same Wi-Fi network.
   - Verify that your Windows Firewall allows inbound connections on port `8000`.
   - The app's `lib/apiUrl.ts` automatically resolves your computer's LAN IP from Metro's debugger host.
3. **`package.json not found` error**:
   Ensure you run `cd frontend` before executing `npm install` or `npm start`.
4. **Supabase Auth or Node warning**:
   Use Node 22+ LTS. If tokens expire, refresh the session in the app or log in again.
