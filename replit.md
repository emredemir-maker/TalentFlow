# TalentFlow - AI-Powered HR Dashboard & ATS

## Project Overview
TalentFlow is an AI-powered Strategic Human Resources Dashboard and Applicant Tracking System (ATS). It automates modern recruitment processes using Google Gemini AI with features like AI STAR Analysis, automated interview planning, live interview support with real-time transcription, and HUD-style analytics.

## Tech Stack

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4.x (via `@tailwindcss/vite` plugin)
- **State Management**: React Context API
- **Routing**: React Router DOM 7
- **Charts**: Recharts
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express 5
- **AI**: Google Generative AI (`@google/generative-ai`) - Gemini Flash/Pro
- **PDF Parsing**: pdf-parse, pdfjs-dist
- **DOCX Parsing**: Mammoth
- **Web Scraping**: Puppeteer
- **Email**: Nodemailer
- **Security**: Helmet, express-rate-limit, xss-clean, hpp

### Cloud Services
- **Database**: Firebase Firestore (real-time)
- **Auth**: Firebase Auth (Email/Password + Google OAuth)
- **Storage**: Firebase Storage
- **Backend Admin**: Firebase Admin SDK

## Project Structure
```
TalentFlow/
├── src/                   # Frontend source code
│   ├── components/        # Reusable UI components
│   ├── config/            # Firebase config, position data
│   ├── context/           # Auth, Candidates, Notifications contexts
│   ├── pages/             # Route-level pages (Dashboard, Analytics, etc.)
│   ├── services/          # AI logic, Firestore interactions, CV parsing
│   ├── App.jsx            # Main app component with routing
│   └── main.jsx           # Entry point
├── functions/             # Firebase Cloud Functions
├── public/                # Static assets
├── server.js              # Express backend (port 3001)
├── vite.config.js         # Vite config (port 5000, proxy /api -> 3001)
└── package.json
```

## Running the App

### Development
```bash
npm run dev
```
Runs both Vite (port 5000) and Express backend (port 3001) concurrently.

### Workflow
- **Start application**: `npm run dev` — webview on port 5000

## Environment Variables Required
Copy `.env.example` to `.env` and fill in:
- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID
- `VITE_GEMINI_API_KEY` - Google Gemini AI API key
- `EMAIL_USER` - Gmail account for sending emails
- `EMAIL_PASS` - Gmail app password

## Deployment
- **Target**: Autoscale
- **Build**: `npm run build`
- **Run**: `bash -c "node server.js & npx vite preview --port 5000 --host 0.0.0.0"`

## Package Manager
npm (with package-lock.json)

## Live Interview System Notes

### Candidate Flow (Anonymous Users)
- Candidates join via `/join/:sessionId` — they authenticate anonymously via Firebase Auth
- Anonymous users **cannot read Firestore** (rules don't allow it), so `candidateData` from the CandidatesContext may be null
- To handle this, `LiveInterviewPage` polls `GET /api/session/:sessionId` every 3 seconds — the server uses Firebase Admin SDK (bypasses auth rules) to fetch and return session status and only the questions marked `visibleToCandidate: true`
- The `apiSession` state stores this polled data; `effectiveSession = session || apiSession` is used throughout the lifecycle effects

### API Calls
- All frontend-to-backend API calls must use **relative URLs** (e.g., `/api/gemini-stt`) — NOT `http://localhost:3001/...`
- Vite proxy routes `/api/*` → `http://localhost:3001/api/*` (see `vite.config.js`)
- `VITE_SERVER_URL` env var is optional; the default is `''` (empty string = relative URL)

### Question Visibility
- Questions in Firestore have a `visibleToCandidate` boolean field
- Recruiters see ALL questions; candidates only see questions explicitly sent to them via "ADAYA GÖNDER"
- The polling endpoint (`GET /api/session/:sessionId`) filters questions server-side before returning to candidates
