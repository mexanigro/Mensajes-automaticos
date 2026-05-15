export interface TwilioConfig {
  phoneNumber: string;
}

export interface Personality {
  tone: "profesional" | "amigable" | "calido";
  useEmojis: boolean;
  language: string;
}

export interface PauseState {
  paused: boolean;
  pausedAt: string | null;
  resumeAt: string | null;
}

export interface WhatsAppConfig {
  clientId: string;
  enabled: boolean;
  twilio: TwilioConfig;
  systemPrompt: string;
  personality: Personality;
  adminPhones: string[];
  pauseState: PauseState;
  leads: Record<string, string>;
  updatedAt: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Conversation {
  clientId: string;
  phone: string;
  messages: ConversationMessage[];
  lastActivity: string;
  leadName: string | null;
  messageCount: number;
  createdAt: string;
}

export interface ClientSiteConfig {
  brand?: {
    name?: string;
    tagline?: string;
    aiPersona?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    street?: string;
    city?: string;
  };
  hours?: Record<string, { open: string; close: string } | null>;
  features?: Record<string, boolean>;
  services?: Array<{
    id: string;
    name: string;
    price: number;
    duration: number;
    description?: string;
  }>;
}

export interface IncomingMessage {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

export interface MessageFragment {
  text: string;
  delay: number;
}
