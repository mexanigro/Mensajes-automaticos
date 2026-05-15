import { getDb } from "../config/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

export async function writeToInbox(
  clientId: string,
  phone: string,
  message: string,
  name?: string
): Promise<void> {
  const db = getDb();
  await db.collection("contact_inbox").add({
    clientId,
    name: name || phone,
    email: "",
    phone,
    subject: "WhatsApp",
    message,
    source: "whatsapp",
    status: "new",
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`[inbox] Mensaje guardado en contact_inbox para ${clientId}`);
}
