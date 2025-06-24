import admin from "firebase-admin";

// Initialize Firebase Admin SDK with better error handling
let firebaseInitialized = false;
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  firebaseInitialized = true;
} catch (error) {
  console.warn('Firebase Admin SDK not initialized - running in demo mode:', error.message);
  firebaseInitialized = false;
}

export async function verifyFirebaseToken(idToken: string) {
  try {
    if (!firebaseInitialized) {
      console.warn('Firebase Admin not initialized, cannot verify token');
      throw new Error('Firebase Admin not configured');
    }
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error("Invalid Firebase token");
  }
}

export { admin };
