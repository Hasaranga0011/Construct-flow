# How to Run ConstructFlow

This project contains a React Native frontend (using Expo Router) and a FastAPI backend.

## Prerequisites
- Node.js 20+ installed. Node 22+ is recommended because Supabase warns about Node 20.
- npm installed with Node.js.
- Python installed for the backend.
- Expo Go installed on your Android or iPhone if you want to open the app on a physical device.

## Install and Run Backend

```bash
# Open a terminal in the root workspace folder
& ".\.venv\Scripts\Activate.ps1"
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Install and Run Frontend

```bash
# Open a new terminal from the root workspace folder
cd frontend
npm install
npm start
```

When Expo opens, press:
- `w` to open the web version in your browser
- `a` to open Android
- `i` to open iOS

For a physical phone, keep `npm start` running and scan the QR code with Expo Go.

## Other commands

```bash
# In the frontend directory:
npm run web
npm run android
npm run ios
npm run lint
```

## Troubleshooting

- If npm says it cannot find `package.json`, you are in the wrong directory. Change into `frontend` first.
- If the app shows a blank page on web, restart with a clean cache: `npm start -- --clear`.
- If Supabase prints Node engine warnings, upgrade to Node 22+ and reinstall dependencies.
