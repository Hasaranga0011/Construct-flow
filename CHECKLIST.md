# ConstructFlow UI PR Checklist

Use this checklist before opening every frontend PR. Check the boxes that apply and record exceptions in the PR description.

## Product and role context

- [ ] Does the screen belong to the correct role portal: `/admin`, `/pm`, `/site-manager`, `/supplier`, `/client`, or `/worker`?
- [ ] Is data filtered to the current user, project, site, or role as required?
- [ ] Are admin-only actions hidden from PM, site-manager, supplier, client, and worker users?
- [ ] Is the primary task obvious from the page title, `TopNav`, and first content region?
- [ ] If the screen is still mock or incomplete, is that state explicitly communicated instead of presenting sample data as live data?

## Brand and visual consistency

- [ ] Does the screen use the existing tokens: `brand-dark`, `brand-light`, `brand-orange`, `brand-text`, `brand-text-muted`, `brand-success`, `brand-warning`, and `brand-danger`?
- [ ] Is orange reserved for primary actions, active states, progress, AI accents, unread indicators, and construction warnings?
- [ ] Are success, warning, danger, and information states distinguished by both text and color?
- [ ] Does the screen use Inter/system fallback typography and the existing scale rather than introducing a new font?
- [ ] Are surfaces using the established white/gray canvas, subtle borders, `rounded-lg`/`rounded-xl`, and `shadow-sm` language?
- [ ] Have nested decorative cards been avoided?
- [ ] Are inline styles limited to dynamic dimensions, charts, animation, theme calculations, or platform-specific controls?

## Layout and responsive behavior

- [ ] Does the screen work below and above the 768px mobile breakpoint?
- [ ] Does the role sidebar collapse into the existing mobile drawer and scrim?
- [ ] Does `TopNav` remain the only authenticated page header?
- [ ] Do dashboard columns stack on mobile instead of shrinking into unreadable widths?
- [ ] Do web tables become mobile cards with identity, status, key value, and one clear action?
- [ ] Are page gutters and panel gaps based on the 4px/8px/16px spacing rhythm?
- [ ] Are important content and controls clear of safe areas, the mobile drawer, bottom navigation, and keyboard?
- [ ] Does every new interactive control have at least a 44x44px touch target?

## Components and interaction

- [ ] Was an existing component reused when the need matches `TopNav`, `MobileSidebar`, `StatCard`, `AnimatedCard`, a modal, a status badge, or a data panel?
- [ ] If a new component was added, is it in the correct domain folder and named in PascalCase?
- [ ] Does the component expose a typed props interface and callbacks such as `onClose`, `onSuccess`, or `onActionPress` where appropriate?
- [ ] Are button states implemented for default, hover/web, pressed, loading, and disabled?
- [ ] Are input states implemented for default, focused, filled, error, and disabled?
- [ ] Are modals scrollable and capped to the viewport, with a visible close action?
- [ ] Are destructive or status-changing actions confirmed with `window.confirm` on web and `Alert.alert` on native?
- [ ] Are icon-only buttons labelled for screen readers and given a visible tooltip/accessible name when unfamiliar?
- [ ] Does the UI provide a meaningful empty state with a muted icon and next action where useful?
- [ ] Does loading preserve the affected layout and show an `ActivityIndicator` or approved skeleton?

## Data, feedback, and accessibility

- [ ] Are Supabase requests guarded with `isMounted` cleanup when the existing screen pattern requires it?
- [ ] Are protected FastAPI calls made through an authenticated session token?
- [ ] Does successful mutation refresh the relevant list/panel without a full page reload?
- [ ] Does every mutation provide visible success or error feedback through the project toast/alert pattern?
- [ ] Are status labels explicit: `Pending Delivery`, `Confirmed`, `Delivered`, `Rejected`, `Present`, `Absent`, `On Leave`, and similar values?
- [ ] Do charts include a title, units, visible values, and loading/empty/error states?
- [ ] Does normal text meet WCAG AA contrast, especially orange/gray text on white?
- [ ] Is the focus state visible on web inputs and controls?
- [ ] Are custom controls assigned appropriate `accessibilityRole`, `accessibilityLabel`, and `accessibilityState`?
- [ ] Is information conveyed by more than color alone?

## Locale and content

- [ ] Are all construction amounts displayed as `LKR` or `Rs.` and never USD or an unlabeled number?
- [ ] Are dates displayed as DD/MM/YYYY or locale-appropriate `en-GB`/`en-LK` output, with ISO used only for transport/input where appropriate?
- [ ] Are Sri Lankan phone numbers accepted/displayed with `+94` when international formatting is required?
- [ ] Is the copy concise, operational, and understandable to Sri Lankan construction teams?
- [ ] Have generated route names, debug text, lorem ipsum, and placeholder-looking production copy been removed from the completed screen?

## Routing and security

- [ ] Does the change preserve Expo Router conventions: `_layout.tsx`, `index.tsx`, bracketed dynamic segments, and one route shape per path?
- [ ] Does web navigation use `<Link href="..." asChild>` where the surrounding route pattern uses it?
- [ ] Are role prefixes preserved in internal links and deep links?
- [ ] Are production credentials absent from source, documentation, screenshots, and test fixtures?
- [ ] Has the change been checked against current RLS behavior rather than relying on development-wide `USING (true)` policies?
- [ ] Does the screen avoid exposing global or cross-tenant records to a non-admin role?

## Validation before PR

- [ ] `npm run lint` passes from `frontend`.
- [ ] The affected web route was tested at a narrow mobile width and a desktop width.
- [ ] The affected native flow was checked in Expo Go or the relevant simulator when it uses camera, keyboard, modal, safe-area, or platform-specific behavior.
- [ ] Backend/API changes were checked with the running FastAPI `/health` and relevant authenticated endpoint.
- [ ] A focused empty, loading, error, success, and disabled state was exercised where applicable.
- [ ] No unrelated formatting, schema, credentials, or generated files were included in the PR.
- [ ] `git diff --check` passes for the changed files.
