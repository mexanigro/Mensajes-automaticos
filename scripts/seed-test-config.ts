/**
 * Script para crear un documento de prueba en whatsapp_config.
 * Ejecutar una sola vez: npx tsx scripts/seed-test-config.ts
 *
 * Requiere las env vars de Firebase configuradas (.env o en el shell).
 */

import "dotenv/config";
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

const testSiteConfig = {
  brand: {
    name: "Arzac Studio",
    tagline: "Webs profesionales para negocios locales",
    aiPersona: "Liam de Arzac Studio, apasionado por la tecnologia y los negocios locales",
  },
  contact: {
    phone: "+972557719141",
    email: "liam@arzacstudio.com",
    city: "Israel",
  },
  hours: {
    sunday: { open: "09:00", close: "18:00" },
    monday: { open: "09:00", close: "18:00" },
    tuesday: { open: "09:00", close: "18:00" },
    wednesday: { open: "09:00", close: "18:00" },
    thursday: { open: "09:00", close: "18:00" },
    friday: { open: "09:00", close: "14:00" },
    saturday: null,
  },
  services: [
    { id: "consulta", name: "Consulta inicial", price: 0, duration: 30, description: "Reunion para conocer el negocio" },
    { id: "demo", name: "Demo web personalizada", price: 0, duration: 45, description: "Presentacion de la web demo" },
    { id: "onboarding", name: "Onboarding completo", price: 790, duration: 60, description: "Configuracion inicial del servicio" },
  ],
  staff: [
    {
      id: "liam",
      slug: "liam",
      name: "Liam",
      photoUrl: "",
      specialty: "Consultor",
      bio: "Fundador de Arzac Studio",
      portfolio: [],
      schedule: {
        sunday: { isOpen: true, hours: { start: "09:00", end: "18:00" }, breaks: [{ label: "Almuerzo", start: "13:00", end: "14:00" }] },
        monday: { isOpen: true, hours: { start: "09:00", end: "18:00" }, breaks: [{ label: "Almuerzo", start: "13:00", end: "14:00" }] },
        tuesday: { isOpen: true, hours: { start: "09:00", end: "18:00" }, breaks: [{ label: "Almuerzo", start: "13:00", end: "14:00" }] },
        wednesday: { isOpen: true, hours: { start: "09:00", end: "18:00" }, breaks: [{ label: "Almuerzo", start: "13:00", end: "14:00" }] },
        thursday: { isOpen: true, hours: { start: "09:00", end: "18:00" }, breaks: [{ label: "Almuerzo", start: "13:00", end: "14:00" }] },
        friday: { isOpen: true, hours: { start: "09:00", end: "14:00" }, breaks: [] },
        saturday: { isOpen: false, hours: { start: "00:00", end: "00:00" }, breaks: [] },
      },
      blockedDates: [],
      blockedSlots: [],
    },
  ],
  businessRules: {
    bufferMinutes: 10,
    maxAdvanceBookingDays: 60,
    minAdvanceBookingHours: 1,
    autoConfirm: true,
  },
};

async function seed() {
  await db.collection("whatsapp_config").doc(CLIENT_ID).set(testConfig);
  console.log(`whatsapp_config/${CLIENT_ID} creado`);

  await db.collection("config").doc(CLIENT_ID).set(testSiteConfig, { merge: true });
  console.log(`config/${CLIENT_ID} actualizado con staff + services`);

  console.log(`Numero Twilio: ${TWILIO_PHONE_NUMBER}`);
  console.log(`Admin phone: ${ADMIN_PHONE}`);
}

seed().catch(console.error);
