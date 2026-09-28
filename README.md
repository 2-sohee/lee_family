# LEE_FAMILY

The current frontend remains a vanilla HTML/CSS/JavaScript app. Vite is used
only to produce a predictable `dist/` artifact for Firebase Hosting; the
existing localStorage UI is unchanged.

## Local Firebase setup

1. Create a Firebase project and register a Web app in the Firebase console.
2. Enable **Authentication** (start with the provider needed by the future
   login flow) and **Cloud Firestore**.
3. Copy `.env.example` to `.env.local` and fill in the six Firebase Web app
   configuration values. These `VITE_*` values are public client configuration,
   not admin credentials.
4. Run `npm install` and `npm run dev`.

Firebase integration seams live in `src/firebase.js`, `src/auth.js`, and
`src/familyRepository.js`. They are intentionally separate from the current
localStorage UI so the login and persistence flows can be connected
incrementally. The repository boundary covers family members, ingredients,
schedules, chores, and notices.

## Firestore security

Deploy the included rules with `npx firebase deploy --only firestore:rules`.
The rules require an authenticated user and a corresponding
`familyMembers/{uid}` document, while also allowing users with a custom
`admin: true` or `role: "admin"` token claim. Admin claim changes require the
Firebase Admin SDK or another trusted server; do not put service-account
credentials in the frontend.

## GitHub Actions deployment

The workflow in `.github/workflows/firebase-hosting.yml` builds on pushes to
`main` and deploys `dist/` to Firebase Hosting. Add these repository secrets
under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON service-account key for the project |
| `VITE_FIREBASE_API_KEY` | Firebase Web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web app auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Web app project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Web app storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web app messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web app app ID |

`FIREBASE_SERVICE_ACCOUNT` is deployment-only and must never be committed.
The `.firebaserc.example` file shows the local project alias shape; the real
`.firebaserc` is ignored.
