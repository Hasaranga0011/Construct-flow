# ConstructFlow - Full Project & Codebase Guide

**ConstructFlow** kiyanne Sri Lankawe construction industry ekata hadapu modern Project Management System ekak. Me system eken project planning, labour attendance, materials (inventory), supplier orders, payroll, client communication, saha AI use karala cost and delay prediction karanna puluwan. 

Oyaage Supervisor ta me project eka present karanakota pahatha points pavichchi karanna. Me details okkoma `README.md` saha `DESIGN.md` eken summarize karala thiyenne.

---

## 1. Technology Stack (Tech Background Eka)

### Frontend (User Interface) - `frontend/` folder
* **Framework & Routing:** React Native 0.81 ekka React 19.1. Cross-platform support (Web, Android, iOS) ganna Expo SDK 54 saha Expo Router 6 pavichchi karala thiyenawa.
* **Styling:** UI eka design kale NativeWind saha Tailwind CSS walin.
* **Backend Connection:** Supabase JS client eken thama Auth, DB queries, Realtime subscriptions, saha Storage handle karanne.
* **Components:** Charts pennanna Recharts, camera/photos walata Expo Camera & Image Picker.

### Backend (Server-side) - `backend/` folder
* **Framework:** Python (3.10+) ekka FastAPI and Uvicorn server eka.
* **Database:** Supabase (PostgreSQL).
* **Machine Learning:** `scikit-learn`, `pandas`, `NumPy` use karala RandomForestRegressor model eken AI Cost & Delay Estimation karanawa. 
* **Background Jobs:** APScheduler pavichchi karala hourly overdue purchase orders, saha daily low-stock check karanawa.
* **Third-party Services:** Cloudinary (photos upload karanna), Resend (emails yawanna), ReportLab (PDF invoices generate karanna).

---

## 2. Codebase Walkthrough (Supervisor ta Code Eka Pennana Hati)

Code eka pennanakota me folders open karala pennanna:

### Frontend Structure (`frontend/src/`)
1. **`app/` Folder:** Meke thama Expo Router pages thiyenne. `admin/`, `pm/`, `site-manager/`, `supplier/`, `client/`, `worker/` kiyala folders 6k thiyenawa. Ewa thama role-based portals.
2. **`components/` Folder:** Reusable UI components. 
   - E.g., `common/TopNav.tsx`, `common/MobileSidebar.tsx`. 
   - `dashboard/ActiveProjectsTable.tsx`, `CostTimelineChart.tsx` wage specialized components meke thiyenawa.
3. **`context/AuthContext.tsx`:** User ge session eka saha role eka (e.g., pm, admin) check karala adala dashboard ekata redirect karanne meken.
4. **`lib/supabase.ts` & `services/api.ts`:** Supabase client setup eka saha backend API ekata Bearer token ekka request yawana logic eka.

### Backend Structure (`backend/`)
1. **`main.py`:** FastAPI app eka start wenne methanin. Me file eke thama okkoma API routes (`/api/projects`, `/api/labour`) register karala thiyenne.
2. **`api/routes/`:** Domain logic eka mehi thiyenawa (e.g., `projects.py`, `materials.py`, `ai.py`).
3. **`data_pipeline/`:** CSV datasets use karala ML models train karana `prepare_dataset.py` saha `train_models.py` files.
4. **`core/security.py`:** JWT validation karanawa, ewagema endpoint access secure karanawa.

### Database (`frontend/supabase/` & `backend/*.sql`)
- SQL schemas walin thama tables hadala thiyenne (e.g., `profiles`, `projects`, `purchase_orders`).
- **RLS (Row Level Security):** Samahara tables wala security testing stage eke thiyenawa. Supabase dashboard eken RLS test karanna one production yanna kalin.

---

## 3. User Roles & Data Isolation (Data Wenwena Hati)

Paddhathiye pradhana roles 6k thiyenawa. Eka role ekaka kenekta thawa kenekge data balanna ba (Data boundaries):

1. **Admin / Super Admin (`/admin`):** Global access thiyenawa. Okkoma projects, users, materials, payroll balanna puluwan.
2. **Project Manager / PM (`/pm`):** Thamanta assign karapu projects witharai balanna puluwan. Material approvals, supplier orders, clients la ekka chat karana eka thama main responsibilities.
3. **Site Manager (`/site-manager`):** Site ekata assign wela inna workers lage QR attendance ganna eka, material requests danna eka, site photos upload karana eka karanawa. (Mobile first design).
4. **Supplier (`/supplier`):** Thamanta ena Purchase Orders balanna, accept/reject karanna, counter-offer danna saha delivered kiyala mark karanna puluwan.
5. **Client (`/client`):** Thaman invest karapu project eke progress eka, photos, documents, invoices balanna puluwan. PM ekka chat karanna puluwan. (Internal details wage workers lage padi details penne na).
6. **Worker (`/worker`):** Thamange QR code eka pennanna, attendance history balanna, salary slips balanna puluwan.

---

## 4. UI/UX Design System (Design Rules & Themes)

`DESIGN.md` eke thiyena vidihata apithama design system ekak pavichchi kale:

### Brand & Mood
- **Brand Colors:** Main action color eka Orange (`#F97316`). Dark elements walata Charcoal/Dark Gray (`#0F1117`). Light background eka `#F8F8F8`.
- **Role Accents (Role ekata adala pata):** Profile screens wala pennanawa -> Admin (Orange), PM (Blue), Site Manager (Emerald), Client (Purple), Supplier (Amber), Worker (Cyan).
- **State Colors:** Success walata `brand-success` (Green), Warning/Pending walata `brand-warning` (Orange), Errors/Rejected walata `brand-danger` (Red).

### Typography & Spacing
- **Font:** `Inter` font family eka pavichchi karanawa.
- **Scale:** H1 (32px), H2 (24px) idan small Labels (12px) wenakan standard scale ekak use wenawa.
- **Spacing:** Base unit eka 4px. Standard dashboard card padding eka 24px (`p-6`).

### Layout & Responsiveness
- **Desktop (1024px+):** Wamata 240px Sidebar eka thiyenawa. Content eka 12-column grid ekakata align wenawa.
- **Mobile (<1024px):** Sidebar eka Overlay Drawer ekak (MobileSidebar) widihata wada karanawa. Tables wenuwata Mobile Cards pennanawa (e.g., ActiveProjectsTable).

### Component Anti-Patterns
- Eka card ekak athule thawa card ekak danne na.
- Error awama thanikara page eka blank karanne nathuwa, Error alert box ekak pennanawa (`bg-red-50 border-red-200`).
- Modal views pavichchi karanne podi forms submit karanna (e.g., New Project, Check-in Worker). Loku data load wenawanam wenama route ekak use karanawa.

---

## 5. Main Features (Vishesha Anga)

* **QR Attendance:** Worker ge phone eken hari Site Manager ge phone eken QR eka scan karala attendance mark karanna puluwan.
* **AI Cost Estimator:** 50,000+ Sri Lankan construction data points walin train karapu RandomForest ML model ekak haraha estimate eka LKR walin denawa (R² accuracy = 0.95 wage).
* **Realtime Sync:** Supabase Realtime nisa messages, notifications page eka refresh karanne nathuwa pennanawa.
* **Cross-platform UI:** React Native web, iOS, Android wala eka wage wada karanawa. Tailwind walin screen size ekata adala UI eka auto hadenawa.
* **Status Badges (Pills):** Purchase orders (Delivered, Pending, Rejected), Attendance (Present, Absent, On Leave) walata adala colors walin badges pennanawa.

Me document eka Supervisor ta present karanakota, me concepts use karala explain karanna. Puluwannam localhost eken backend ekayi frontend ekayi run karala Live pennanna.
