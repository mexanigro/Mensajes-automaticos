import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { env } from "./env.js";

let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (_db) return _db;

  if (getApps().length === 0) {
    let cleanKey = env.firebase.privateKey.trim();
    if (
      (cleanKey.startsWith('"') && cleanKey.endsWith('"')) ||
      (cleanKey.startsWith("'") && cleanKey.endsWith("'"))
    ) {
      cleanKey = cleanKey.slice(1, -1);
    }
    cleanKey = cleanKey.replace(/\\n/g, "\n");

    const serviceAccount: ServiceAccount = {
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: cleanKey,
    };
    initializeApp({ credential: cert(serviceAccount) });
  }

  _db = env.firebase.databaseId
    ? getFirestore(env.firebase.databaseId)
    : getFirestore();
  _db.settings({ preferRest: true });

  return _db;
}
