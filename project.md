# ConstructFlow — Complete Project Overview & Technical Guide

---

## 1. Executive Summary

**ConstructFlow** (presented in the UI as **ConstructAi**) is a comprehensive, cloud-native Construction Enterprise Management Platform engineered specifically for the construction industry in Sri Lanka. It bridges the critical operational disconnect between site managers, corporate executives, subcontractors, material suppliers, site workers, and property clients by unifying all communication, financial tracking, inventory management, workforce attendance, and procurement into a single real-time platform.

### The Problem It Solves
Traditional construction workflows in South Asia—specifically Sri Lanka—suffer from severe operational friction:
1. **Paper-Based & Delayed Attendance**: Daily wage workers are often tracked via handwritten logbooks, leading to time theft, manual calculation errors, and contentious payroll disputes.
2. **Material Price & Supply Volatility**: Frequent fluctuations in material prices and unpredictable delivery schedules cause severe budget overruns and project standstills.
3. **Information Silos**: Clients are left in the dark about progress until unexpected cost variations occur; project managers lack real-time visibility into site-level incidents; and suppliers have no standardized digital purchase-order pipeline.
4. **Currency & Localization Gaps**: Western construction software does not accommodate Sri Lankan Rupee (LKR) transactions, local labour daily-wage conventions (e.g., standard daily wage of Rs. 3,500 plus 1.5x overtime), or local geographic and weather contexts.

### The ConstructFlow Solution
ConstructFlow solves these problems through a **cross-platform application (Web, Android, iOS)** backed by an **asynchronous FastAPI backend**, **Supabase Realtime PostgreSQL**, and **Machine Learning intelligence**. It provides 6 dedicated, role-scoped portals that ensure every participant has exact visibility into the data they need while strictly isolating sensitive administrative and financial records.

---

## 2. System Architecture & High-Level Design

ConstructFlow adopts a hybrid **Client-Server & Direct Realtime** architecture designed for low-latency interactions on site and robust data integrity on the server.

```mermaid
graph TD
    subgraph Client Layer [Cross-Platform Client (React Native / Expo SDK 54)]
        Web[Web Browser (Chrome/Safari/Firefox)]
        Android[Android Device / Expo Go]
        iOS[iOS Device / Expo Go]
    end

    subgraph Gateway [Networking & Discovery]
        APIURL[Dynamic API Resolver (lib/apiUrl.ts)]
    end

    subgraph Backend Layer [FastAPI Microservice (Python 3.10+)]
        FastAPI[FastAPI REST API (Uvicorn 0.0.0.0:8000)]
        AuthGuard[JWT Auth Guard (core/security.py)]
        APScheduler[APScheduler (Background Cron Jobs)]
        MLService[Scikit-Learn ML Cost & Delay Models]
        DocService[ReportLab PDF Generation Engine]
    end

    subgraph Cloud & External Services
        SupabaseAuth[Supabase Auth (JWT & Role Profiles)]
        PostgreSQL[(Supabase PostgreSQL with RLS)]
        RealtimeEngine[Supabase Realtime (WebSockets)]
        SupabaseStorage[Supabase Storage (project-images)]
        Cloudinary[Cloudinary CDN (Site Photos)]
        Resend[Resend API (Transactional Emails)]
    end

    ClientLayer --> APIURL
    APIURL --> FastAPI
    ClientLayer -->|Direct Reads & Realtime Subscriptions| SupabaseAuth
    ClientLayer -->|Realtime WebSockets| RealtimeEngine
    ClientLayer -->|Direct RLS Data Access| PostgreSQL
    FastAPI --> AuthGuard
    AuthGuard -->|Verify JWT| SupabaseAuth
    FastAPI -->|Service Role Client / Mutations| PostgreSQL
    FastAPI --> MLService
    FastAPI --> DocService
    FastAPI --> Cloudinary
    FastAPI --> Resend
    APScheduler -->|Check Overdue POs & Low Stock| FastAPI
```

### Architectural Principles:
1. **Client-Server Split**: 
   - **Direct Read & Realtime Subscriptions**: The frontend queries Supabase directly for standard operational views and subscribes to PostgreSQL change streams via WebSockets for real-time alerts, chats, and purchase order updates.
   - **Server-Side Controlled Mutations**: Critical business workflows (bulk payroll calculations, QR code attendance verification, supplier counter-offers, PDF invoice generation, and AI estimations) are routed through the FastAPI backend to enforce atomicity and security.
2. **Strict Multi-Tenant Role Isolation**: All database tables enforce PostgreSQL Row Level Security (RLS) policies. Project managers only see their assigned projects; site managers only see their assigned sites; suppliers only see their purchase orders; workers only see their attendance and salary slips; and clients only see their own properties.
3. **Universal Network Auto-Discovery**: Mobile devices running on Expo Go dynamically resolve the host machine's LAN IP address from Metro bundler metadata, completely eliminating local network connection failures without requiring third-party tunnels (like ngrok).

---

## 3. Complete Technology Stack & Tools Catalog

### 3.1 Frontend Technologies (Cross-Platform Mobile & Web)

| Technology / Library | Version | Category | Purpose in ConstructFlow |
| :--- | :--- | :--- | :--- |
| **React Native** | `0.81` | Core Framework | Cross-platform runtime targeting Web, Android, and iOS from a single TypeScript codebase. |
| **React** | `19.1` | UI Library | Modern component model, hooks, and Concurrent React rendering engine. |
| **Expo SDK** | `v54` | Application Framework | Managed native runtime providing cross-platform toolchains, native modules, and development client. |
| **Expo Router** | `v6` | Routing & Navigation | File-based, deeply typed routing system supporting role namespacing (`/admin`, `/pm`, `/site-manager`, `/supplier`, `/client`, `/worker`). |
| **TypeScript** | `5.9` | Language | End-to-end static typing for API contracts, database schemas, and component interfaces. |
| **NativeWind** | `v4` | Styling Engine | Utility-first styling framework compiling Tailwind CSS classes to native React Native styles and Web CSS. |
| **Tailwind CSS** | `v3.4` | CSS Design System | Curated brand tokens (`brand-orange`, `brand-dark`, `brand-light`), high-contrast colors, and layout utilities. |
| **React Native Reanimated** | `3.17+` | Animation Engine | 60+ FPS hardware-accelerated animations for card transitions, drawer slides, and status changes. |
| **Expo Video / HTML5 Video** | Built-in | Media Player | Powering the interactive, scroll-scrubbed 3D construction site orbit background on the public landing page. |
| **Expo Camera** | Latest | Hardware / Vision | Site manager worker check-in via real-time optical QR code scanning. |
| **react-native-qrcode-svg** | Latest | Vector Graphics | Dynamic QR code generation for worker badges containing encrypted identity payloads. |
| **Expo ImagePicker** | Latest | Hardware / Media | Capture or select high-resolution construction progress photos directly from mobile devices. |
| **Expo Location** | Latest | Hardware / GPS | Captures geographic coordinates for project locations and verifies site manager check-in boundaries. |
| **Expo Notifications & Sharing**| Latest | System Integration | Local push notifications and native OS file-sharing for downloaded PDF reports and invoices. |
| **Recharts / React Native SVG** | Latest | Data Visualization | Renders cost timeline bars, budget burn-down rings, delay risk meters, and labour allocation charts. |
| **@supabase/supabase-js** | `v2.49+` | SDK | Client-side database querying, session authentication, and WebSocket Realtime subscriptions. |

### 3.2 Backend Technologies (Microservice & APIs)

| Technology / Library | Category | Purpose in ConstructFlow |
| :--- | :--- | :--- |
| **Python** (`3.10+`) | Core Runtime | High-performance, statically typed backend runtime for APIs, scheduler, and ML models. |
| **FastAPI** | REST API Framework | High-performance asynchronous Web framework providing automatic OpenAPI (Swagger) generation and dependency injection. |
| **Uvicorn** | ASGI Web Server | Lightning-fast asynchronous server implementation running on `0.0.0.0:8000` to support LAN connectivity. |
| **Pydantic & Pydantic-Settings** | Data Validation | Strongly typed request/response payload validation and environment configuration parsing. |
| **APScheduler** | Job Automation | In-process background scheduler running periodic jobs: hourly overdue purchase order audits and daily low-stock checks with database execution logging. |
| **ReportLab** | Document Generation | Programmatic PDF generator producing formatted client milestone invoices, financial cost reports, and worker salary slips. |
| **HTTPX & Python-Multipart** | Networking & Files | Asynchronous HTTP client for external integrations and multipart form-data handling for media uploads. |
| **Supabase Python Client** | Database Access | Official Python wrapper interacting with Supabase PostgreSQL via anonymous client and privileged Service Role client. |

### 3.3 Database, Auth & Managed Cloud Services

| Service / Tool | Purpose in ConstructFlow |
| :--- | :--- |
| **Supabase PostgreSQL** | Primary relational database housing 25+ relational tables, check constraints, foreign keys, and indexes. |
| **Row Level Security (RLS)** | Database-level access control ensuring tenants and roles can strictly only read and write authorized rows. |
| **Supabase Auth** | Manages user accounts, secure hashed passwords, password recovery flows, and cryptographic JWT tokens. |
| **Supabase Realtime** | WebSocket change-data-capture engine broadcasting row inserts/updates (messages, notifications, PO status) in <100ms. |
| **Supabase Storage** | Object storage bucket (`project-images`) for storing uploaded site progress media with public/private URLs. |
| **Cloudinary** | Cloud media storage and image optimization API for site reports, milestone photos, and thumbnail generation. |
| **Resend & Brevo** | Enterprise transactional HTTPS email APIs. Railway Free/Trial/Hobby plans block outbound SMTP ports (587/465); ConstructFlow uses HTTPS REST endpoints with strict zero-password logging. |

### 3.4 Machine Learning & Intelligence Stack

| Technology | Category | Purpose in ConstructFlow |
| :--- | :--- | :--- |
| **Scikit-Learn** | ML Framework | Trains and serves log-scale cost-per-square-foot regressors (`RandomForestRegressor` and Gradient Boosting). |
| **Hybrid BOQ Engine** | Cost Estimator | Calculates physical material quantities (cement, steel, sand, aggregate) and worker-days at Rs. 3,500/day + 15% overhead, corrected by the ML model. |
| **Uncertainty Estimator** | Prediction Range | Produces conformal/uncertainty prediction envelopes (±15–20%, e.g. "LKR 14.5M to LKR 18.2M") for early-stage planning. |
| **Real Evaluation Gate** | Quality Metric | Computes **MAPE** and **MAE** strictly on verified completed projects. Never shows synthetic R² as accuracy; shows "Not enough real data yet (based on N real projects)" when N < 5. |
| **Deterministic Risk Engine** | Delay Scoring | 100% rule-based delay risk computation derived from live overdue milestones, delayed purchase orders, and worker attendance ratios. |
| **NumPy & Pandas** | Data Processing | Data manipulation, feature engineering, CIDA price indices blending, and BOQ imports. |
| **Continuous Learning Loop** | Active Learning | Automatically captures completed project outcomes into `historical_projects` and supplier-confirmed order unit prices into `material_prices`. |

---

## 4. Multi-Role Portal System & User Journeys

ConstructFlow provides 6 tailored, role-specific portals accessible from standardized URL namespaces:

```text
/                      -> Public Cinematic Landing Page & Inquiry Portal
├── /admin             -> Super Admin Platform Governance
├── /pm                -> Project Manager Operational Workspace
├── /site-manager      -> Site Manager Field Operations
├── /supplier          -> Supplier Order Fulfillment Center
├── /client            -> Client Project Transparency Portal
└── /worker            -> Worker Digital Badge & Attendance
```

### 4.1 🛡️ Super Admin Portal (`/admin`)
- **Global Dashboard**: Complete portfolio metrics across all ongoing projects in Sri Lanka, active workforce counts, real-time expenditure versus total budget, and system-wide inventory levels.
- **Project Management**: Create, edit, and archive construction projects with budget limits, client assignments, assigned project managers, and GPS map coordinates.
- **User Directory**: Centralized user governance to invite, activate, role-assign, and manage Admins, PMs, Site Managers, Suppliers, Workers, and Clients.
- **Materials & Supply Chain**: Global materials master catalog, site-level inventory oversight, and purchase order tracking.
- **Workforce & Payroll**: Platform-wide attendance logs, wage approvals, and bulk payroll issuance.
- **AI Insights & ML Center**: Strategic delay risk forecasting and cost anomaly detection across active construction sites.

### 4.2 👷 Project Manager Portal (`/pm`)
- **Assigned Projects Scope**: Filtered exclusively to projects assigned to the authenticated Project Manager.
- **Procurement & Purchase Orders**: Create official purchase orders to registered suppliers with custom delivery dates and negotiated item rates.
- **Material Approvals**: Review and approve material requests submitted from field site managers before purchase orders are dispatched.
- **Team & Subcontractor Coordination**: View assigned site managers, assigned site workers, and subcontractor status.
- **AI Cost Estimator**: Interactive tool allowing PMs to estimate total project cost (in LKR) based on project type (Residential, Commercial, Industrial, Infrastructure), location, quality grade, and duration.
- **Financial Tracking**: Real-time comparison of planned budget versus actual costs and variation orders.

### 4.3 🏗️ Site Manager Portal (`/site-manager`)
- **Mobile-Optimized Field Interface**: Tailored for tablets and smartphones used on physical, dust-heavy construction sites.
- **Touchless QR Attendance**: Scan worker QR codes via the device camera in seconds; logs timestamp, site location, hours worked, and overtime status.
- **Site Material Requests**: Quickly request stock (cement bags, rebar steel, sand, aggregate) directly to the site when threshold levels drop.
- **Daily Site Reports**: Create rich daily logs detailing weather conditions, workers on site, completed work packages, and delayed tasks.
- **Site Photos & Issues**: Upload geo-tagged photos and log safety or quality incidents with urgency levels (`Low`, `Medium`, `High`, `Critical`).

### 4.4 🚚 Supplier Portal (`/supplier`)
- **Purchase Order Inbox**: Live stream of orders dispatched by Project Managers and Admins.
- **Order Lifecycle Actions**:
  - `Confirm`: Accept order and commit to delivery date.
  - `Reject`: Decline order with reason note.
  - `Suggest Counter-Offer`: Propose alternative delivery dates or unit pricing.
  - `Mark Delivered`: Notify site and PM that goods have arrived at the construction site gate.
- **Order History & Delivery Analytics**: Complete audit trail of fulfilled, pending, and cancelled material deliveries.

### 4.5 👤 Client Transparency Portal (`/client`)
- **Client-Friendly Dashboard**: High-level visual overview designed for property owners and corporate clients without confusing construction jargon.
- **Milestone Progress**: Track phase completion percentages (e.g., Foundation 100%, Structural Framework 75%, Roofing 20%) with photo evidence.
- **Media Gallery**: High-definition site progress photos uploaded by site managers.
- **Invoices & Financials**: Download official PDF invoices, review paid deposits, upcoming milestone payment schedules, and approved variation orders.
- **Direct PM Messaging**: Real-time encrypted messaging channel connecting the client directly with their assigned Project Manager.

### 4.6 🦺 Worker Experience (`/worker`)
- **Digital Identity Badge**: Displays the worker's unique encrypted QR code for quick daily check-in at site gates.
- **Attendance Records**: Personal history showing daily check-in/out timestamps, recorded hours, and overtime tallies.
- **Salary Slips**: View transparent breakdowns of earned daily wages (calculated at Rs. 3,500/day standard rate + 1.5x overtime multiplier) and payment status.

---

## 5. Database Schema & Data Models

ConstructFlow operates on a relational PostgreSQL schema in Supabase with over 25 core tables:

```text
├── Authentication & Identity
│   ├── auth.users                     # Supabase core credentials
│   └── public.profiles                # User metadata, full name, phone, role enum, QR code string
│
├── Projects & Governance
│   ├── public.projects                # Project name, client_id, pm_id, budget, spent_cost, dates, coordinates
│   ├── public.pm_projects             # Project Manager assignments
│   ├── public.site_manager_sites      # Site Manager site assignments
│   └── public.site_workers            # Worker-to-site assignments
│
├── Procurement & Inventory
│   ├── public.materials               # Master inventory catalog with unit prices
│   ├── public.site_materials          # Real-time stock counts at specific sites
│   ├── public.material_requests       # Field requests pending PM approval
│   └── public.purchase_orders         # Supplier orders with statuses (Pending, Confirmed, Delivered, Received)
│
├── Workforce & Payroll
│   ├── public.attendance              # Daily check-in/out times, hours, overtime, and QR scan data
│   ├── public.salary_slips            # Auto-generated monthly/weekly worker payroll slips
│   └── public.project_expenses        # Categorized cost logs (labour, equipment, permits)
│
├── Progress, Field Media & Issues
│   ├── public.milestones              # Milestone phases with percentage completion
│   ├── public.milestone_media         # Media files attached to milestones
│   ├── public.site_reports            # Daily site logs submitted by site managers
│   ├── public.site_issues             # Safety/operational incident tracking
│   └── public.project_images          # Site progress photos
│
└── Communication & Automation
    ├── public.notifications           # User-targeted and role broadcast alerts
    ├── public.client_messages         # Real-time chat messages between Clients and PMs
    ├── public.public_inquiries        # Leads submitted from the public landing page
    └── public.job_runs                # Observability audit log for APScheduler background tasks
```

---

## 6. Machine Learning & Predictive Analytics Engine

ConstructFlow incorporates built-in artificial intelligence to transform historical construction logs into predictive insights:

### Cost Prediction Engine (`RandomForestRegressor`)
- **Inputs**:
  - `project_type`: Residential, Commercial, Industrial, Infrastructure, Renovation.
  - `location`: Sri Lankan provinces (Western, Central, Southern, Northern, Eastern, North Western, North Central, Uva, Sabaragamuwa).
  - `square_footage`: Total floor area in square feet.
  - `quality_tier`: Standard, Premium, Luxury.
  - `duration_months`: Planned project timeline.
- **Output**: Projected cost in **LKR** alongside a statistical confidence interval.

### Delay Risk Forecast Engine
- **Inputs**: Number of assigned workers, material stock availability, supplier delivery lead times, and weather/monsoon season risk factors.
- **Output**: Delay probability percentage (`Low`, `Medium`, `High`) and suggested mitigation recommendations (e.g., "Reorder rebar 5 days earlier due to supplier backlog").

---

## 7. Key Architectural Innovations & Engineering Highlights

### 1. Scroll-Scrubbed 3D Video Background
The public homepage features a custom 3D orbit construction animation (`homepage_scroll.mp4`). On web browsers, the video frame scrub position is tightly synchronized with user scroll gestures via an interpolated `requestAnimationFrame` lerping loop (linear interpolation), delivering a smooth, high-end interactive visual experience. On native mobile devices, it seamlessly adapts to smooth looped hardware playback.

### 2. Zero-Config LAN API Discovery (`lib/apiUrl.ts`)
To eliminate the classic developer friction where physical mobile devices running on Expo Go fail to connect to `http://localhost:8000`, ConstructFlow automatically parses the Metro bundler debugger URI (`Constants.expoConfig?.hostUri`) at runtime. It extracts the computer's actual Wi-Fi LAN IP address (e.g., `192.168.1.15`) and directs all mobile HTTP requests to `http://<LAN_IP>:8000/api` without needing environment variable tweaks or tunneling services.

### 3. NativeWind v4 Stability & CSS-Interop Optimization
ConstructFlow enforces strict component styling rules to prevent React Native 0.81 / React 19 fiber serialization errors. Interactive controls (such as `Select.tsx`) avoid conditionally toggling dynamic Tailwind utility classes that rely on CSS variables (e.g., `ring-2 ring-orange-100`), utilizing explicit inline style overrides (`style={open ? { borderColor: '#F97316', borderWidth: 1.5 } : undefined}`) to ensure rock-solid navigation and modal rendering.

### 4. Resilient Multi-Role Notification Engine
The notification system supports personal user alerts, role-targeted broadcasts (e.g., all `pm` users), and global platform announcements. The "Mark all as read" API (`PATCH /api/notifications/mark-read`) utilizes Supabase Service Role client privileges on the backend to cleanly bypass RLS barriers across broadcast records, paired with an instantaneous client-side optimistic update fallback.

---

## 8. Summary & Target Audience Pitch

| Stakeholder | What ConstructFlow Delivers |
| :--- | :--- |
| **Construction Companies & Contractors** | Total operational transparency, zero attendance leakage, automated material procurement, and unified payroll. |
| **Project Managers & Engineers** | Single pane of glass for budgets, orders, site progress, AI cost forecasting, and team coordination. |
| **Site Supervisors & Foremen** | Touch-friendly mobile interface for 3-second QR worker check-ins, instant material requisitions, and photo logs. |
| **Suppliers & Vendors** | Standardized digital order pipeline with one-tap order confirmation, delivery marking, and counter-offers. |
| **Clients & Property Owners** | Complete peace of mind through real-time milestone visual tracking, direct PM chat, and verified PDF invoices. |
| **Site Workers** | Fair, transparent wage tracking with personal digital QR badges and verifiable salary slips. |

---
*ConstructFlow is built with modern web and mobile standards, engineered for scale, and designed to elevate the construction industry in Sri Lanka into the digital era.*
