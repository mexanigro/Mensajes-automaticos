import type { Request, Response } from "express";
import { resolveClientId } from "../services/router.js";
import { getWhatsAppConfig, getSiteConfig } from "../services/client-config.js";
import { getHistory, appendMessage } from "../services/conversation.js";
import { generateResponse } from "../services/ai.js";
import { sendWhatsAppMessage } from "../services/message-sender.js";
import { calculateDelay, interFragmentDelay, sleep } from "../services/typing-delay.js";
import { fragmentMessage } from "../services/fragmentation.js";
import { writeToInbox } from "../services/inbox-writer.js";
import { isAdmin, isCommand, executeCommand, isPaused } from "../services/admin-commands.js";

const processedMessages = new Set<string>();
const DEDUP_TTL = 10 * 60 * 1000; // 10 minutos

function normalizePhone(phone: string): string {
  return phone.replace(/^whatsapp:/, "").replace(/[\s-]/g, "");
}

export async function handleTwilioWebhook(req: Request, res: Response): Promise<void> {
  res.status(200).type("text/xml").send("<Response></Response>");

  const body = req.body;
  const messageSid = body.MessageSid;
  const from = normalizePhone(body.From || "");
  const to = normalizePhone(body.To || "");
  const text = (body.Body || "").trim();

  if (!text || !from || !to) return;

  if (processedMessages.has(messageSid)) return;
  processedMessages.add(messageSid);
  setTimeout(() => processedMessages.delete(messageSid), DEDUP_TTL);

  try {
    const clientId = await resolveClientId(to);
    if (!clientId) {
      console.warn(`[webhook] Numero ${to} no asociado a ningun cliente`);
      return;
    }

    const waConfig = await getWhatsAppConfig(clientId);
    if (!waConfig || !waConfig.enabled) {
      console.warn(`[webhook] WhatsApp deshabilitado para ${clientId}`);
      return;
    }

    console.log(`[webhook] Mensaje de ${from} para ${clientId}: ${text}`);

    if (isAdmin(from, waConfig) && isCommand(text)) {
      const response = await executeCommand(text, clientId, waConfig);
      if (response) {
        await sendWhatsAppMessage(from, response, waConfig.twilio.phoneNumber);
        console.log(`[webhook] Comando admin ejecutado: ${text} -> ${response}`);
      }
      return;
    }

    if (isPaused(waConfig)) {
      console.log(`[webhook] IA pausada para ${clientId}, ignorando mensaje de ${from}`);
      return;
    }

    const history = await getHistory(clientId, from);
    const siteConfig = await getSiteConfig(clientId);

    const leadName = waConfig.leads?.[from] || null;

    const response = await generateResponse(text, history, waConfig, siteConfig, leadName);

    await appendMessage(clientId, from, "user", text, leadName);
    await appendMessage(clientId, from, "assistant", response);

    await writeToInbox(clientId, from, text, leadName || undefined);

    const fragments = fragmentMessage(response);
    for (let i = 0; i < fragments.length; i++) {
      const delay = calculateDelay(fragments[i]);
      console.log(`[webhook] Simulando escritura: ${delay.toFixed(1)}s para ${fragments[i].length} chars`);
      await sleep(delay);

      await sendWhatsAppMessage(from, fragments[i], waConfig.twilio.phoneNumber);

      if (i < fragments.length - 1) {
        const pause = interFragmentDelay();
        console.log(`[webhook] Pausa entre fragmentos: ${pause.toFixed(1)}s`);
        await sleep(pause);
      }
    }

    console.log(`[webhook] Respuesta enviada a ${from} (${clientId}): ${response.slice(0, 100)}...`);
  } catch (error) {
    console.error(`[webhook] Error procesando mensaje:`, error);
  }
}
