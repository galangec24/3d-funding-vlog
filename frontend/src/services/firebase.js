import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);

// Get paragraph content
export const getParagraph = async () => {
  const docRef = doc(db, 'siteContent', 'mainParagraph');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().text;
  }
  return "Welcome to FutureFund — where visionary founders meet exponential capital. Our AI-driven funding ecosystem accelerates growth from seed to scale. Join our vlog community and unlock tailored financial solutions.";
};

// Update paragraph (admin only)
export const updateParagraph = async (newText) => {
  const docRef = doc(db, 'siteContent', 'mainParagraph');
  await updateDoc(docRef, { text: newText });
};

// Subscribe to real-time paragraph updates
export const subscribeToParagraph = (callback) => {
  const docRef = doc(db, 'siteContent', 'mainParagraph');
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().text);
    }
  });
};

// Initialize default paragraph if not exists
export const initParagraph = async () => {
  const docRef = doc(db, 'siteContent', 'mainParagraph');
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    await setDoc(docRef, { 
      text: "Welcome to FutureFund — where visionary founders meet exponential capital. Our AI-driven funding ecosystem accelerates growth from seed to scale. Join our vlog community and unlock tailored financial solutions." 
    });
  }
};

// Admin authentication
export const adminLogin = async (email, password) => {
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  if (userCred.user.email !== 'admin@funding.com') {
    await signOut(auth);
    throw new Error('Unauthorized: Admin access only');
  }
  return userCred.user;
};

export const adminLogout = async () => {
  await signOut(auth);
};

// Get Firebase Hosting info
export const getHostingInfo = () => {
  return {
    platform: 'Firebase Hosting',
    domain: 'web.app',
    projectId: firebaseConfig.projectId,
    url: `https://${firebaseConfig.projectId}.web.app`
  };
};