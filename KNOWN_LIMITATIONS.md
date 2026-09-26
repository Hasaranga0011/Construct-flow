# Known Limitations & Deferred Features

This document outlines features, architectural decisions, and edge cases intentionally deferred beyond the Phase 8 completion baseline of ConstructFlow. 

These items do not block the core operations of the system but are documented for future development sprints and production pilot awareness.

## 1. Authentication & Identity
* **Self-Registration Role Enforcement:** While the portal separation correctly groups registration flows (Admin vs Team vs External), the Supabase Auth system natively doesn't strictly prevent a manipulated API request from passing a disallowed role if they hit the raw `POST /auth/v1/signup` endpoint. Backend hooks or strict database triggers are required in the long term to strictly validate `public.profiles.role` insertions against the authenticated user's session context.
* **Supplier Registration Workflow:** The self-service Supplier registration flow creates a `supplier` profile but an Admin must manually verify and link them to projects/purchase orders before they become fully visible and actionable in the system. 

## 2. Platform & Push Notifications
* **WhatsApp Business API:** The system architecture allows for SMS/WhatsApp notifications (e.g. for worker QR updates or critical supplier POs), but only Resend email and in-app Supabase Realtime alerts are fully integrated.
* **Native Push Notifications:** Expo Push Tokens are not currently generated or stored. Realtime updates only occur if the user has the app open (foreground WebSocket connection). 

## 3. Financials & Payments
* **Payment Gateways:** The `client_payment_schedule` supports tracking amounts due and dates, but there is no integrated payment processor (e.g., Stripe, local Sri Lankan bank gateways) to directly settle invoices.
* **Currency Support:** The platform is hard-coded to `LKR` (`Rs.`). Multi-currency tracking is not supported.
* **Tax and Retention:** Advanced accounting principles like tax (VAT/SSCL) application at the line-item level or retention tracking (e.g., withholding 5% of a payment until defect liability period ends) are not currently modeled in the `variation_orders` or `purchase_orders` tables.

## 4. UI/UX Components
* **Photo Attachments:** The Daily Site Report allows attaching photos, and the form anticipates URLs, but the native device Image Picker (`expo-image-picker`) to Cloudinary upload flow is currently mocked with a `window.prompt` on the web interface. 
* **Metro Bundler Pathing:** Because Expo Router relies on the file system, some files nested deep in `/site-manager/reports/...` or `/admin/materials/orders/...` may occasionally experience relative pathing conflicts or require restart when moving files. 

## 5. Offline Capabilities
* **Offline Mode:** Site Managers operating in areas with poor cellular reception cannot currently queue Daily Site Reports or Attendance QR Scans locally. The app requires an active connection to `http://localhost:8000` or the production Supabase endpoint to complete actions.

## 6. Advanced Reporting
* **Admin Master Reporting:** The `/admin/reports` namespace exists but does not export to PDF/Excel or run advanced cross-project analytics. Current reporting relies on the frontend Dashboard aggregation components.
