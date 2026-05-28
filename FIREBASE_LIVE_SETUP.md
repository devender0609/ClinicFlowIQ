# Firebase Live Setup

1. Create a Firebase project.
2. Add a Web App.
3. Enable Firestore Database.
4. Copy Firebase web config values into Vercel environment variables.
5. Redeploy without build cache.
6. Open the deployed URL and click **Create today's live board**.

This creates an empty live board in Firestore. There are no demo patients or seeded sample visits.

Recommended development Firestore path:
`clinics/{VITE_CLINIC_ID}/boards/{VITE_BOARD_ID}`

For real clinic use, add Firebase Authentication and rules that restrict access to clinic staff.
