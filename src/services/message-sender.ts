import { env } from "../config/env.js";

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  fromNumber: string
): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Messages.json`;
  const auth = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString("base64");

  const from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
  const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const params = new URLSearchParams({
    From: from,
    To: toFormatted,
    Body: body,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (response.status !== 201) {
      const text = await response.text();
      console.error(`[sender] Error Twilio ${response.status}: ${text}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[sender] Error enviando mensaje:", error);
    return false;
  }
}
