import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import type { WhatsAppConfig, ClientSiteConfig, ConversationMessage } from "../types.js";

const client = new Anthropic({ apiKey: env.anthropic.apiKey });

function buildSystemPrompt(waConfig: WhatsAppConfig, siteConfig: ClientSiteConfig | null): string {
  const brandName = siteConfig?.brand?.name || "el negocio";
  const persona = siteConfig?.brand?.aiPersona || "";
  const contact = siteConfig?.contact;
  const hours = siteConfig?.hours;

  let prompt = waConfig.systemPrompt || buildDefaultPrompt(brandName, waConfig, siteConfig);

  if (persona && !waConfig.systemPrompt) {
    prompt += `\n\nPersonalidad adicional del negocio: ${persona}`;
  }

  if (contact) {
    const parts: string[] = [];
    if (contact.phone) parts.push(`Telefono: ${contact.phone}`);
    if (contact.email) parts.push(`Email: ${contact.email}`);
    if (contact.street) parts.push(`Direccion: ${contact.street}${contact.city ? `, ${contact.city}` : ""}`);
    if (parts.length > 0) {
      prompt += `\n\nDatos de contacto del negocio:\n${parts.join("\n")}`;
    }
  }

  if (hours) {
    const dayNames: Record<string, string> = {
      sunday: "Domingo", monday: "Lunes", tuesday: "Martes",
      wednesday: "Miercoles", thursday: "Jueves", friday: "Viernes", saturday: "Sabado",
    };
    const lines = Object.entries(hours)
      .map(([day, h]) => {
        const name = dayNames[day] || day;
        return h ? `${name}: ${h.open} - ${h.close}` : `${name}: Cerrado`;
      });
    if (lines.length > 0) {
      prompt += `\n\nHorario de atencion:\n${lines.join("\n")}`;
    }
  }

  if (siteConfig?.services && siteConfig.services.length > 0) {
    const serviceLines = siteConfig.services.map(
      (s) => `${s.name} — ${s.duration}min — ${s.price} NIS`
    );
    prompt += `\n\nServicios disponibles:\n${serviceLines.join("\n")}`;
  }

  return prompt;
}

function buildDefaultPrompt(
  brandName: string,
  waConfig: WhatsAppConfig,
  _siteConfig: ClientSiteConfig | null
): string {
  const tone = waConfig.personality.tone === "calido"
    ? "calido, cercano y con buena onda pero siempre profesional"
    : waConfig.personality.tone === "amigable"
      ? "amigable, accesible y con buena energia"
      : "profesional, serio y confiable";

  const emojiRule = waConfig.personality.useEmojis
    ? "Podes usar emojis con moderacion."
    : "NUNCA uses emojis. Ni uno. Cero emojis en ningun mensaje.";

  return `Sos el asistente de ${brandName} y contestas por WhatsApp. No sos un bot ni una IA, sos una persona real que trabaja en ${brandName}.

## Tu personalidad
- Tu tono es ${tone}
- Tus respuestas tienen sustancia, no son secas ni genericas
- Cuando alguien te escribe, siempre mostras interes genuino
- Explicas las cosas con naturalidad

## Reglas de formato
- ${emojiRule}
- Cada mensaje debe ser UN SOLO PARRAFO continuo, sin saltos de linea dentro del mensaje
- Si necesitas expresar dos ideas separadas, separalas con \\n\\n para que el sistema las envie como mensajes separados
- NUNCA uses formato markdown (negritas, listas, asteriscos, guiones)
- NUNCA uses numeracion ni vinetas
- Escribi como una persona real escribe en WhatsApp: texto corrido, natural, sin formato especial

## Reglas de comportamiento
- Si no sabes algo: "No tengo ese dato ahora, pero lo averiguo y te cuento."
- NUNCA inventes informacion
- NUNCA compartas precios o datos que no esten en tu informacion base
- Si el cliente parece frustrado, mostra empatia antes de resolver

## Idioma
- Detecta el idioma del primer mensaje del cliente y responde SIEMPRE en ese mismo idioma
- Idiomas principales: hebreo (coloquial israeli), ingles, ruso
- NUNCA mezcles idiomas en una misma respuesta`;
}

export async function generateResponse(
  message: string,
  history: ConversationMessage[],
  waConfig: WhatsAppConfig,
  siteConfig: ClientSiteConfig | null,
  leadName?: string | null
): Promise<string> {
  const systemPrompt = buildSystemPrompt(waConfig, siteConfig);

  let contextualPrompt = systemPrompt;
  if (leadName) {
    contextualPrompt += `\n\n## Contexto de esta conversacion\nEsta persona es del negocio: ${leadName}. Ya le construimos una web demo y se la mandamos. Sabes exactamente quien es y de que negocio se trata, no necesitas preguntarle. Usa el nombre del negocio de forma natural en la conversacion.`;
  }

  const messages = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: contextualPrompt,
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    console.log(`[ai] Respuesta generada (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);
    return text;
  } catch (error) {
    console.error("[ai] Error Claude API:", error);
    return "Perdon, tuve un problema tecnico. Podes intentar de nuevo en unos minutos?";
  }
}
