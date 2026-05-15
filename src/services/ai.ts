import Anthropic from "@anthropic-ai/sdk";
import { format, parse, addDays } from "date-fns";
import { env } from "../config/env.js";
import { generateSlots, resolveRules } from "./booking.js";
import { getAppointmentsForDate, getStaffWithOverrides, bookAppointment } from "./appointment.js";
import type { WhatsAppConfig, ClientSiteConfig, ConversationMessage } from "../types.js";

const anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });

// ── Tool definitions ──────────────────────────────────────────

const bookingTools: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Check available appointment slots for a specific date. Call this when the customer asks about availability, free times, or wants to book. Returns a list of available HH:mm time slots.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format." },
        service_id: { type: "string", description: "Service ID. Omit to use the first/default service." },
        staff_id: { type: "string", description: "Staff member ID. Omit if there is only one staff member." },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment after confirming date, time, service, and customer name. Only call this once the customer has explicitly confirmed all details.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format." },
        time: { type: "string", description: "Time in HH:mm format." },
        service_id: { type: "string", description: "Service ID." },
        staff_id: { type: "string", description: "Staff member ID." },
        customer_name: { type: "string", description: "Customer full name." },
      },
      required: ["date", "time", "service_id", "staff_id", "customer_name"],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────

interface ToolContext {
  clientId: string;
  siteConfig: ClientSiteConfig;
  callerPhone: string;
}

async function executeTool(
  name: string,
  input: Record<string, string>,
  ctx: ToolContext,
): Promise<string> {
  const services = ctx.siteConfig.services ?? [];
  const staffList = ctx.siteConfig.staff ?? [];
  const rules = resolveRules(ctx.siteConfig.businessRules);

  if (name === "check_availability") {
    const dateStr = input.date;
    const date = parse(dateStr, "yyyy-MM-dd", new Date());
    const service = input.service_id
      ? services.find(s => s.id === input.service_id)
      : services[0];
    if (!service) return JSON.stringify({ error: "Servicio no encontrado." });

    const staffId = input.staff_id || staffList[0]?.id;
    const staticStaff = staffList.find(s => s.id === staffId);
    if (!staticStaff) return JSON.stringify({ error: "Profesional no encontrado." });

    const staff = await getStaffWithOverrides(ctx.clientId, staticStaff);
    const appointments = await getAppointmentsForDate(ctx.clientId, staffId, dateStr);
    const slots = generateSlots(date, staff, service.duration, appointments, rules);

    return JSON.stringify({
      date: dateStr,
      staff_name: staff.name,
      service_name: service.name,
      duration: service.duration,
      price: service.price,
      available_slots: slots,
      total: slots.length,
    });
  }

  if (name === "book_appointment") {
    const service = services.find(s => s.id === input.service_id);
    if (!service) return JSON.stringify({ ok: false, error: "Servicio no encontrado." });

    const staticStaff = staffList.find(s => s.id === input.staff_id);
    if (!staticStaff) return JSON.stringify({ ok: false, error: "Profesional no encontrado." });

    const result = await bookAppointment({
      clientId: ctx.clientId,
      staffId: input.staff_id,
      serviceId: input.service_id,
      date: input.date,
      time: input.time,
      duration: service.duration,
      customerName: input.customer_name,
      customerPhone: ctx.callerPhone,
      rules: ctx.siteConfig.businessRules ?? {},
      staff: staticStaff,
    });

    if (result.ok) {
      return JSON.stringify({
        ok: true,
        appointment_id: result.id,
        date: input.date,
        time: input.time,
        service: service.name,
        duration: service.duration,
        staff: staticStaff.name,
        customer: input.customer_name,
        status: rules.autoConfirm ? "confirmed" : "pending",
      });
    }

    return JSON.stringify({ ok: false, error: result.error });
  }

  return JSON.stringify({ error: "Herramienta desconocida." });
}

// ── System prompt builder ─────────────────────────────────────

function buildSystemPrompt(waConfig: WhatsAppConfig, siteConfig: ClientSiteConfig | null): string {
  const brandName = siteConfig?.brand?.name || "el negocio";
  const persona = siteConfig?.brand?.aiPersona || "";
  const contact = siteConfig?.contact;
  const hours = siteConfig?.hours;

  let prompt = waConfig.systemPrompt || buildDefaultPrompt(brandName, waConfig);

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
      (s) => `- ${s.name} (id: ${s.id}) — ${s.duration}min — ${s.price} NIS`
    );
    prompt += `\n\nServicios disponibles:\n${serviceLines.join("\n")}`;
  }

  if (siteConfig?.staff && siteConfig.staff.length > 0) {
    const staffLines = siteConfig.staff.map(
      (s) => `- ${s.name} (id: ${s.id}) — ${s.specialty}`
    );
    prompt += `\n\nProfesionales:\n${staffLines.join("\n")}`;
  }

  const hasBooking = (siteConfig?.staff?.length ?? 0) > 0 && (siteConfig?.services?.length ?? 0) > 0;
  if (hasBooking) {
    const today = format(new Date(), "yyyy-MM-dd");
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    prompt += `\n\n## Reservas de turnos
Tenes herramientas para consultar disponibilidad y reservar turnos.
- Fecha de hoy: ${today}, mañana: ${tomorrow}
- Cuando el cliente quiera reservar, usa check_availability para ver horarios libres
- Siempre confirma servicio, fecha, hora y nombre antes de usar book_appointment
- Si el cliente dice "mañana", "hoy", "el jueves", etc., convertilo a formato YYYY-MM-DD
- Si hay un solo profesional, usalo sin preguntar
- Si hay un solo servicio, usalo sin preguntar
- Presenta los horarios de forma legible, agrupados (ej: "Tenemos horarios desde las 10:00 hasta las 18:00")
- No listes TODOS los horarios, menciona un rango y ofrece que el cliente elija`;
  }

  return prompt;
}

function buildDefaultPrompt(brandName: string, waConfig: WhatsAppConfig): string {
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

// ── Main response generator ───────────────────────────────────

export async function generateResponse(
  message: string,
  history: ConversationMessage[],
  waConfig: WhatsAppConfig,
  siteConfig: ClientSiteConfig | null,
  clientId: string,
  callerPhone: string,
  leadName?: string | null,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(waConfig, siteConfig);

  let contextualPrompt = systemPrompt;
  if (leadName) {
    contextualPrompt += `\n\n## Contexto de esta conversacion\nEsta persona es del negocio: ${leadName}. Ya le construimos una web demo y se la mandamos. Sabes exactamente quien es y de que negocio se trata, no necesitas preguntarle.`;
  }

  const hasBooking = siteConfig && (siteConfig.staff?.length ?? 0) > 0 && (siteConfig.services?.length ?? 0) > 0;
  const tools = hasBooking ? bookingTools : undefined;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  try {
    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: contextualPrompt,
      messages,
      ...(tools ? { tools } : {}),
    });

    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 5) {
      iterations++;
      const assistantContent = response.content;
      const toolBlocks = assistantContent.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolBlocks) {
        console.log(`[ai] Tool call: ${block.name}(${JSON.stringify(block.input)})`);
        const result = await executeTool(
          block.name,
          block.input as Record<string, string>,
          { clientId, siteConfig: siteConfig!, callerPhone },
        );
        console.log(`[ai] Tool result: ${result.slice(0, 200)}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: contextualPrompt,
        messages,
        ...(tools ? { tools } : {}),
      });
    }

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const text = textBlocks.map(b => b.text).join("\n");
    console.log(`[ai] Response generated (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);
    return text || "Perdon, no pude generar una respuesta. Intentá de nuevo.";
  } catch (error) {
    console.error("[ai] Error Claude API:", error);
    return "Perdon, tuve un problema tecnico. Podes intentar de nuevo en unos minutos?";
  }
}
