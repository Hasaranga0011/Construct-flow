# ConstructFlow Design System

This document defines the current UI/UX language for ConstructFlow, a construction project management system for Sri Lankan construction teams. It is based on the implementation in `frontend/tailwind.config.js`, `frontend/src/global.css`, `frontend/src/constants/theme.ts`, `frontend/src/components/`, role layouts in `frontend/src/app/`, and representative dashboard, form, table, modal, chart, and portal screens.

The codebase contains two visual generations:

- **Current application language:** the orange, white, charcoal, rounded-dashboard system used by `TopNav`, `MobileSidebar`, `StatCard`, dashboard panels, tables, forms, modals, and role portals.
- **Transitional/starter language:** Expo starter components such as `ThemedText`, `ThemedView`, `AppTabs`, `app-tabs.web`, and the `Colors` object. These remain in the repository but are not the preferred language for new ConstructFlow screens.

When a current screen conflicts with this document, preserve the established local pattern only while repairing that screen. New work should follow the current application language and the rules below.

## 1. Brand & Mood

### Identity

ConstructFlow presents itself in the UI as **ConstructAi** in the current logo treatments. The product is an operations workspace, not a marketing site: it should help a team make decisions quickly about projects, labour, materials, suppliers, clients, and cost risk.

### Tone

- Professional and operational.
- Trustworthy with clear financial and status communication.
- Practical and construction-industry grounded.
- Calm under pressure; warnings should be visible without making every screen feel alarming.
- Modern enough to support AI and realtime features, but not futuristic or abstract.
- Respectful of Sri Lankan work patterns, terminology, LKR currency, local phone numbers, and site connectivity constraints.

### Target users

The UI serves `admin`, `super_admin`, `pm`, `site_manager`, `supplier`, `client`, and `worker` users. Their information needs differ:

- Admins need dense operational summaries and fast management actions.
- PMs need project, labour, approval, budget, and risk context.
- Site managers need touch-friendly attendance, materials, photos, and issue workflows.
- Suppliers need order clarity, dates, status, and counter-offer actions.
- Clients need progress, documents, invoices, media, and communication with minimal operational noise.
- Workers need an extremely simple mobile experience for QR, attendance, profile, and payroll.

### Visual direction

Use a light, high-contrast workspace with orange as the action and construction signal, charcoal for brand depth, white surfaces for content, and restrained status colors. The existing landing page uses a darker amber construction-presentation mood; authenticated portals use the quieter dashboard language.

## 2. Color System

### Exact Tailwind brand tokens

These values are defined in `frontend/tailwind.config.js`:

| Token | Hex | Meaning | Use |
| --- | --- | --- | --- |
| `brand-dark` | `#0F1117` | Primary dark brand | Dark shell, chart actual bars, high-emphasis dark surfaces |
| `brand-light` | `#F8F8F8` | Application light canvas | Portal page backgrounds and light shell surfaces |
| `brand-orange` | `#F97316` | Primary action/brand | Primary buttons, active tabs, progress, unread indicators, AI accents |
| `brand-text` | `#1A1A1A` | Main text | Headings, important values, primary labels |
| `brand-text-muted` | `#6B7280` | Secondary text | Descriptions, captions, helper text, metadata |
| `brand-success` | `#22C55E` | Positive/completed | Present, paid, delivered, approved, healthy states |
| `brand-warning` | `#F97316` | Warning | Low stock, pending, risk, expected action; currently shares orange with primary |
| `brand-danger` | `#EF4444` | Destructive/error | Errors, rejected, out of stock, critical risk |

### Supporting colors observed in screens

These are used frequently through Tailwind gray and utility colors. They are not custom brand tokens, but are part of the current visual vocabulary:

| Purpose | Current values/patterns |
| --- | --- |
| White surface | `#FFFFFF`, `bg-white` |
| Subtle canvas | `bg-gray-50`, `#F8F8F8`, `#F8F9FB` in `SettingsScreen` |
| Borders | `border-gray-100`, `border-gray-200`, `border-gray-300` |
| Muted icon | `#6B7280`, `#9CA3AF`, `#D1D5DB` |
| Blue informational | `#3B82F6`, `bg-blue-50`, `text-blue-600` |
| Purple role accent | `#8B5CF6`, `bg-purple-50` |
| Teal/site-manager accent | `#10B981`, `bg-emerald-50` |
| Amber/supplier accent | `#F59E0B`, `bg-yellow-50` |
| Green status surface | `#DCFCE7`, `bg-green-50` |
| Red status surface | `#FEE2E2`, `bg-red-50` |
| Modal scrim | `bg-black/50` or `bg-black/30` |

### Role accents

`ProfileScreen` assigns role colors that should remain consistent in profile identity surfaces:

- Admin: orange `#F97316` on `#FFF7ED`.
- PM: blue `#3B82F6` on `#EFF6FF`.
- Site manager: emerald `#10B981` on `#ECFDF5`.
- Client: purple `#8B5CF6` on `#F5F3FF`.
- Supplier: amber `#F59E0B` on `#FFFBEB`.
- Worker: cyan `#06B6D4` on `#ECFEFF`.

### Dark mode

Tailwind uses `darkMode: 'class'`. Portal layouts currently use:

- Dark outer canvas: `dark:bg-[#0F172A]`.
- Dark sidebar: `#0B0F19` with `border-gray-900`.
- Dark selected navigation: `bg-gray-800`.
- Dark content panels in ML Insights: `#1E293B` with `border-gray-800`.
- Dark settings page: background `#0F172A`, card `#1E293B`, border `#334155`, primary text `white`, secondary text `#94A3B8`.
- Starter theme values in `constants/theme.ts`: background `#000000`, element `#212225`, selected `#2E3135`, secondary text `#B0B4BA`.

New dark-mode screens should use the portal values above, not introduce a separate black/blue palette. Text and icons must remain readable against `#0F172A` and `#1E293B`.

### State colors

- **Default:** white surface, `border-gray-200`, `text-brand-text`, `bg-brand-orange` for primary actions.
- **Hover web:** `hover:bg-gray-50`, `hover:bg-gray-200`, or orange darkening such as `hover:bg-orange-600`; use a visible but restrained change.
- **Pressed native/web:** reduce opacity or use the existing darker background; `AnimatedCard` and `MobileSidebar` already provide motion.
- **Active:** orange border or orange-tinted background, for example `border-brand-orange`, `bg-orange-50`, `bg-brand-orange bg-opacity-10`.
- **Disabled:** gray/low-opacity treatment, typically `opacity-60`, `opacity-70`, or `bg-gray-400`; retain readable text and never make a disabled action look like an active primary action.
- **Focus:** `focus:border-brand-orange focus:bg-white` on text fields; web-only custom inputs should also remove the default outline only when an equivalent visible border/focus treatment remains.
- **Error:** `bg-red-50 border-red-200 text-red-600` for inline form errors; `brand-danger` for icons, destructive statuses, and critical risk.
- **Success:** `bg-green-50 border-green-200 text-green-700` for messages; `brand-success` for completed and positive values.

## 3. Typography

### Font families in use

- Tailwind declares `fontFamily.inter: ['Inter', 'sans-serif']`.
- `global.css` defines `--font-display: Inter, Spline Sans, ui-sans-serif, system-ui, sans-serif, ...`.
- Web theme typography uses `var(--font-display)` through `Fonts.sans`.
- Monospace values use `--font-mono`, which resolves to the standard UI monospace stack.
- Native fallback typography is platform system UI through `constants/theme.ts`.

Use Inter where the runtime loads it. Do not add a second display font to an authenticated portal.

### Type scale

The current code uses Tailwind utilities and a few explicit styles. This is the normalized scale to use for new work:

| Level | Size | Line height | Weight | Typical use |
| --- | ---: | ---: | ---: | --- |
| Display | 48px | 52px | 600-800 | Marketing/hero only; starter `ThemedText type="title"` is 48/52 |
| H1 | 32px | 40px | 700-800 | Major portal page title, e.g. ML Insights or auth heading on wide screens |
| H2 | 24px | 32px | 700 | Dashboard section or page heading |
| H3 | 20px | 28px | 700 | Card title, modal title, key panel heading |
| H4 | 18px | 24px | 700 | Compact panel title and list group heading |
| Body large | 18px | 28px | 400-500 | Important explanatory text or client-facing detail |
| Body | 16px | 24px | 400-500 | Standard content; matches starter `ThemedText default` at 16/24 |
| Body small | 14px | 20px | 400-600 | Table content, controls, supporting copy; matches `ThemedText small` |
| Caption | 12px | 16px | 400-600 | Dates, helper text, chart labels, metadata |
| Label | 10-12px | 14-16px | 600-700 | Uppercase table headers, status labels, field labels |

### Weight rules

- 800/900: brand wordmark and rare hero emphasis only.
- 700/800: page headings, card titles, financial values, project names, action labels that need priority.
- 600: labels, nav items, buttons, metadata that needs emphasis.
- 500: normal body text and standard controls.
- 400: descriptions, helper text, and secondary copy.

### Line height and letter spacing

- Prefer Tailwind defaults plus `leading-relaxed` for paragraphs and chat content.
- Use tight line height only for large numeric values or compact labels.
- Use `tracking-wider`/uppercase sparingly for status and table labels, as already used in project details and issue panels.
- Do not use negative letter spacing. The existing wordmark uses a small positive `0.3-0.5` letter spacing.

## 4. Spacing & Grid

### Base unit

The canonical base unit is **4px**, with the common rhythm expressed in 8px and 16px increments. `frontend/src/constants/theme.ts` defines:

- `half: 2px`
- `one: 4px`
- `two: 8px`
- `three: 16px`
- `four: 24px`
- `five: 32px`
- `six: 64px`

Tailwind classes in current screens use the same rhythm: `p-4`, `p-5`, `p-6`, `p-8`, `mb-4`, `mb-6`, `gap-4`, `gap-6`, and `gap-8`.

### Spacing scale

Use the existing scale rather than arbitrary values:

- 4px: icon/text micro gap, border-adjacent spacing.
- 8px: compact control padding, badge padding, row gaps.
- 12px: compact row padding and touch control padding.
- 16px: standard component gap, modal content, list row padding.
- 20px: card padding for compact stat cards.
- 24px: standard dashboard card padding, page gutters on desktop, section gap.
- 32px: spacious page padding, auth form padding, large panel padding.
- 48px: large empty states and hero/supporting space.
- 64px: major page/hero separation and starter theme `Spacing.six`.

### Web containers

- `MaxContentWidth` in the starter theme is `800px`.
- Existing dashboard screens frequently use `max-w-4xl`, `max-w-3xl`, `max-w-2xl`, `max-w-xl`, `max-w-lg`, and `max-w-md` for focused content.
- Use `max-w-6xl` only for broad marketing/footer content already present in `home.tsx`.
- Dashboard content normally uses `p-6` or `p-8`; tables and forms use a constrained `max-w` wrapper.
- Keep page content inside the main area beside the 240px desktop sidebar; do not make a new full-width shell inside a role portal.

### Dashboard grid

Desktop dashboard compositions use a 12-column mental model expressed with flex ratios:

- Stat row: four equal columns, `flex: 1`, with 16px gaps.
- Main dashboard row: chart/content `flex-[2]`, risk/alerts `flex-[1]`, with 24px gap.
- Bottom row: table/content `flex-[2]`, side panel `flex-[1]`, with 24px gap.
- Admin/client/material screens use `flex: 2` main content and `flex: 1` side panels.
- On mobile, rows become column stacks; stat cards become two columns around 48% width where the screen supports it.

### Mobile safe areas and padding

- Root uses `SafeAreaProvider`.
- Worker attendance uses `SafeAreaView` with `edges={['top']}`.
- Mobile portal content commonly uses `p-4`, `p-6`, or `p-8` depending on density. Prefer 16px horizontal padding for dense mobile lists and 24px for comfortable pages.
- The mobile sidebar overlays content and has a black 50% scrim.
- Do not place essential controls behind the sidebar, status bar, keyboard, or bottom tab inset.
- `BottomTabInset` is 50px for iOS and 80px for Android in the starter theme; use it when a bottom navigation surface is introduced.

## 5. Component Library

All paths below are relative to `frontend/src/components/`. Props are the public props observed in the current source. Components with no listed props currently have no external props.

### Common

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `Sidebar` | `common/Sidebar.tsx` | `navItems: NavItem[]`, `basePath?: string` | Desktop role navigation; 240px wide, light/dark, active item, notification badge, profile/logout footer. Use with role `_layout.tsx`; do not place arbitrary business content in it. |
| `MobileSidebar` | `common/MobileSidebar.tsx` | `navItems: NavItem[]`, `basePath?: string`; `NavItem` has `label`, `href`, `IconFamily`, `iconName`, optional `badge` | Mobile overlay navigation and desktop-compatible fallback. Uses 300ms slide/fade, scrim, `TouchableOpacity`, role-aware dark/light surface. Keep navigation items short and icon-led. |
| `TopNav` | `common/TopNav.tsx` | `title?`, `showAction?`, `actionLabel?`, `onActionPress?` | Standard portal header. Includes mobile menu trigger, notification bell/count, optional orange gradient action button, light/dark border. Do not duplicate another page header above it. |
| `StatCard` | `common/StatCard.tsx` | `label`, `value`, `indicatorText?`, `indicatorType?: 'success'|'warning'|'danger'|'neutral'`, `icon?`, `fullWidth?` | White rounded-lg card, uppercase muted label, 3xl value, indicator color. Mobile is 48% width unless `fullWidth`; desktop is flex-based. Use for a small number of comparable metrics. |
| `AnimatedCard` | `common/AnimatedCard.tsx` | `children`, `delay?`, `style?`, `className?`, `direction?: 'up'|'down'|'left'|'right'`, `duration?` | Reanimated opacity plus spring translation; default direction up, delay 0, timing duration 500ms. Use for page-load dashboard reveals, not every list row. |
| `NotificationPanel` | `common/NotificationPanel.tsx` | `visible: boolean`, `onClose: () => void` | Fade modal with Inbox/Settings tabs, realtime notification list, read/unread treatment, push `Switch`. Use from `TopNav`; do not create a second notification drawer. |
| `ToastProvider` | `common/ToastProvider.tsx` | none; web implementation is in `ToastProvider.web.tsx` | Provider shell is currently a native no-op; feature code also uses the toast helper and local animated toasts. Keep toast behavior platform-aware. |

### Dashboard

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `ActiveProjectsTable` | `dashboard/ActiveProjectsTable.tsx` | `refreshTrigger?`, `searchQuery?`, `pmId?` | Project table on web, project cards on mobile; status badge, progress bar, Manage action, edit modal. Use for active projects, not arbitrary entities. |
| `CostTimelineChart` | `dashboard/CostTimelineChart.tsx` | none | White rounded-lg chart panel with actual charcoal bars, optional orange budget/forecast bars, grid lines and Budget Plan toggle. Current implementation is custom View bars; do not claim it is a Recharts chart unless replaced. |
| `DelayRiskPanel` | `dashboard/DelayRiskPanel.tsx` | `pmId?` (currently not used to filter request) | Risk rows with percentage, progress bar, semantic message, and danger/warning/success colors. Empty state is text-only. |
| `EditProjectModal` | `dashboard/EditProjectModal.tsx` | `visible`, `project`, `onClose`, `onSuccess` | Form modal for project edits. Keep error area at top, close button in header, and success refresh callback. |
| `NewProjectModal` | `dashboard/NewProjectModal.tsx` | `visible`, `onClose`, `onSuccess` | Large form modal with project fields, date fields, optional map/marker, client, budget, and milestones. On web it may use native `input type="date"`; maintain equivalent native input behavior. |
| `RecentAlertsPanel` | `dashboard/RecentAlertsPanel.tsx` | `pmId?` | White alert panel with colored marker, relative time, unread count, realtime insert behavior, and View all action. |

### Client

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `ClientAccountsPanel` | `client/ClientAccountsPanel.tsx` | `refreshTrigger?`, `searchQuery?` | Client list rows, avatar initials, access badge, details action, edit/delete modal. Keep account management separate from client-facing project content. |
| `ClientApprovalCard` | `client/ClientApprovalCard.tsx` | none | Action-required variation-order card with pending badge, cost row, Reject/Approve pair. Approval uses neutral outline plus success primary, not orange primary. |
| `ClientBudgetRing` | `client/ClientBudgetRing.tsx` | `spent: number`, `total: number` | 96px ring with orange used segment and centered percentage. Guard `total === 0` before reuse; current implementation assumes a positive total. |
| `ClientBudgetTracker` | `client/ClientBudgetTracker.tsx` | none | Budget segmented bar for spent, remaining, contingency. Treat as a presentation component until its values are supplied by the client dashboard query. |
| `ClientDocumentList` | `client/ClientDocumentList.tsx` | none | Client-scoped `shared_documents` list with loading, empty, error, status, category, date, and Realtime refresh states. |
| `ClientIssueForm` | `client/ClientIssueForm.tsx` | none | Client-scoped issue creation/history surface using the assigned projects and `issues` table, with validation, submission feedback, empty state, and Realtime refresh. |
| `ClientMediaGallery` | `client/ClientMediaGallery.tsx` | none | Client-scoped Supabase photo gallery with category filters, captions, dates, loading, empty, and error states. The active media route provides the same project-scoped query pattern. |
| `ClientPaymentSchedule` | `client/ClientPaymentSchedule.tsx` | none | Upcoming Payments presentation component. Payment values and mutation flows require a production financial contract before use. |
| `ClientProgressPhotoGallery` | Removed | none | The unused mock-only component was removed. Use the live client media route and `ClientMediaGallery` instead. |
| `ClientVariationOrders` | `client/ClientVariationOrders.tsx` | none | Variation-order presentation component. Approve/reject actions require a validated variation-order table and API contract before production use. |
| `ClientWeatherAlert` | `client/ClientWeatherAlert.tsx` | none | Blue informational weather-impact alert with rain icon, title, and delay explanation. Use for actionable site/weather context, not generic announcements. |
| `ClientWorkerCount` | `client/ClientWorkerCount.tsx` | `count?: number` | Worker metric with current-on-site label and avatar stack. Always pass a query-derived count; do not rely on a presentation default. |
| `InviteClientModal` | `client/InviteClientModal.tsx` | `visible`, `onClose`, `onSuccess` | Large rounded modal with email/name/company/access/project fields, inline error, loading state, and scrollable content capped at 70vh. |
| `RecentClientActivity` | `client/RecentClientActivity.tsx` | none | Realtime `client_activity` panel with action icon mapping, project name, relative time, loading, and empty states. |
| `SharedDocuments` | `client/SharedDocuments.tsx` | none | Realtime `shared_documents` panel with file count, filename/project/time rows, loading, and no-document states. |

### Labour

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `AttendanceTable` | `labour/AttendanceTable.tsx` | `refreshTrigger?`, `searchQuery?`, `pmId?` | Attendance table/list filtered by project manager; use Present/Absent/On Leave semantics. |
| `CheckInWorkerModal` | `labour/CheckInWorkerModal.tsx` | `visible`, `onClose`, `onSuccess` | Modal with worker/project pill selectors, status selector, hours/overtime fields, loading and inline error. |
| `LabourDistributionChart` | `labour/LabourDistributionChart.tsx` | `refreshTrigger?`, `pmId?` | Custom orange vertical bars with project labels/counts; empty state `No projects.`. |
| `PayrollSummary` | `labour/PayrollSummary.tsx` | `refreshTrigger?`, `pmId?` | Payroll rows, total pending, orange Approve Payroll action, no-worker state. Use LKR/Rs and do not hide calculation assumptions. |

### Materials

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `InventoryTable` | `materials/InventoryTable.tsx` | screen usage passes `refreshTrigger?`, `searchQuery?`; row contract includes `material`, `project`, `quantity`, `unit`, `stockLevel`, `status`, and `time` | Web table and mobile cards; stock bar colors: danger under 30, warning under 60, dark/healthy at or above 60. |
| `LowStockAlerts` | `materials/LowStockAlerts.tsx` | `refreshTrigger?` | Orange warning heading, material/project rows, remaining quantity, empty/loading states. |
| `NewMaterialModal` | `materials/NewMaterialModal.tsx` | `visible`, `onClose`, `onSuccess` | Purchase-order creation modal with supplier/material selectors, custom text fallback, inline error and scrollable body. |
| `PendingOrders` | `materials/PendingOrders.tsx` | `refreshTrigger?`, `onRefreshNeeded` | Pending-delivery list with expected date and orange Deliver action. |
| `RecentDeliveries` | `materials/RecentDeliveries.tsx` | `refreshTrigger?` | Delivered-order list with project and relative/date information. |

### Notifications

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `NotificationCard` | `notifications/NotificationCard.tsx` | title/subtitle/action label/icon family/icon name/icon color/read state per local declaration | Desktop row with 40px icon circle, unread orange left border/dot, content, and outline action. Keep unread state visible without relying on color alone. |

### Supplier

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `SupplierAlertsPanel` | `supplier/SupplierAlertsPanel.tsx` | `refreshTrigger?` | Red-tinted late-delivery panel with count badge and order/date rows. |
| `SupplierOrdersTable` | `supplier/SupplierOrdersTable.tsx` | screen usage passes `refreshTrigger?`, `onOrderAction` | Web table/mobile order cards, statuses Pending Delivery/Confirmed/Rejected/Suggested/Delivered, approve/reject/suggest actions, counter-offer modal. |

### Worker

| Component | File | Props | Variants and usage |
 | --- | --- | --- |
| `QRScanner` | `worker/QRScanner.tsx` | `onScan`, `onClose` | Full-screen black camera surface, permission state, orange viewfinder, QR-only scanner, bilingual scan label. Use only for real QR workflows and always provide cancel/permission recovery. |

### Estimator and insights

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `CostBreakdown` | `estimator/CostBreakdown.tsx` | current cost/confidence data per local declaration | White cost summary with compact category visualization, LKR/Rs total, timeline, confidence badge, and legend. Category percentages must be replaced with model/API values before financial decisions rely on them. |
| `QuotationForm` | `estimator/QuotationForm.tsx` | `onEstimateCreated` | White form card with AI Assisted pill, project type/location/quality cycle controls, square-footage input, loading generate action. |
| `RecentEstimates` | `estimator/RecentEstimates.tsx` | `refreshTrigger?` | Estimate list with Approved/Draft/Pending badges and Approve/View PDF actions. |
| `PredictionCard` | `insights/PredictionCard.tsx` | prediction factors, action label, and local data fields | Prediction insight card with factor bullets and orange outline action. Keep model confidence and recommendation understandable. |

### Shared and starter components

| Component | File | Props | Variants and usage |
| --- | --- | --- | --- |
| `ProfileScreen` | `shared/ProfileScreen.tsx` | none | Authenticated profile read/edit surface with avatar upload, role badge, contact/company/bio fields, realtime profile updates, animated toast. |
| `SettingsScreen` | `shared/SettingsScreen.tsx` | `profileHref?` | Settings surface with role-colored identity, notification toggles, theme toggle, password reset, profile link, and sign-out. Uses inline style tokens because it is a complex theme-aware screen. |
| `ThemedText` | `themed-text.tsx` | React Native `TextProps`, `type?: default/title/small/smallBold/subtitle/link/linkPrimary/code`, `themeColor?` | Expo starter typography. Keep only in starter/native-tab surfaces; use portal Tailwind typography in new role screens. |
| `ThemedView` | `themed-view.tsx` | React Native `ViewProps`, `lightColor?`, `darkColor?`, `type?: ThemeColor` | Expo starter themed surface. Do not mix with portal surface tokens without a deliberate migration. |
| `AppTabs` | `app-tabs.tsx` | none | Expo unstable native tabs starter implementation with Home/Explore. Not the role-portal navigation pattern. |
| `AppTabs` web | `app-tabs.web.tsx` | none plus exported `TabButton` and `CustomTabList` helpers | Expo web starter tabs with `ThemedView`, Docs link, and `MaxContentWidth`; transitional only. |
| `Collapsible` | `ui/collapsible.tsx` | local trigger/content props from Expo starter implementation | Starter collapsible disclosure; use only when a screen actually needs progressive disclosure. |
| `ExternalLink` | `external-link.tsx` | link props from local implementation | Starter web/native external link wrapper. Use for genuine external docs/resources only. |
| `HintRow` | `hint-row.tsx` | local hint props from starter implementation | Starter guidance row; do not introduce into dense operational screens without a clear user task. |
| `AnimatedIcon` | `animated-icon.tsx`, `animated-icon.web.tsx` | local icon/animation props from implementation | Starter animated icon platform split. Prefer `Ionicons`, `MaterialIcons`, `FontAwesome5`, `MaterialCommunityIcons`, or `Entypo` for portal actions. |
| `WebBadge` | `web-badge.tsx` | local badge props from implementation | Starter web-only badge; not part of the ConstructFlow role portal language. |
| `ToastProvider` web | `common/ToastProvider.web.tsx` | provider-local props from implementation | Web toast host; pair with the existing toast helper and do not introduce multiple competing toast libraries. |

### Component anti-patterns

- Do not use `StatCard` for a form or an action that needs a clear button.
- Do not put a table inside a card inside another card; use one framed surface for a data region.
- Do not use a status color without a text label.
- Do not use mock data in a screen presented as production-ready.
- Do not add a new sidebar or header variant when the role layout already supplies `MobileSidebar` and `TopNav`.
- Do not use inline styles for ordinary spacing/color when NativeWind already expresses the value; inline styles are reserved for dynamic dimensions, theme calculations, charts, Reanimated, and platform-specific controls.

## 6. Role-Based Layout Patterns

All role layouts use a `Slot` beside a shared sidebar. At 1024px and above the desktop sidebar is visible; below 1024px, `MobileSidebar` becomes an overlay drawer and `TopNav` opens it. This compact breakpoint keeps tablet content usable instead of reserving a fixed desktop sidebar beside narrow panels.

### Admin `/admin`

- Navigation: Dashboard, Projects, Users, Materials, Labour, Client Portal, AI Estimator, Notifications, ML Insights, Profile, Settings.
- Header: `TopNav` title, notification bell, and primary action such as `+ New Project`, `+ New User`, or `+ New Order`.
- Dashboard: four stat cards; cost/timeline chart and delay risk side by side; active project table and recent alerts below.
- Primary actions: create project, manage users, manage materials/orders, review payroll, invite clients, inspect ML insights.
- Information density: highest of all portals; preserve table scanning and search/filter affordances.

### Super admin

- Routing maps both `admin` and `super_admin` values to `/admin`.
- Use the same admin shell, but treat destructive and global account actions as admin-only controls.
- Do not create a visually separate super-admin brand; communicate privilege through permission and confirmation, not decoration.

### PM `/pm`

- Navigation: Dashboard, Projects, Materials, Labour, Payroll, Clients, Suppliers, Team, AI Estimator, Notifications, Profile, Settings.
- Header: dashboard title, project creation where available, notification count, and search on data-heavy screens.
- Dashboard: active projects, workers on site, low stock, budget; chart/risk row; project/alert row.
- Primary actions: approve/reject material requests, update milestones, review labour/payroll, generate estimates, communicate with clients.
- PM screens must prioritize assigned-project filtering and avoid global admin-only actions. Supplier summaries, team views, labour, and purchase-order project choices are scoped to PM-managed projects.

### Site manager `/site-manager` and legacy `/site`

- `/site-manager` navigation: Dashboard, Attendance, Labour, Materials, Milestones, Issues, Team, Notifications, Profile, Settings.
- Legacy `/site` navigation: Dashboard, Labour Check-in, Material Usage, Site Photos, Report Issues, Settings.
- Header: concise title, no unnecessary global actions; attendance and material screens may expose one primary action.
- Dashboard: assigned sites, workers present, low stock, active issues; current site-manager dashboard still has a detailed-widgets placeholder.
- Primary actions: scan/assign worker QR, clock attendance, request materials, upload site photos, report issues.
- Site-manager labour and team data must be limited to assigned sites and workers; admin-wide workforce screens must not be reused directly.
- Mobile is the priority: controls must be reachable with one hand and work in a touch-first flow.

### Supplier `/supplier`

- Navigation: Dashboard, Orders Portal, Deliveries, My Profile, Settings.
- Header: Supplier Dashboard, Refresh action, notification/search support.
- Dashboard: new orders, in transit, late deliveries, revenue; orders table and late-alert panel.
- Primary actions: confirm, reject, suggest new quantity/date, mark delivered.
- Order status and expected date must be more prominent than secondary supplier metadata.
- Delivery is a two-step visual lifecycle: `Delivered` means the supplier reported dispatch/arrival; `Received` means the assigned project team confirmed goods at the site. Stock values must not change at the supplier-delivery step.

### Client `/client`

- Navigation: Dashboard, Project, Media & Gallery, Messages, Invoices, Documents, Notifications, Profile, Settings.
- Header: quiet page title, minimal admin-style actions.
- Dashboard pattern: project progress, milestones, budget, media, invoices/financial records, documents, notifications, estimates, and PM conversation. The primary routes use client-scoped queries; auxiliary payment and variation-order presentation components still require their final backend contracts.
- Primary actions: view progress, inspect media/documents, approve variation orders, review/pay invoices when payment integration exists, message PM.
- Avoid exposing internal supplier, labour, RLS, or model implementation details to clients.

### Worker `/worker`

- Navigation: Dashboard, Attendance, Payroll, Profile.
- Header: short personal title such as My Dashboard, My Attendance & QR, or My Payroll.
- Dashboard: profile identity, days present, worker ID/QR, recent check-ins.
- Primary actions: show/share QR, review attendance, inspect salary slips, update profile.
- Keep the worker portal low-density and use plain language; do not replicate admin tables.

### Cross-role workflow surfaces

The UI should make the following handoffs visible without exposing unrelated internal data:

1. **Admin to PM:** project assignment, budget, milestones, material approvals, supplier relationships, labour summaries, and payroll context.
2. **PM to site manager:** assigned sites, workforce assignments, attendance operations, material requests, site issues, and progress media.
3. **PM to supplier:** purchase-order creation, expected delivery, status changes, counter-offers, and delivery confirmation.
4. **PM to client:** project progress, milestone updates, approved financial records, documents, media, estimates, notifications, and messages.
5. **Site manager to worker:** site assignment, QR attendance, daily status, hours, and worker-specific records.
6. **Client to PM:** project-scoped conversation and issue reporting; clients must not see supplier, payroll, internal labour, or RLS implementation details.

Each surface should answer four questions in its visual hierarchy: what object is being viewed, which project/site it belongs to, what status it has, and what action this role is allowed to take. Global admin tables may be dense; operational and client screens should use scoped cards, clear status badges, and one primary action per record.

### Procurement state model

Purchase-order screens share one status vocabulary: `Pending Delivery`, `Confirmed`, `Delivered`, `Received`, `Cancelled`, `Rejected`, and `Suggested`. The status badge, expected date, supplier identity, project/site identity, and allowed action must remain visible together. Only the receipt confirmation action changes project stock, and it must be idempotent so repeated taps cannot double-count inventory.

## 7. Navigation Patterns

### File-based routing

- Routes live in `frontend/src/app/` and are resolved by Expo Router.
- Each role has an `_layout.tsx` with a `Slot` and role-specific nav items.
- `index.tsx` files redirect to the role dashboard, for example `/admin/index.tsx` to `/admin/dashboard`.
- Dynamic segments use `[id].tsx`, `[workerId].tsx`, `[threadId].tsx`, or nested `[id]/index.tsx`.
- Auth pages are `/login`, `/register`, `/forgot-password`, and `/reset-password`.
- Keep a single route representation. Do not mix `route.tsx` and `route/index.tsx` for the same route.

### Tabs, stacks, and modals

- Role portals primarily use sidebar navigation plus a stack-like nested route hierarchy.
- `Modal` is used for create/edit/confirm flows that should preserve dashboard context: project, client, material, worker check-in, notification, and counter-offer flows.
- `app-tabs.tsx` and `app-tabs.web.tsx` are Expo starter tab experiments, not the primary role navigation system.
- Use a modal for short focused tasks; use a route for a task needing shareable/deep-linkable state or substantial content.

### Back navigation

- Use `TopNav` with `showBackButton` where the existing screen supports it.
- Use `router.back()` after successful modal-like create/edit flows when the user came from a list.
- Use `router.replace()` for auth guards and post-auth role redirects so protected pages are not left in browser history.
- Use explicit `Link href="..." asChild` in web-safe navigation patterns already established in the codebase.

### Deep linking

- Deep links must preserve role prefixes, for example `/admin/projects/{id}`, `/client/messages/{threadId}`, and `/worker/salary/{id}`.
- Route guards must resolve session and role before rendering protected content.
- Reset-password links depend on Supabase URL hash/session recovery; do not break the callback route.
- API links and image URLs must work on web, native simulator, and physical devices; never assume `localhost` is reachable from a phone.

## 8. Form Design

### Input anatomy

Every new form field should follow the existing auth/modal pattern:

1. Label above the control, usually `text-sm font-semibold text-gray-700`.
2. Required marker `*` in the label when required.
3. Input or selection control with `border`, `rounded-lg`/`rounded-xl`, `bg-gray-50`, `p-3`/`p-4`.
4. Placeholder that describes a real local example, such as `Colombo 03`, `YYYY-MM-DD`, or `name@company.com`.
5. Helper text below only when the format or consequence needs explanation.
6. Inline error block near the top of the form for submission/API errors: `bg-red-50`, `border-red-200`, `text-red-600`.

### Controls

- Use a text input for names, addresses, dates on native, quantities, notes, and phone numbers.
- Use horizontal pill selectors when the option count is small, as used for roles, workers, projects, status, and estimate parameters.
- Use `Switch` for binary preferences such as push notifications and settings.
- Use icon controls for show/hide password, close, notifications, menu, download, send, and back.
- For web-only date selection in `NewProjectModal`, a native date input is acceptable; provide a text/date equivalent on native.

### Validation visuals

- Do not wait until the server rejects obviously missing values. Validate required name, email, password, date, quantity, amount, and project selections before submit.
- Keep field-level validation adjacent to the field when adding it; current screens commonly use a form-level error block for API errors.
- Error state: red border or red message, never only a red icon.
- Success state: toast or success alert plus refresh/close behavior.
- Disabled submit: reduce opacity and show a spinner in the original button position.

### Required and optional fields

- Mark required fields with `*` in the label, as in project, client, and expense forms.
- Use `(Optional)` for optional company, address, description, and notes fields.
- Never silently make a required field optional because a database column currently permits null.

### Submit placement and state

- Put the primary submit action at the end of the form, right aligned on desktop or full width on mobile.
- In modal forms, keep action buttons visible after the form body or at the bottom of a scrollable content region.
- Preserve the button label while loading and replace/add an `ActivityIndicator`; do not make the form jump.
- Disable repeated submission and close controls while a mutation is active.

## 9. Data Display Patterns

### Tables and mobile cards

- Web tables use a header row with uppercase 10-12px labels, fixed percentage columns, border-bottom row dividers, and a right-aligned action column.
- Mobile replaces tables with white cards containing the primary identity/status row, key metrics, and a full-width action button.
- `ActiveProjectsTable`, `InventoryTable`, `SupplierOrdersTable`, users, projects, purchase orders, and payroll follow this split.
- Never squeeze a seven-column table onto a phone. Choose the identity, status, most important value, and one action.

### Cards, lists, and grids

- Use a card for a repeated metric (`StatCard`), a focused panel (`CostTimelineChart`), or a repeated mobile record.
- Use a list for notifications, documents, recent activity, invoices, attendance, and chat.
- Use a grid for media gallery and broad dashboard stat cards.
- Use a framed white surface with `rounded-lg`/`rounded-xl`, `border-gray-100`, and `shadow-sm`; avoid nesting decorative cards inside decorative cards.
- Client media uses a 1/3 web grid with `aspect-video`; reflow it to one or two columns on narrow screens.

### Empty states

- Center the state inside the content surface with a muted icon, a concise message, and a relevant next action if one exists.
- Existing examples use `Ionicons` in gray (`#D1D5DB`/`#E5E7EB`) and text such as `No projects found`, `No recent deliveries`, or `No attendance recorded yet`.
- Empty states must explain what is absent, not imply a failure. Use a red error state only when the request actually failed.

### Loading

- Current screens use `ActivityIndicator` rather than skeletons. Keep the spinner centered in the affected panel or page and use orange except where a domain accent is intentional.
- For a future skeleton, preserve the same card dimensions and use neutral `bg-gray-100` blocks; never use a layout-shifting spinner-only replacement for a dense table.
- Always retain an `isMounted` cleanup for asynchronous screen effects following existing screens.

### Charts

- Recharts is installed, but the current dashboard chart implementations are mostly custom React Native View compositions: `CostTimelineChart`, `LabourDistributionChart`, progress bars, rings, and segmented bars.
- Cost vs timeline: grouped vertical bars, charcoal actual and orange forecast/budget, grid lines, axis labels, optional forecast toggle.
- Labour distribution: orange bars by project/site with worker count.
- Delay risk: horizontal percentage bars using success/warning/danger thresholds.
- Budget: segmented bar or ring with spent/remaining/contingency.
- Feature importance: horizontal bars with orange fill and percentage labels.
- Every chart needs a title, plain-language supporting text, visible values, and an empty/loading/error state.

## 10. Status & Feedback

### Toast and alert patterns

- Use the project toast helper/`ToastProvider` for non-blocking success/error feedback such as attendance recorded, profile saved, or expense added.
- Use `window.alert`/`window.confirm` on web where the current code does so, especially for delete/status confirmations.
- Use `Alert.alert` on native; do not rely on multi-button native alerts in web builds.
- Use inline red/amber/green message boxes for form submission status where the user must act before continuing.

### Modal confirmation

- Web: `window.confirm(...)` for destructive or status-changing confirmation, then `window.alert(...)` for result.
- Native: `Alert.alert` with Cancel and destructive/confirm actions.
- For complex changes, use a custom `Modal` with a clear title, impact summary, Cancel, and primary/destructive action.
- Never confirm an action using color alone; state the object and consequence, for example the PO number or project name.

### Badges and pills

| Domain | Positive | Pending/warning | Negative |
| --- | --- | --- | --- |
| Project | `bg-green-50 text-green-600` / success | `bg-orange-50 text-orange-600` or gray | danger only for blocked/failed |
| Purchase order | Delivered/Confirmed: green/blue | Pending Delivery/Suggested: orange/yellow | Rejected/Cancelled: red |
| Attendance | Present: green | On Leave/Pending: gray/yellow | Absent: red |
| Materials | In Stock: green/neutral | Low Stock: orange/yellow | Out of Stock: red |
| Estimate | Approved: green | Pending: orange | Draft: gray |
| Invoice | Paid: green/blue | Pending/Unpaid: orange | Overdue: red |
| Issue | Resolved: green | Open: orange, In Progress: blue | Critical/high: red |

Pills use compact horizontal padding, small bold text, and rounded-full or rounded-md depending on whether the item is a filter/status chip or a table badge.

### Progress indicators

- Use orange for project completion and primary progress.
- Use green for healthy/complete state.
- Use warning/danger thresholds for stock and risk.
- Always show a numeric percentage or label beside a progress bar when the value matters.
- Keep progress bars at least 6-8px high, rounded, and inside a neutral track.

## 11. Interaction States

### Buttons

- **Default:** orange filled for the primary action, white/gray outline for secondary, red only for destructive actions, green for explicit approval/payroll completion where already established.
- **Hover:** darken the fill or add a quiet gray/orange surface; never change layout dimensions.
- **Pressed:** lower opacity or use a darker background; preserve text/icon contrast.
- **Loading:** keep width/height stable and render `ActivityIndicator` in the button.
- **Disabled:** use `opacity-60`/`opacity-70` or gray fill, prevent presses, and do not show hover affordance.

### Inputs

- **Default:** `border-gray-300`, `bg-gray-50`, `text-brand-text`, rounded-lg/xl.
- **Focused:** orange border and white surface, with an equivalent visible focus indication on web.
- **Filled:** keep white/gray surface and readable text; do not remove the label.
- **Error:** red border/message and retain the value for correction.
- **Disabled:** muted text, gray background, no active hover, and explain why if not obvious.

### Cards

- **Default:** white, `rounded-lg`/`rounded-xl`, `border-gray-100`, `shadow-sm`.
- **Hover:** subtle `hover:bg-gray-50` or shadow change only on web interactive cards.
- **Selected:** orange border/tint or the established blue/role accent; include text/icon state, not border alone.
- **Skeleton/loading:** preserve card dimensions and use neutral gray blocks.
- **Error:** keep the card structure and show a clear error block; do not replace the whole dashboard with an unexplained blank area.

## 12. Icon System

### Libraries

The project uses:

- `@expo/vector-icons`: `Ionicons`, `MaterialIcons`, `FontAwesome5`, `MaterialCommunityIcons`, and `Entypo`.
- `lucide-react-native` is installed and may be used for new icons when it improves consistency, but existing role nav uses Expo vector families.
- `expo-symbols` appears in the Expo starter web/native tab components.

Use one icon family consistently within a control group. Existing navigation uses MaterialIcons for dashboard, FontAwesome5 for domain sections, Ionicons for notifications/profile/settings, Entypo for ML insights, and MaterialCommunityIcons for file types.

### Icon sizes

- 12px: tiny inline status/check indicators.
- 14-16px: table metadata, badge icons, compact button icons.
- 18-20px: nav icons, standard toolbar buttons, action icons.
- 22-26px: menu/close/header icons and prominent control icons.
- 32-48px: empty states, feature panels, identity/QR illustrations.
- 64px: large empty-state/map placeholder only.

### Rules

- Pair unfamiliar icon-only controls with a tooltip/accessibility label.
- Use icons inside buttons when they clarify the action: upload, add, send, download, scan, warning, close, back.
- Do not use emoji as a substitute for a status icon.
- Keep icon color semantic: orange primary, gray neutral, green success, red danger, blue information.
- Icon-only buttons need at least a 44x44 touch box even when the glyph is 18-24px.

## 13. Mobile-First Responsive Rules

### Breakpoints

- The primary compact application breakpoint is **1024px**: `useResponsive()` sets `isMobile` below 1024px on web, and role layouts use `width < 1024`. Native platforms always use the compact drawer behavior.
- Tailwind responsive classes also use `md:` and `lg:`. Auth pages use `lg:w-1/2`, `hidden lg:flex`, and `md:p-12`.
- Use `sm:`, `md:`, and `lg:` reflow classes for content; do not introduce a second primary shell breakpoint without a concrete layout need.

### Reflow rules

- Sidebar becomes an overlay drawer with scrim; `TopNav` exposes the menu button.
- Four stat cards wrap at tablet widths and use full-width cards on narrow phones where two columns would make labels or values unreadable.
- `flex-[2]`/`flex-[1]` dashboard rows become vertical stacks with full-width children.
- Web tables become cards with primary identity, status, key value, and one full-width action.
- Modal columns stack; form content stays scrollable with a max-height such as 70-85vh.
- Client media grids move from 3 columns to fewer columns; do not preserve tiny thumbnails at the expense of tapability.
- Search controls become full width on mobile.

### Touch and keyboard

- Minimum touch target: **44x44px** for every tappable control. Existing `w-10 h-10` controls are 40px and should be expanded when new work touches them.
- Use `Pressable`/`TouchableOpacity` with visible pressed states.
- Use `KeyboardAvoidingView` for chat, auth, and long mobile forms; current chat uses iOS padding and Android height behavior.
- Ensure focused fields and submit actions can scroll above the keyboard.
- Use `ScrollView` or `FlatList` for long mobile content and do not nest vertical scroll views without a bounded inner region.

## 14. Accessibility

- Meet WCAG AA contrast for normal text: 4.5:1 minimum; large text: 3:1 minimum. Check orange text on white carefully; use orange mainly for large/bold labels, borders, icons, or filled buttons with white text.
- Do not use `brand-warning` and `brand-orange` as the only distinction between warning and action; include a text label/icon.
- Provide visible focus treatment on web. Current fields use orange border on focus; preserve it and do not remove outlines without replacement.
- Add `accessibilityRole`, `accessibilityLabel`, and `accessibilityState` for custom controls. The login Remember me checkbox is the model pattern.
- Icon-only controls must have a screen-reader label describing the action, not only the icon name.
- Status badges must contain text (`Delivered`, `Pending`, `Present`, `Rejected`) and should not rely on color alone.
- Keep heading hierarchy logical: page title, section title, panel title, body.
- Announce loading/success/error states through visible text and platform-appropriate accessibility announcements when adding complex async flows.
- Respect reduced-motion preferences where practical; avoid making core task completion depend on animation.
- Preserve readable text at increased system font sizes; do not hard-code card heights around a single line of text.
- Keep modal focus/escape/back behavior predictable and provide a visible close control.

## 15. Currency & Locale

- Display construction financial values as **LKR** or **Rs.** only. Existing code uses `LKR ${amount.toLocaleString('en-LK')}` and `Rs. ${(amount / 1000000).toFixed(1)}M`.
- Never display USD, EUR, or an unlabeled numeric construction amount.
- Use `Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' })` for new reusable currency formatting where the UI needs a full currency string; preserve `Rs.` compact notation in existing dashboard cards.
- Use DD/MM/YYYY or locale-appropriate `en-GB`/`en-LK` formatting for user-facing dates. The database/API may retain ISO `YYYY-MM-DD` for input and transport.
- Date inputs should explain the expected format, especially native text date fields.
- Format Sri Lankan phone numbers with `+94` when storing/displaying international contact values; accept local input only when the form clearly normalizes it.
- Use local terms such as site, project manager, worker, material request, and purchase order consistently.
- Do not invent exchange-rate conversions in the UI.

## 16. Do / Don't Rules

1. ✅ **DO:** Use `<Link href="..." asChild>` for web navigation where the surrounding route already uses that pattern.  
   ❌ **DON'T:** Replace it with a new navigation abstraction inside one screen.
2. ✅ **DO:** Keep one route shape per Expo Router path.  
   ❌ **DON'T:** Create both `route.tsx` and `route/index.tsx` for the same path.
3. ✅ **DO:** Guard async effects with `isMounted` cleanup, as used across dashboards and data panels.  
   ❌ **DON'T:** Set state after an unmounted Supabase request.
4. ✅ **DO:** Use `TopNav` and the role layout sidebar for authenticated pages.  
   ❌ **DON'T:** build a second page shell with a competing header/sidebar.
5. ✅ **DO:** Use `brand-orange` for primary actions, active tabs, progress, and unread indicators.  
   ❌ **DON'T:** introduce a new primary purple, blue, or green action color.
6. ✅ **DO:** Use `brand-success` for completed/paid/delivered/present states.  
   ❌ **DON'T:** use green for a generic primary action unless the action is explicitly approval/completion.
7. ✅ **DO:** Keep `brand-danger` for errors, rejection, critical risk, and destructive actions.  
   ❌ **DON'T:** make every warning red.
8. ✅ **DO:** Show status text with status color.  
   ❌ **DON'T:** communicate status by color or an icon alone.
9. ✅ **DO:** Convert desktop tables to mobile cards.  
   ❌ **DON'T:** squeeze a dense table into a 360px phone viewport.
10. ✅ **DO:** Preserve a 44x44px touch target for new controls.  
    ❌ **DON'T:** make an icon-only action tappable only on its 18px glyph.
11. ✅ **DO:** Use `window.confirm`/`window.alert` on web and `Alert.alert` on native.  
    ❌ **DON'T:** rely on a multi-button React Native alert in a web build.
12. ✅ **DO:** Keep modal bodies scrollable and cap long forms around the existing 70-85vh patterns.  
    ❌ **DON'T:** allow a modal form to extend below the keyboard or viewport.
13. ✅ **DO:** Keep loading in the same region as the data it replaces.  
    ❌ **DON'T:** cause a whole dashboard to jump when one panel loads.
14. ✅ **DO:** Use an empty state with a muted icon, message, and relevant next action.  
    ❌ **DON'T:** leave an empty white panel with no explanation.
15. ✅ **DO:** Use real data or explicitly label mock data.  
    ❌ **DON'T:** hard-code production-looking invoices, galleries, milestones, or chat messages in a screen presented as complete.
16. ✅ **DO:** Include Supabase session tokens when calling protected FastAPI endpoints.  
    ❌ **DON'T:** add a direct unauthenticated mutation just because the browser call is convenient.
17. ✅ **DO:** Keep production credentials out of source, README, and screenshots.  
    ❌ **DON'T:** commit Supabase keys, Google keys, Cloudinary secrets, or Resend keys.
18. ✅ **DO:** Use `EXPO_PUBLIC_API_URL` and account for LAN IP access from Expo Go.  
    ❌ **DON'T:** assume `localhost` on a physical phone points to the development computer.
19. ✅ **DO:** Use `NativeWind` for ordinary layout/color/spacing.  
    ❌ **DON'T:** add large inline style objects for values already available as Tailwind utilities.
20. ✅ **DO:** Use inline style only for dynamic chart dimensions, Reanimated, theme calculations, or platform-specific controls.  
    ❌ **DON'T:** mix a new arbitrary color system into every component.
21. ✅ **DO:** Use the existing icon families consistently within a navigation or control group.  
    ❌ **DON'T:** draw manual SVG icons when an installed icon exists.
22. ✅ **DO:** Use `LKR` or `Rs.` and `en-LK`/`en-GB`-appropriate dates.  
    ❌ **DON'T:** display USD or ambiguous dates in a Sri Lankan construction workflow.
23. ✅ **DO:** Preserve the `refreshTrigger` and local state pattern when a panel needs a lightweight refresh.  
    ❌ **DON'T:** add Redux or a global store for a single screen mutation.
24. ✅ **DO:** Keep role prefixes in URLs and filter data to the current role/project/site.  
    ❌ **DON'T:** expose global admin data in a worker, client, supplier, or site-manager view.
25. ✅ **DO:** Treat `USING (true)` RLS policies as development-only.  
    ❌ **DON'T:** ship a new screen assuming permissive policies are safe.
26. ✅ **DO:** Use a concise, descriptive title in `TopNav`.  
    ❌ **DON'T:** expose generated route names such as `Admin Projects Id Milestones Milestoneid` as final product copy.
27. ✅ **DO:** Preserve `ProfileScreen` role accent mapping and `SettingsScreen` dark-mode values.  
    ❌ **DON'T:** create a second role-color mapping in a single portal.
28. ✅ **DO:** keep error, success, and disabled states readable at all viewport sizes.  
    ❌ **DON'T:** hide the only explanation inside a tooltip or hover state.
29. ✅ **DO:** make charts legible with titles, units, labels, and empty/loading states.  
    ❌ **DON'T:** add a chart whose meaning depends only on color or an unlabeled axis.
30. ✅ **DO:** verify both web and native behavior for `Pressable`, `Modal`, date fields, keyboard avoidance, and navigation.  
    ❌ **DON'T:** assume a web-only interaction will work in Expo Go.

## 17. File Naming & Component Conventions

### Names

- React components use PascalCase: `StatCard.tsx`, `TopNav.tsx`, `ClientMediaGallery.tsx`.
- Expo Router route files follow the existing route convention: lowercase route segments, `_layout.tsx`, `index.tsx`, and bracketed dynamic segments such as `[id].tsx`.
- Prefer kebab-case for new non-route component filenames only when the local folder already uses it; current shared starter files include `themed-text.tsx`, `themed-view.tsx`, and `external-link.tsx`.
- Avoid abbreviations in new component names; role abbreviations such as `SM` and `PM` are existing legacy names, not a requirement for new work.

### Co-location

- Keep domain components in the matching folder: `dashboard`, `client`, `labour`, `materials`, `supplier`, `worker`, `estimator`, or `insights`.
- Keep reusable shell components in `common` and cross-role profile/settings surfaces in `shared`.
- Keep styles in NativeWind classes in the component unless a value is dynamic, animated, chart-derived, or platform-specific.
- Keep data fetching and mutation logic near the component that owns the data; use existing service/context hooks for shared auth, notifications, responsive state, and sidebar state.
- Add a new component when a UI region is reused, has its own data/mutation lifecycle, has multiple visual states, or is longer than a manageable screen section. Keep a one-off simple row inline.
- Export a stable props interface for shared components. Avoid `any` for new public component contracts.
- Prefer callbacks such as `onClose`, `onSuccess`, `onRefreshNeeded`, and `onActionPress` for parent-owned state transitions.
- Do not create a component only to hide a two-line `View` unless the pattern is reused or semantically meaningful.

## 18. Animation & Motion

### Current motion system

- `AnimatedCard` uses React Native Reanimated shared values, an exponential ease-out opacity transition, and a spring translation with damping 15, stiffness 100, mass 1. Default timing duration is 500ms and dashboard delays are commonly 100ms increments.
- `MobileSidebar` uses React Native `Animated` with 300ms cubic slide/fade transitions.
- The public landing page uses `Animated.timing` at 750ms for slide and 900ms for fade.
- `ProfileScreen` and `SettingsScreen` use 300ms animated toast fade-in/out with a roughly 2.5-2.8 second visible duration.
- CSS/native hover and transition utilities are used for web controls, but should not be relied upon for native-only feedback.

### Motion rules

- Use motion to explain hierarchy, navigation, state change, or completion.
- Use one page-load reveal group, not a separate animation for every table row.
- Keep operational feedback fast: roughly 150-250ms for hover/pressed transitions and 250-350ms for modal/drawer transitions.
- Preserve the existing 300ms drawer and 500ms dashboard card language unless a task has a measured reason to change it.
- Use spring motion only for spatial surfaces such as cards/drawers; use timing for opacity, color, and status changes.
- Never animate financial values in a way that obscures the final number.
- Do not animate critical error messages away before the user can read them.
- Respect reduced-motion preferences on web and provide an immediate final state where possible.
- Use `useNativeDriver: true` for React Native `Animated` values that support it.
- Avoid animation on large data lists, typing fields, or every status badge; motion should not slow site operations.
