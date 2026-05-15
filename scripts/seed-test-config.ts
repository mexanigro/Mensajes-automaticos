/**
 * Script para crear un documento de prueba en whatsapp_config.
 * Ejecutar una sola vez: npx tsx scripts/seed-test-config.ts
 *
 * Requiere las env vars de Firebase configuradas (.env o en el shell).
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, o FIREBASE_PRIVATE_KEY");
  process.exit(1);
}

let cleanKey = privateKey.trim();
if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
  cleanKey = cleanKey.slice(1, -1);
}
cleanKey = cleanKey.replace(/\\n/g, "\n");

const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey: cleanKey };
initializeApp({ credential: cert(serviceAccount) });

const databaseId = process.env.FIREBASE_DATABASE_ID;
const db = databaseId ? getFirestore(databaseId) : getFirestore();
db.settings({ preferRest: true });

// --- CONFIGURACION DE PRUEBA ---
// Cambia estos valores segun tu caso

const CLIENT_ID = "test_arzac";  // El clientId que quieras usar para probar
const TWILIO_PHONE_NUMBER = "+14155238886"; // Tu numero de Twilio sandbox (o real)
const ADMIN_PHONE = "+9720557719141"; // Tu numero personal

const testConfig = {
  clientId: CLIENT_ID,
  enabled: true,
  twilio: {
    phoneNumber: TWILIO_PHONE_NUMBER,
  },
  systemPrompt: `Sos Liam de Arzac Studio. No sos un asistente virtual, no sos un bot, no sos una IA. Sos Liam, una persona real que trabaja en Arzac Studio y contesta por WhatsApp.

Tu tono es profesional, amigable y con energia. Sos alguien que le apasiona lo que hace y se nota.

Arzac Studio es un servicio de suscripcion mensual para negocios locales en Israel. Ofrecemos web profesional personalizada, CRM integrado, chatbot IA 24/7, agente de WhatsApp IA, mantenimiento continuo, hosting y dominio incluidos. Todo por 790 shekels por mes.

Reglas de formato:
- NUNCA uses emojis
- NUNCA uses signos de exclamacion
- Solo usa signo de cierre de pregunta (?)
- Cada mensaje debe ser UN SOLO PARRAFO continuo
- Escribe como una persona real escribe en WhatsApp

Idioma: detecta el idioma del primer mensaje y responde siempre en ese idioma (hebreo, ingles, ruso, español para testing).`,
  personality: {
    tone: "amigable" as const,
    useEmojis: false,
    language: "auto",
  },
  adminPhones: [ADMIN_PHONE],
  pauseState: {
    paused: false,
    pausedAt: null,
    resumeAt: null,
  },
  leads: {} as Record<string, string>,
  updatedAt: FieldValue.serverTimestamp(),
};

async function seed() {
  await db.collection("whatsapp_config").doc(CLIENT_ID).set(testConfig);
  console.log(`whatsapp_config/${CLIENT_ID} creado exitosamente`);
  console.log(`Numero Twilio: ${TWILIO_PHONE_NUMBER}`);
  console.log(`Admin phone: ${ADMIN_PHONE}`);
  console.log("\nAhora configura el webhook de Twilio apuntando a tu URL de Railway/webhook");
}

seed().catch(console.error);
