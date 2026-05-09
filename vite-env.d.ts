/// <reference types="vite/client" />

// Augment ImportMetaEnv with the project's VITE_* variables so
// `import.meta.env.VITE_FIREBASE_PROJECT_ID` etc. are typed in TS files.
// Add new VITE_* keys here when they're introduced.
interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_SERVER_URL: string;
    readonly VITE_APP_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
