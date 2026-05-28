import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isLiveConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

let db = null;
if (isLiveConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export function boardPath() {
  const clinicId = import.meta.env.VITE_CLINIC_ID || 'clinicflowiq';
  const boardId = import.meta.env.VITE_BOARD_ID || new Date().toISOString().slice(0, 10);
  return { clinicId, boardId };
}

export function subscribeLiveBoard(onData, onError) {
  if (!db) return () => {};
  const { clinicId, boardId } = boardPath();
  const ref = doc(db, 'clinics', clinicId, 'boards', boardId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const payload = snap.data();
      onData(payload?.data || null);
    } else {
      onData(null);
    }
  }, onError);
}

export async function saveLiveBoard(data) {
  if (!db) throw new Error('Firebase is not configured.');
  const { clinicId, boardId } = boardPath();
  const ref = doc(db, 'clinics', clinicId, 'boards', boardId);
  await setDoc(ref, { data, updatedAt: serverTimestamp() }, { merge: true });
}
