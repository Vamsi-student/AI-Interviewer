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
  if (error instanceof Error) {
    console.warn('Firebase Admin SDK not initialized - running in demo mode:', error.message);
  } else {
    console.warn('Firebase Admin SDK not initialized - running in demo mode:', String(error));
  }
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
    if (error instanceof Error) {
      console.error('Token verification failed:', error.message);
    } else {
      console.error('Token verification failed:', String(error));
    }
    throw new Error("Invalid Firebase token");
  }
}

export { admin };
