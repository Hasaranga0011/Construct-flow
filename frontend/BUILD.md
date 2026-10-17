# ConstructFlow Android APK Build Guide (EAS Cloud Build)

This guide documents the complete step-by-step procedure to build, download, install, and troubleshoot the standalone **ConstructFlow** (ConstructAi) Android APK using Expo Application Services (**EAS Cloud Build**).

---

## 1. Prerequisites & Preparation

Before building the APK, verify that your local development environment passes all integrity checks:

```bash
cd frontend
npm run build:apk:local-check
```

This script verifies:
1. `npx expo-doctor` — validates SDK 54 configuration and plugins (18/18 checks clean).
2. `npx expo install --check` — ensures all package versions match Expo SDK 54.
3. `npx tsc --noEmit` — enforces zero TypeScript type errors.

> **Size Optimization Note**: The app is configured with `expo-build-properties` (R8 code & resource shrinking, PNG crunching, and single-arch `arm64-v8a` for preview builds). See [`SIZE_REPORT.md`](SIZE_REPORT.md) for full metrics and the smoke test verification checklist.

---

## 2. Step-by-Step Manual Build Instructions

### Step (a): Create a Free Account at Expo
1. Go to [expo.dev](https://expo.dev/signup) and create a free account if you haven't already.
2. Remember your Expo username and password (or GitHub SSO login).

---

### Step (b): Install EAS CLI, Login, and Link Project
Open a terminal in your workspace and navigate to `frontend/`:

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Log in to your Expo account (interactive command)
eas login

# 3. Initialize EAS in the frontend directory
cd d:\PROJECTS\Construct-flow\frontend
eas init
```

> **Important**: When prompted by `eas init`:
> - Select **"Create a new project"** (or link to an existing project if you already created it on expo.dev).
> - EAS will automatically register the project and add the genuine `extra.eas.projectId` and `owner` to your `frontend/app.json`.
> - Do not manually invent a project ID.

---

### Step (c): Configure Environment Variables for Preview & Production

In Expo, environment variables starting with `EXPO_PUBLIC_` are baked into the compiled JavaScript bundle at build time.
- **Allowed public variables**:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_API_URL`
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (optional)
- **Security Rule**: The Supabase **anon key** is safe for client applications, but **NEVER** expose the Supabase service-role key, database passwords, or third-party provider secrets.
- **Release API URL Requirement**: In release builds (`!__DEV__`), `EXPO_PUBLIC_API_URL` **must** start with `https://` (e.g. `https://api.yourdomain.com/api` or hosted backend) and **must not** point to `localhost`, `127.0.0.1`, or private network IPs.

#### Option 1: Via Expo Web Dashboard (Recommended)
1. Navigate to [expo.dev](https://expo.dev) and select your `construct-flow` project.
2. In the left navigation, go to **Project Settings** → **Environment variables**.
3. Add the following variables and select the **preview** (and optionally **production**) environment:

| Variable Name | Environment | Value Example | Visibility |
| :--- | :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | `preview`, `production` | `https://zcrhiuajkxxfxanaajiz.supabase.co` | Plaintext |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `preview`, `production` | `eyJhbGciOi...` | Plaintext |
| `EXPO_PUBLIC_API_URL` | `preview`, `production` | `https://api.yourdomain.com/api` | Plaintext |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | `preview`, `production` | `AIzaSy...` (optional) | Plaintext |

#### Option 2: Via EAS CLI Commands
You can also set these variables using the verified `eas env:create` (or `eas env:set`) command:

```bash
# Preview environment variables
eas env:create preview --name EXPO_PUBLIC_SUPABASE_URL --value "https://zcrhiuajkxxfxanaajiz.supabase.co" --type string --visibility plaintext --scope project
eas env:create preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_SUPABASE_ANON_KEY" --type string --visibility plaintext --scope project
eas env:create preview --name EXPO_PUBLIC_API_URL --value "https://your-live-backend-url.com/api" --type string --visibility plaintext --scope project
eas env:create preview --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "YOUR_GOOGLE_MAPS_API_KEY" --type string --visibility plaintext --scope project

# Alternatively, interactive creation:
eas env:create preview
```

---

### Step (d): Commit All Configuration Changes
Make sure your working tree is committed to Git so EAS Cloud Build receives the latest code:

```bash
cd d:\PROJECTS\Construct-flow
git add frontend/app.json frontend/eas.json frontend/package.json frontend/BUILD.md frontend/.env.example frontend/.easignore frontend/.gitignore
git commit -m "feat(build): configure Android preview APK for EAS Cloud Build"
```

---

### Step (e): Trigger the Cloud Build
Run the preview build from the `frontend/` directory:

```bash
cd frontend
npm run build:apk
# or directly:
eas build -p android --profile preview
```

EAS will upload your project archive (ignoring files specified in `.gitignore` and `.easignore`), queue the build on an Expo Android worker, compile the native code, and output a live progress URL in your terminal.

---

### Step (f): Download and Install the APK on Your Android Device
1. Once the build finishes, EAS CLI will output a direct download link and a QR code in the terminal.
2. Scan the QR code or open the link on your Android device to download the `.apk` file.
3. Tap the downloaded file to install.
4. If Android displays **"Blocked by Play Protect"** or **"Install unknown apps"**:
   - Tap **Settings** → toggle **"Allow from this source"** for your browser / file manager.
   - Tap **Install anyway**.

---

### Step (g): Configure Supabase OAuth Callback URL
If Google Sign-In or OAuth authentication is used:
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** → **URL Configuration**.
3. Under **Redirect URLs**, click **Add URL** and add:
   ```text
   constructflow://auth/callback
   ```
4. Save the configuration. This enables Google OAuth to return smoothly back to the installed app after authentication.

---

### Step (h): Back Up Your Android Signing Keystore
When EAS builds your Android app for the first time, it generates a cryptographically secure Android signing keystore.
**Back this up immediately**:

```bash
cd frontend
eas credentials
```

1. Select **Android** → **preview** (or **production**).
2. Select **Keystore: Manage everything related to your Keystore**.
3. Select **Download Keystore**.
4. Store the downloaded credentials (`.jks` / `.json` credentials) securely in your password manager or private cloud backup. If you ever lose this keystore, you will not be able to issue app updates on Google Play.

---

### Step (i): Expo Free Plan Limitations & Quotas
Keep in mind the constraints of the Expo free ("Hobby") tier:
- **Build Queue**: Builds are scheduled in a shared, low-priority queue. During peak hours, builds may wait in the queue for several minutes before starting.
- **Monthly Limit**: Free accounts have a monthly concurrency and build quota (typically 30 builds/month). Check current limits at [expo.dev/pricing](https://expo.dev/pricing).
- **Timeout**: Cloud builds have an execution timeout limit (~45 minutes). If a build exceeds this time, EAS cancels it.
- **Tip**: Always run `npm run build:apk:local-check` locally before triggering `eas build` so you do not burn your monthly quota on avoidable syntax or dependency errors.

---

## 3. Troubleshooting Matrix

| Issue / Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **Build fails on dependencies or types** | Incompatible Expo packages or TypeScript compilation error. | Run `npm run build:apk:local-check` locally. Fix any mismatched versions reported by `npx expo install --check` or type errors from `npx tsc --noEmit`. |
| **White screen on launch / App immediately crashes** | Missing or unpopulated `EXPO_PUBLIC_` environment variables at build time. | Check `frontend/.env` and your EAS Environment variables on `expo.dev`. Ensure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL` are populated. Re-trigger build. |
| **"Network request failed"** | `EXPO_PUBLIC_API_URL` uses `http://` instead of `https://`, targets `localhost`/private IP, or the backend server is sleeping/unreachable. | In release builds, Android blocks unencrypted HTTP traffic by default. Verify your backend is running, has valid TLS/SSL certificates (`https://`), and that `EXPO_PUBLIC_API_URL` points to the public domain. |
| **Camera does not open / QR scanner black screen** | Missing `expo-camera` configuration plugin or missing runtime permissions. | Ensure `expo-camera` is listed under `plugins` in `frontend/app.json` with `cameraPermission` specified. Check that `android.permission.CAMERA` is listed in `android.permissions`. |
| **Google Sign-In does not return to app** | Missing scheme redirect in Supabase or misconfigured app scheme. | Verify `app.json` has `"scheme": "constructflow"`. Confirm `constructflow://auth/callback` is listed in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. |
| **Image picker fails to open gallery** | Missing `expo-image-picker` plugin or scoped permissions. | Ensure `expo-image-picker` is registered in `app.json` plugins with `photosPermission`, and `android.permission.READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` are declared. |
| **EAS build upload is very slow or exceeds size limit** | Large assets, node modules, or backend files uploaded in project archive. | Verify `frontend/.easignore` and `frontend/.gitignore` exclude `node_modules/`, `dist/`, `.expo/`, and parent folders (`../backend`, `../.venv`). |
