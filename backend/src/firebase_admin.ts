import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let initialized = false;
let initError: string | null = null;

function serviceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    initError = `invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${String(error)}`;
    return null;
  }
}

export function firebaseAdminConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

export function firebaseAdminStatus() {
  return {
    configured: firebaseAdminConfigured(),
    initialized,
    error: initError,
  };
}

function ensureFirebaseAdmin() {
  if (initialized) return;
  if (!firebaseAdminConfigured()) throw new Error('firebase_admin_not_configured');

  const serviceAccount = serviceAccountFromEnv();
  if (!serviceAccount) throw new Error(initError ?? 'firebase_admin_invalid_config');

  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    }
    initialized = true;
    initError = null;
  } catch (error) {
    initError = String(error);
    throw error;
  }
}

export async function verifyFirebaseIdToken(idToken: string) {
  ensureFirebaseAdmin();
  return getAuth().verifyIdToken(idToken, true);
}
