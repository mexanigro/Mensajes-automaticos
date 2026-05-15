import { getDb } from "../config/firebase-admin.js";
import type { WhatsAppConfig, ClientSiteConfig } from "../types.js";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL = 60 * 1000; // 60 segundos
const waConfigCache = new Map<string, CacheEntry<WhatsAppConfig>>();
const siteConfigCache = new Map<string, CacheEntry<ClientSiteConfig>>();

export async function getWhatsAppConfig(clientId: string): Promise<WhatsAppConfig | null> {
  const cached = waConfigCache.get(clientId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const db = getDb();
  const doc = await db.collection("whatsapp_config").doc(clientId).get();
  if (!doc.exists) return null;

  const data = doc.data() as WhatsAppConfig;
  waConfigCache.set(clientId, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

export async function getSiteConfig(clientId: string): Promise<ClientSiteConfig | null> {
  const cached = siteConfigCache.get(clientId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const db = getDb();
  const doc = await db.collection("config").doc(clientId).get();
  if (!doc.exists) return null;

  const data = doc.data() as ClientSiteConfig;
  siteConfigCache.set(clientId, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

export function invalidateConfigCache(clientId: string): void {
  waConfigCache.delete(clientId);
  siteConfigCache.delete(clientId);
}
