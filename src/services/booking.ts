import {
  addMinutes,
  addHours,
  format,
  parse,
  startOfDay,
  isBefore,
  isAfter,
  setHours,
  setMinutes,
  getDay,
  isSameDay,
} from "date-fns";
import type {
  Appointment,
  StaffMember,
  WorkDay,
  BusinessRules,
  DateOverride,
} from "../types.js";

const DEFAULTS: Required<BusinessRules> = {
  bufferMinutes: 10,
  maxAdvanceBookingDays: 60,
  minAdvanceBookingHours: 0,
  autoConfirm: true,
};

const SLOT_INTERVAL = 15;
const DEFAULT_DURATION = 30;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function resolveRules(partial?: Partial<BusinessRules>): Required<BusinessRules> {
  return {
    bufferMinutes: typeof partial?.bufferMinutes === "number"
      ? clamp(partial.bufferMinutes, 0, 120) : DEFAULTS.bufferMinutes,
    maxAdvanceBookingDays: typeof partial?.maxAdvanceBookingDays === "number"
      ? clamp(partial.maxAdvanceBookingDays, 1, 365) : DEFAULTS.maxAdvanceBookingDays,
    minAdvanceBookingHours: typeof partial?.minAdvanceBookingHours === "number"
      ? clamp(partial.minAdvanceBookingHours, 0, 168) : DEFAULTS.minAdvanceBookingHours,
    autoConfirm: typeof partial?.autoConfirm === "boolean"
      ? partial.autoConfirm : DEFAULTS.autoConfirm,
  };
}

function parseTime(time: string, date: Date): Date {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(startOfDay(date), h), m);
}

const DAY_KEYS: (keyof StaffMember["schedule"])[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function getWorkDay(date: Date, staff: StaffMember): WorkDay {
  const dateStr = format(date, "yyyy-MM-dd");
  const override: DateOverride | undefined = staff.dateOverrides?.[dateStr];

  if (override?.type === "dayOff") {
    return { isOpen: false, hours: { start: "00:00", end: "00:00" }, breaks: [] };
  }

  const base = staff.schedule[DAY_KEYS[getDay(date)]];

  if (override?.type === "customHours") {
    return { isOpen: true, hours: { start: override.start, end: override.end }, breaks: base.breaks };
  }

  return base;
}

function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return isBefore(s1, e2) && isAfter(e1, s2);
}

export function generateSlots(
  date: Date,
  staff: StaffMember,
  serviceDuration: number,
  existingAppointments: Appointment[],
  rules: Required<BusinessRules>,
): string[] {
  const workDay = getWorkDay(date, staff);
  if (!workDay.isOpen) return [];

  const dateStr = format(date, "yyyy-MM-dd");
  const isBlockedDate = staff.blockedDates?.includes(dateStr);
  if (isBlockedDate) return [];

  const dayStart = parseTime(workDay.hours.start, date);
  const dayEnd = parseTime(workDay.hours.end, date);
  const now = new Date();
  const minBookable = addHours(now, rules.minAdvanceBookingHours);
  const buf = rules.bufferMinutes;

  const slots: string[] = [];
  let cursor = dayStart;

  while (isBefore(cursor, dayEnd)) {
    const slotEnd = addMinutes(cursor, serviceDuration);
    const slotEndBuf = addMinutes(slotEnd, buf);

    const ok =
      !isBefore(cursor, now) &&
      !(isSameDay(date, now) && isBefore(cursor, minBookable)) &&
      !isAfter(slotEnd, dayEnd) &&
      !workDay.breaks.some(b => overlaps(cursor, slotEnd, parseTime(b.start, date), parseTime(b.end, date))) &&
      !existingAppointments.some(app => {
        if (app.date !== dateStr || app.staffId !== staff.id || app.status === "cancelled") return false;
        const aStart = parse(app.time, "HH:mm", startOfDay(date));
        const aEndBuf = addMinutes(aStart, (app.duration || DEFAULT_DURATION) + buf);
        return overlaps(cursor, slotEndBuf, aStart, aEndBuf);
      }) &&
      !staff.blockedSlots?.some(b => {
        if (b.date !== dateStr) return false;
        return overlaps(cursor, slotEnd, parseTime(b.start, date), parseTime(b.end, date));
      });

    if (ok) slots.push(format(cursor, "HH:mm"));
    cursor = addMinutes(cursor, SLOT_INTERVAL);
  }

  return slots;
}

export function checkSlotAvailable(
  date: Date,
  time: string,
  staff: StaffMember,
  serviceDuration: number,
  existingAppointments: Appointment[],
  rules: Required<BusinessRules>,
): { available: boolean; reason?: string } {
  const workDay = getWorkDay(date, staff);
  if (!workDay.isOpen) return { available: false, reason: "Staff is not working this day." };

  const dateStr = format(date, "yyyy-MM-dd");
  if (staff.blockedDates?.includes(dateStr)) return { available: false, reason: "Date is blocked." };

  const now = new Date();
  const slotStart = parseTime(time, date);
  const slotEnd = addMinutes(slotStart, serviceDuration);
  const slotEndBuf = addMinutes(slotEnd, rules.bufferMinutes);
  const dayEnd = parseTime(workDay.hours.end, date);

  if (isSameDay(date, now) && isBefore(slotStart, addHours(now, rules.minAdvanceBookingHours))) {
    return { available: false, reason: "Too close to current time." };
  }
  if (isAfter(slotEnd, dayEnd)) return { available: false, reason: "Exceeds work hours." };

  if (workDay.breaks.some(b => overlaps(slotStart, slotEnd, parseTime(b.start, date), parseTime(b.end, date)))) {
    return { available: false, reason: "Overlaps with break." };
  }

  if (staff.blockedSlots?.some(b => {
    if (b.date !== dateStr) return false;
    return overlaps(slotStart, slotEnd, parseTime(b.start, date), parseTime(b.end, date));
  })) {
    return { available: false, reason: "Slot is blocked." };
  }

  const conflict = existingAppointments.some(app => {
    if (app.date !== dateStr || app.staffId !== staff.id || app.status === "cancelled") return false;
    const aStart = parse(app.time, "HH:mm", startOfDay(date));
    const aEndBuf = addMinutes(aStart, (app.duration || DEFAULT_DURATION) + rules.bufferMinutes);
    return overlaps(slotStart, slotEndBuf, aStart, aEndBuf);
  });

  if (conflict) return { available: false, reason: "Slot already taken." };
  return { available: true };
}
