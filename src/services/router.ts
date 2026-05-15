import { getDb } from "../config/firebase-admin.js";
import type { WhatsAppConfig } from "../types.js";

interface CacheEntry {
  data: Map<string, string>;
  expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let routeCache: CacheEntry | null = null;

function normalizePhone(phone: string): string {
  return phone.replace(/^whatsapp:/, "").replace(/[\s-]/g, "");
}

async function loadRouteMap(): Promise<Map<string, string>> {
  if (routeCache && Date.now() < routeCache.expiresAt) {
    return routeCache.data;
  }

  const db = getDb();
  const snapshot = await db
    .collection("whatsapp_config")
    .where("enabled", "==", true)
    .get();

  const map = new Map<string, string>();
  snapshot.forEach((doc) => {
    const data = doc.data() as WhatsAppConfig;
    const phone = normalizePhone(data.twilio.phoneNumber);
    map.set(phone, data.clientId);
  });

  routeCache = { data: map, expiresAt: Date.now() + CACHE_TTL };
  console.log(`[router] Ruta cargada: ${map.size} clientes activos`);
  return map;
}

export async function resolveClientId(twilioTo: string): Promise<string | null> {
  const normalized = normalizePhone(twilioTo);
  const map = await loadRouteMap();
  return map.get(normalized) || null;
}

export function invalidateRouteCache(): void {
  routeCache = null;
}
