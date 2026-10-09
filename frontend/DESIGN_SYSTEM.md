# Responsive behavior

Use existing NativeWind brand tokens and spacing. Do not add a separate mobile theme.

- Portal shells reserve a desktop sidebar at web widths >= 1024px. Smaller web widths and all native devices use MobileSidebar as a drawer. Each screen owns one TopNav; shells never add a duplicate header.
- Dense text permits system font scaling up to 1.3. Headings and record values wrap; text containers may shrink and must not force a wider page. Interactive controls have a minimum 44 x 44 layout size.
- Stat cards wrap into two columns on tablets and use one or two columns on phones. Values keep their type scale. Dashboard columns stack below 1024px.
- Data tables use RecordCard or a screen-specific equivalent below 1024px. A deliberately wide desktop table/chart may scroll within its own region.
- Root safe-area insets protect portal content. KeyboardAvoidingView uses padding on iOS and height on Android. Form scroll regions preserve handled taps.
- ModalViewport caps content at 85% of the viewport and respects insets. Modal content must include a shrinking ScrollView; submit and close actions must remain reachable by scrolling.
- AnchoredOverlay measures its field, matches its width, flips above when necessary, and stays within the viewport/keyboard bounds. It uses a Modal portal so parent overflow cannot clip options. Android Back and outside presses dismiss it.
- DateField uses the system date/time picker on native and an accessible HTML input on web. Native PDF downloads use Expo file sharing.
- Backend calls use getApiUrl(). Native loopback addresses resolve to the Expo LAN host; a hosted backend can be set with EXPO_PUBLIC_NATIVE_API_URL. A tunnel/unknown host requires explicit configuration instead of silently contacting phone localhost.
- Remote push registration is skipped in Expo Go. In-app notification feeds remain available.

## Validation

See AGENT.md for the per-screen changelog and frontend/reviews/RESPONSIVE_AUDIT.md for scope and limitations. Browser input focus does not prove native keyboard behavior. Native bundle compilation does not prove physical-device layout.
