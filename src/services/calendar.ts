import { getDb } from "../config/firebase-admin.js";
import { env } from "../config/env.js";

interface CalendarConfig {
  clientId: string;
  enabled: boolean;
  calendarId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
}

interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function getCalendarConfig(clientId: string): Promise<CalendarConfig | null> {
  const db = getDb();
  const doc = await db.collection("calendar_config").doc(clientId).get();
  if (!doc.exists) return null;
  const data = doc.data() as CalendarConfig;
  if (!data.enabled || !data.refreshToken) return null;
  return data;
}

async function refreshIfNeeded(config: CalendarConfig): Promise<string> {
  if (Date.now() < config.tokenExpiry - 60_000) {
    return config.accessToken;
  }

  const clientId = env.google?.clientId;
  const clientSecret = env.google?.clientSecret;
  if (!clientId || !clientSecret) {
    console.warn("[calendar] Google OAuth credentials not configured, skipping refresh");
    return config.accessToken;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[calendar] Token refresh failed:", await res.text());
      return config.accessToken;
    }

    const tokens = await res.json();
    const newExpiry = Date.now() + (tokens.expires_in ?? 3600) * 1000;

    const db = getDb();
    await db.collection("calendar_config").doc(config.clientId).update({
      accessToken: tokens.access_token,
      tokenExpiry: newExpiry,
    });

    return tokens.access_token;
  } catch (err) {
    console.error("[calendar] Token refresh error:", err);
    return config.accessToken;
  }
}

export async function createCalendarEvent(
  clientId: string,
  appointment: {
    date: string;
    time: string;
    duration: number;
    customerName: string;
    customerPhone: string;
    serviceName: string;
    staffName: string;
  },
): Promise<string | null> {
  const config = await getCalendarConfig(clientId);
  if (!config) return null;

  const accessToken = await refreshIfNeeded(config);
  const calendarId = config.calendarId || "primary";

  const startDateTime = `${appointment.date}T${appointment.time}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + appointment.duration * 60_000);
  const endTime = endDate.toISOString().replace("Z", "");

  const event: CalendarEvent = {
    summary: `${appointment.serviceName} - ${appointment.customerName}`,
    description: `Cliente: ${appointment.customerName}\nTelefono: ${appointment.customerPhone}\nServicio: ${appointment.serviceName}\nProfesional: ${appointment.staffName}\nDuracion: ${appointment.duration}min\n\nReservado via WhatsApp`,
    start: { dateTime: startDateTime, timeZone: "Asia/Jerusalem" },
    end: { dateTime: endTime, timeZone: "Asia/Jerusalem" },
  };

  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );

    if (!res.ok) {
      console.error("[calendar] Create event failed:", await res.text());
      return null;
    }

    const created = await res.json();
    console.log(`[calendar] Event created for ${clientId}: ${created.id}`);
    return created.id as string;
  } catch (err) {
    console.error("[calendar] Create event error:", err);
    return null;
  }
}
