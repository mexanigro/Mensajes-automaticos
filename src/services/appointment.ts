import { getDb } from "../config/firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";
import { format, parse, startOfDay, addMinutes, setHours, setMinutes, isBefore, isAfter } from "date-fns";
import { checkSlotAvailable, resolveRules } from "./booking.js";
import { createCalendarEvent } from "./calendar.js";
import type { Appointment, StaffMember, BusinessRules } from "../types.js";

export async function getAppointmentsForDate(
  clientId: string,
  staffId: string,
  dateStr: string,
): Promise<Appointment[]> {
  const db = getDb();
  const snap = await db.collection("appointments")
    .where("clientId", "==", clientId)
    .where("staffId", "==", staffId)
    .where("date", "==", dateStr)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
}

export async function getStaffWithOverrides(
  clientId: string,
  staticStaff: StaffMember,
): Promise<StaffMember> {
  const db = getDb();
  const doc = await db.collection("staff_overrides").doc(`${clientId}_${staticStaff.id}`).get();
  if (!doc.exists) return staticStaff;

  const data = doc.data()!;
  return {
    ...staticStaff,
    schedule: data.schedule ?? staticStaff.schedule,
    blockedDates: data.blockedDates ?? staticStaff.blockedDates ?? [],
    blockedSlots: data.blockedSlots ?? staticStaff.blockedSlots ?? [],
    dateOverrides: data.dateOverrides ?? staticStaff.dateOverrides ?? {},
  };
}

function parseTime(time: string, date: Date): Date {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(startOfDay(date), h), m);
}

function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return isBefore(s1, e2) && isAfter(e1, s2);
}

export interface BookAppointmentInput {
  clientId: string;
  staffId: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rules: Partial<BusinessRules>;
  staff: StaffMember;
  serviceName?: string;
}

export async function bookAppointment(input: BookAppointmentInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = getDb();
  const rules = resolveRules(input.rules);

  try {
    const appointmentId = await db.runTransaction(async (tx) => {
      const manifestId = `${input.clientId}_${input.staffId}_${input.date}`;
      const manifestRef = db.collection("daily_manifests").doc(manifestId);
      const manifestSnap = await tx.get(manifestRef);
      const intervals: { start: string; end: string }[] = manifestSnap.exists
        ? (manifestSnap.data()?.intervals ?? [])
        : [];

      const date = parse(input.date, "yyyy-MM-dd", new Date());
      const slotStart = parseTime(input.time, date);
      const slotEndBuf = addMinutes(slotStart, input.duration + rules.bufferMinutes);

      const conflict = intervals.some(inv => {
        const invStart = parseTime(inv.start, date);
        const invEnd = parseTime(inv.end, date);
        return overlaps(slotStart, slotEndBuf, invStart, invEnd);
      });

      if (conflict) throw new Error("Este horario ya no esta disponible. Por favor elegí otro.");

      const overriddenStaff = await getStaffWithOverrides(input.clientId, input.staff);
      const validation = checkSlotAvailable(date, input.time, overriddenStaff, input.duration, [], rules);
      if (!validation.available) throw new Error(validation.reason || "Horario no disponible.");

      const appointmentRef = db.collection("appointments").doc();
      tx.set(appointmentRef, {
        clientId: input.clientId,
        customerName: input.customerName,
        customerEmail: input.customerEmail || "",
        customerPhone: input.customerPhone,
        serviceId: input.serviceId,
        staffId: input.staffId,
        date: input.date,
        time: input.time,
        duration: input.duration,
        status: rules.autoConfirm ? "confirmed" : "pending",
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(manifestRef, {
        clientId: input.clientId,
        intervals: [...intervals, { start: input.time, end: format(slotEndBuf, "HH:mm") }],
      }, { merge: true });

      return appointmentRef.id;
    });

    upsertCustomer(input.clientId, input.customerName, input.customerPhone, input.customerEmail)
      .catch(err => console.warn("[appointment] customer upsert failed (non-fatal):", err));

    createCalendarEvent(input.clientId, {
      date: input.date,
      time: input.time,
      duration: input.duration,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      serviceName: input.serviceName || input.serviceId,
      staffName: input.staff.name,
    }).catch(err => console.warn("[appointment] calendar sync failed (non-fatal):", err));

    return { ok: true, id: appointmentId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al reservar";
    console.error("[appointment] booking failed:", msg);
    return { ok: false, error: msg };
  }
}

async function upsertCustomer(clientId: string, name: string, phone: string, email?: string): Promise<void> {
  const db = getDb();
  const existing = await db.collection("customers")
    .where("clientId", "==", clientId)
    .where("phone", "==", phone)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({
      fullName: name,
      ...(email ? { email } : {}),
      lastVisitAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      visitCount: FieldValue.increment(1),
    });
  } else {
    await db.collection("customers").add({
      clientId,
      fullName: name,
      phone,
      email: email || "",
      source: "whatsapp",
      visitCount: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
