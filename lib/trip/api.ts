// lib/trip/api.ts
import type {
  Trip, ManifestPeserta, TripNote, TripPayment, PaymentSchedule, LabaResult,
} from "@/types/trip";

const BASE = process.env.NEXT_PUBLIC_TRIP_API_URL ?? "http://localhost:8080";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Trips ──────────────────────────────────────────────────────────────────────
export const tripApi = {
  list: (status?: string) =>
    req<Trip[]>(`/api/trips${status ? `?status=${status}` : ""}`),
  get: (id: string) => req<Trip>(`/api/trips/${id}`),
  create: (body: Partial<Trip>) =>
    req<Trip>("/api/trips", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Trip>) =>
    req<Trip>(`/api/trips/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id: string) =>
    req<void>(`/api/trips/${id}`, { method: "DELETE" }),
};

// ── Peserta ────────────────────────────────────────────────────────────────────
export const pesertaApi = {
  list: (tripId: string) => req<ManifestPeserta[]>(`/api/trips/${tripId}/peserta`),
  create: (tripId: string, body: Partial<ManifestPeserta>) =>
    req<ManifestPeserta>(`/api/trips/${tripId}/peserta`, {
      method: "POST", body: JSON.stringify(body),
    }),
  update: (tripId: string, pid: string, body: Partial<ManifestPeserta>) =>
    req<void>(`/api/trips/${tripId}/peserta/${pid}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  delete: (tripId: string, pid: string) =>
    req<void>(`/api/trips/${tripId}/peserta/${pid}`, { method: "DELETE" }),
};

// ── Notes ──────────────────────────────────────────────────────────────────────
export const notesApi = {
  list: (tripId: string) => req<TripNote[]>(`/api/trips/${tripId}/notes`),
  create: (tripId: string, content: string) =>
    req<TripNote>(`/api/trips/${tripId}/notes`, {
      method: "POST", body: JSON.stringify({ content }),
    }),
  update: (tripId: string, nid: string, content: string) =>
    req<void>(`/api/trips/${tripId}/notes/${nid}`, {
      method: "PUT", body: JSON.stringify({ content }),
    }),
  delete: (tripId: string, nid: string) =>
    req<void>(`/api/trips/${tripId}/notes/${nid}`, { method: "DELETE" }),
};

// ── Payments ───────────────────────────────────────────────────────────────────
export const paymentsApi = {
  list: (tripId: string) => req<TripPayment[]>(`/api/trips/${tripId}/payments`),
  create: (tripId: string, body: Partial<TripPayment>) =>
    req<TripPayment>(`/api/trips/${tripId}/payments`, {
      method: "POST", body: JSON.stringify(body),
    }),
  delete: (tripId: string, payId: string) =>
    req<void>(`/api/trips/${tripId}/payments/${payId}`, { method: "DELETE" }),
};

// ── Misc ───────────────────────────────────────────────────────────────────────
export const remindersApi = {
  upcoming: () => req<PaymentSchedule[]>("/api/reminders/upcoming"),
};

export const labaApi = {
  get: (tripId: string) => req<LabaResult>(`/api/trips/${tripId}/laba`),
};
