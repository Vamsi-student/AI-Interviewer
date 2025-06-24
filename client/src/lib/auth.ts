import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

export const signInWithEmail = async (email: string, password: string) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string) => {
  return await createUserWithEmailAndPassword(auth, email, password);
};

export const signInWithGoogle = async () => {
  return await signInWithRedirect(auth, googleProvider);
};

export const handleRedirectResult = async () => {
  return await getRedirectResult(auth);
};

export const signOut = async () => {
  return await firebaseSignOut(auth);
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  if (!auth) {
    // Return a no-op unsubscribe function for demo mode
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

export const getAuthToken = async () => {
  if (!auth || !auth.currentUser) {
    return null;
  }
  return await auth.currentUser.getIdToken();
};
