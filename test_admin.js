import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();
try {
    admin.initializeApp();
    console.log("Firebase Admin Initialized Successfully");
    process.exit(0);
} catch (err) {
    console.error("Firebase Admin Initialization Failed:", err.message);
    process.exit(1);
}
