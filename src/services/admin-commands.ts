import { getDb } from "../config/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import type { WhatsAppConfig } from "../types.js";
import { invalidateConfigCache } from "./client-config.js";

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "").replace(/^whatsapp:/, "");
}

export function isAdmin(phone: string, config: WhatsAppConfig): boolean {
  const normalized = normalizePhone(phone);
  return config.adminPhones.some((admin) => {
    const adminNorm = normalizePhone(admin);
    return normalized === adminNorm || normalized.endsWith(adminNorm.slice(-10));
  });
}

export function isCommand(text: string): boolean {
  return text.trim().startsWith("#");
}

export async function executeCommand(
  text: string,
  clientId: string,
  config: WhatsAppConfig
): Promise<string | null> {
  const lower = text.trim().toLowerCase();
  const db = getDb();
  const configRef = db.collection("whatsapp_config").doc(clientId);

  if (lower === "#volver") {
    await configRef.update({
      "pauseState.paused": false,
      "pauseState.pausedAt": null,
      "pauseState.resumeAt": null,
    });
    invalidateConfigCache(clientId);
    console.log(`[admin] IA reactivada para ${clientId}`);
    return "IA reactivada.";
  }

  if (lower === "#estado") {
    if (config.pauseState.paused && config.pauseState.resumeAt) {
      const resumeAt = new Date(config.pauseState.resumeAt);
      const now = new Date();
      if (resumeAt > now) {
        const minutes = Math.round((resumeAt.getTime() - now.getTime()) / 60000);
        return `IA pausada. Quedan ${minutes} minutos. Manda #volver para reactivar.`;
      }
    }
    return "IA activa, contestando todo.";
  }

  // #lead +972XXXXXXXXX Nombre del Negocio
  const leadMatch = text.trim().match(/^#lead\s+(\+?\d[\d\s-]{7,})\s+(.+)$/i);
  if (leadMatch) {
    const leadPhone = normalizePhone(leadMatch[1]);
    const businessName = leadMatch[2].trim();
    await configRef.update({
      [`leads.${leadPhone}`]: businessName,
    });
    invalidateConfigCache(clientId);
    console.log(`[admin] Lead registrado para ${clientId}: ${leadPhone} -> ${businessName}`);
    return `Lead registrado: ${businessName} (${leadPhone})`;
  }

  if (lower === "#leads") {
    const entries = Object.entries(config.leads || {});
    if (entries.length === 0) return "No hay leads registrados.";
    const lines = entries.map(([phone, name]) => `${name} (${phone})`);
    return `Leads registrados:\n${lines.join("\n")}`;
  }

  // #pausa Xh
  const hoursMatch = lower.match(/^#pausa\s+(\d+)\s*h$/);
  if (hoursMatch) {
    const minutes = parseInt(hoursMatch[1]) * 60;
    const resumeAt = new Date(Date.now() + minutes * 60000).toISOString();
    await configRef.update({
      "pauseState.paused": true,
      "pauseState.pausedAt": FieldValue.serverTimestamp(),
      "pauseState.resumeAt": resumeAt,
    });
    invalidateConfigCache(clientId);
    return `IA pausada por ${hoursMatch[1]} horas. Manda #volver para reactivar.`;
  }

  // #pausa Xm o #pausa X
  const minutesMatch = lower.match(/^#pausa\s+(\d+)\s*m?$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1]);
    const resumeAt = new Date(Date.now() + minutes * 60000).toISOString();
    await configRef.update({
      "pauseState.paused": true,
      "pauseState.pausedAt": FieldValue.serverTimestamp(),
      "pauseState.resumeAt": resumeAt,
    });
    invalidateConfigCache(clientId);
    return `IA pausada por ${minutes} minutos. Manda #volver para reactivar.`;
  }

  // #pausa (sin argumento = 30 minutos)
  if (/^#pausa\s*$/.test(lower)) {
    const resumeAt = new Date(Date.now() + 30 * 60000).toISOString();
    await configRef.update({
      "pauseState.paused": true,
      "pauseState.pausedAt": FieldValue.serverTimestamp(),
      "pauseState.resumeAt": resumeAt,
    });
    invalidateConfigCache(clientId);
    return "IA pausada por 30 minutos. Manda #volver para reactivar.";
  }

  return null;
}

export function isPaused(config: WhatsAppConfig): boolean {
  if (!config.pauseState.paused) return false;
  if (!config.pauseState.resumeAt) return true;

  const resumeAt = new Date(config.pauseState.resumeAt);
  return resumeAt > new Date();
}
