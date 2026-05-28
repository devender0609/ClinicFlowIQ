# ClinicFlowIQ SmartOps v3

Live-only Firebase/Firestore clinic room-flow command board.

## Phase 1 included
- CSV schedule upload to avoid manually adding every patient
- Role-specific views: Command, Front desk, MA/rooming, Provider, Manager
- One-tap stage updates
- Delay reason tagging only when cards are delayed

## Phase 2 included
- Bottleneck detection
- Next-best-action panel
- Provider delay estimates
- Room utilization/status view
- End-of-day report export

## Phase 3 included
- Schedule risk warnings from imported schedule
- Proactive bottleneck alerts
- Suggested operational actions

## Deploy
```bash
yarn install
yarn build
```

## Required Vercel env variables
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_CLINIC_ID=clinicflowiq
VITE_BOARD_ID=today
```

## CSV format
Use a CSV with headers similar to:
```
initials,provider,appointment time,visit type
J.S.,Dr. Matthew Geck,9:00 AM,New patient
A.K.,Dr. Alex Cruz,9:15 AM,Follow-up
```

Use initials or ticket numbers only. Do not upload diagnosis, DOB, MRN, or clinical notes.
