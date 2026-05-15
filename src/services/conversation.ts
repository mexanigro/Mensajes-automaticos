import { getDb } from "../config/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import type { ConversationMessage, Conversation } from "../types.js";
import { createHash } from "crypto";

const MAX_MESSAGES = 30;

function docId(clientId: string, phone: string): string {
  const hash = createHash("md5").update(phone).digest("hex").slice(0, 8);
  return `${clientId}_${hash}`;
}

export async function getConversation(clientId: string, phone: string): Promise<Conversation | null> {
  const db = getDb();
  const doc = await db.collection("whatsapp_conversations").doc(docId(clientId, phone)).get();
  return doc.exists ? (doc.data() as Conversation) : null;
}

export async function getHistory(clientId: string, phone: string): Promise<ConversationMessage[]> {
  const conv = await getConversation(clientId, phone);
  return conv?.messages || [];
}

export async function appendMessage(
  clientId: string,
  phone: string,
  role: "user" | "assistant",
  content: string,
  leadName?: string | null
): Promise<void> {
  const db = getDb();
  const ref = db.collection("whatsapp_conversations").doc(docId(clientId, phone));
  const doc = await ref.get();

  const msg: ConversationMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  if (doc.exists) {
    const data = doc.data() as Conversation;
    let messages = [...data.messages, msg];
    if (messages.length > MAX_MESSAGES) {
      messages = messages.slice(-MAX_MESSAGES);
    }
    await ref.update({
      messages,
      lastActivity: FieldValue.serverTimestamp(),
      messageCount: (data.messageCount || 0) + 1,
      ...(leadName !== undefined && { leadName }),
    });
  } else {
    const conv: Omit<Conversation, "lastActivity" | "createdAt"> & {
      lastActivity: FieldValue;
      createdAt: FieldValue;
    } = {
      clientId,
      phone,
      messages: [msg],
      lastActivity: FieldValue.serverTimestamp(),
      leadName: leadName || null,
      messageCount: 1,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(conv);
  }
}
