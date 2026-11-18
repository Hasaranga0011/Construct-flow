# Welcome to your Expo app 👋

## Interactive maps

The web map loads `/api/maps/frame` from the configured API origin, which must differ from the frontend origin. This allows valid origin-only tile referrers while isolating the map from frontend session storage. Include the deployed frontend origin in backend `FRONTEND_URL` / `CORS_ORIGINS` so the frame embedding policy permits it.

`backend/static/constructflow-map.html` is a required API runtime asset, generated from `src/components/common/mapHtml.ts` by `node scripts/build-map-frame.cjs`. Expo configuration regenerates it automatically in the full repository; package it with backend deployments. Native WebViews use the same generator and identify the app as `ConstructFlow/1.0`.

Browser map tests intercept all tiles rather than downloading or scanning public map servers. Keep OpenStreetMap attribution visible and respect provider cache headers.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

### Project location search

When the configured Geoapify search yields no relevant match, a cached, country-bounded Photon lookup supplies typo-tolerant alternatives. Compound-name transpositions such as `shrangila` can resolve to separate Shangri-La branches, labeled as partial matches. No Geoapify key is sent to Photon, and Nominatim is not used for typing suggestions. Searching keeps the current project site unchanged until the user selects a place or moves the pin.

The selected free-provider setup uses backend `GEOAPIFY_API_KEY`. When present, it takes priority over optional Google configuration: the map remains Leaflet/OpenStreetMap, while the backend supplies Geoapify address autocomplete, explicit search and reverse lookup. The key is never included in frontend environment variables, metadata responses or map HTML. Requests are country-filtered to Sri Lanka, serialized below the provider's free-plan rate limit and cached/coalesced to conserve quota. API failures return a generic message instead of authenticated URLs. Follow the provider's account quota and [Geoapify attribution requirements](https://www.geoapify.com/pricing/); the UI includes a Geoapify link and retains OpenStreetMap attribution.

`SiteLocationSearch` is shared by the dashboard project modal and the full project-create page. It debounces typing by 450ms after three characters, supports keyboard result selection, cancels stale requests, preserves translated/fuzzy provider matches and updates the editable site address/pin only on selection. A provider key cannot add businesses missing from its index. Real diagnostics found Negombo but did not find Enrich Arcane in either address search or the separately checked named-business service. No guessed business pin is substituted.

The Google setup below remains optional; clear `GEOAPIFY_API_KEY` to select Google mode instead.

Set `GOOGLE_MAPS_BROWSER_KEY` in `backend/.env` to use Google Maps and the Google Places autocomplete widget throughout the shared map component. This is an intentionally browser-visible, HTTP-referrer-restricted key; do not put a server-only credential in this setting. The widget handles typing suggestions and its autocomplete session, then requests only `location`, `formattedAddress` and `displayName` for the selected place. The selected coordinates/address update the project form; manual pins and satellite view remain available. Google place results stay on Google maps. The same API-origin Google document is used by native WebViews.

Enable billing, Maps JavaScript API and Places API (New) in the key's Google Cloud project. Enable Geocoding API as well for manual-pin address lookup. In HTTP referrer restrictions allow the **API frame origins**, for example `http://localhost:8000/*`, `http://127.0.0.1:8000/*`, and the deployed HTTPS API domain. Native-device tests need the actual LAN/API origin allowed too. Restrict the key's APIs to those services, restart the backend and refresh the frontend after configuration. `/api/maps/config` exposes only the selected provider; `/api/maps/frame?provider=google` embeds only this browser key, with a fresh CSP nonce and no-store responses. The separate API origin remains required to isolate the map from frontend tokens/storage. Deployment must include `backend/static/constructflow-google-map.html` alongside the existing Leaflet asset. See [Google setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key) and [Google CSP guidance](https://developers.google.com/maps/documentation/javascript/content-security-policy).

Without a Google browser key, the free map has debounced Photon-only typing suggestions after three characters. Explicit Search uses `/api/projects/geocode` to merge Sri Lanka-filtered Photon and Nominatim results, ranked by name/city overlap and deduplicated. Nominatim is never used for autocomplete. A partial label is a textual match indicator, not a verified rooftop location. Users select a result before the project address/pin changes. Missing businesses still require a street address or a manual pin; the application does not invent coordinates. Free-provider coverage is not equivalent to Google Maps.

Forward and reverse Nominatim requests share a server-side cache and a single-process, one-request-per-second limiter. Deploy one geocoding worker for the public endpoint, or configure a shared rate-limited proxy/self-hosted service when using multiple backend workers. Keep OpenStreetMap attribution visible. Follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): explicit moderate searches only, no autocomplete, no bulk/systematic requests. Provider URLs can be changed without frontend rebuilds using backend `PHOTON_SEARCH_URL`, `NOMINATIM_SEARCH_URL` and `NOMINATIM_REVERSE_URL` environment variables.

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
