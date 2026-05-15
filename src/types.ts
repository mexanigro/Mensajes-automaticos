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
  staff?: StaffMember[];
  businessRules?: Partial<BusinessRules>;
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

// ── Booking types ──────────────────────────────────────────────

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

export interface SessionBreak extends TimeRange {
  label: string;
}

export interface WorkDay {
  isOpen: boolean;
  hours: TimeRange;
  breaks: SessionBreak[];
}

export interface WeeklySchedule {
  monday: WorkDay;
  tuesday: WorkDay;
  wednesday: WorkDay;
  thursday: WorkDay;
  friday: WorkDay;
  saturday: WorkDay;
  sunday: WorkDay;
}

export interface BlockedSlot {
  id: string;
  date: string;
  start: string;
  end: string;
  reason: string;
}

export type DateOverride =
  | { type: "dayOff" }
  | { type: "customHours"; start: string; end: string };

export interface StaffMember {
  id: string;
  slug: string;
  name: string;
  photoUrl: string;
  specialty: string;
  bio: string;
  portfolio: string[];
  schedule: WeeklySchedule;
  blockedDates?: string[];
  blockedSlots?: BlockedSlot[];
  dateOverrides?: Record<string, DateOverride>;
}

export type AppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed" | "expired";

export interface Appointment {
  id: string;
  clientId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string;
  staffId: string;
  date: string;
  time: string;
  duration: number;
  status: AppointmentStatus;
  createdAt: Date;
}

export interface BusinessRules {
  bufferMinutes: number;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
  autoConfirm: boolean;
}
