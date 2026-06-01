// lib/trip/api.ts
import type {
  Trip, ManifestPeserta, TripNote, TripPayment, PaymentSchedule, LabaResult,
  ManifestKeberangkatan, TicketOCRResult,
  ManifestHotel, HotelOCRResult,
  ManifestTransportasi, TransportasiOCRResult,
  ManifestOptionalTour, OptionalTourOCRResult,
} from "@/types/trip";

const BASE = process.env.NEXT_PUBLIC_TRIP_API_URL ?? "http://localhost:8080";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  console.debug(`[API] ${init?.method ?? "GET"} ${url}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (e: any) {
    console.error(`[API] network error — ${init?.method ?? "GET"} ${url}:`, e.message);
    throw new Error(`Network error: cannot reach ${BASE} — is the Go backend running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).error ?? `HTTP ${res.status}`;
    console.error(`[API] ${res.status} ${init?.method ?? "GET"} ${url} →`, msg);
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function reqForm<T>(url: string, fd: FormData): Promise<T> {
  console.debug(`[API] POST (form) ${url}`);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e: any) {
    console.error(`[API] network error — POST ${url}:`, e.message);
    throw new Error(`Network error: cannot reach ${BASE} — is the Go backend running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).error ?? `HTTP ${res.status}`;
    console.error(`[API] ${res.status} POST ${url} →`, msg);
    throw new Error(msg);
  }
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

  uploadFile: (tripId: string, pid: string, type: "paspor" | "ktp", file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/peserta/${pid}/${type}`, fd,
    );
  },
};

// ── OCR ────────────────────────────────────────────────────────────────────────
export interface OcrResult {
  title: string;
  nama_lengkap: string;
  no_paspor: string;
  place_of_birth: string;
  tgl_lahir: string;
  place_of_issued: string;
  issued_date: string;
  expiry_date: string;
}

export const ocrApi = {
  paspor: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return reqForm<OcrResult>(`${BASE}/api/ocr/paspor`, fd);
  },
};

// ── Manifest CSV + Passport Compilation ────────────────────────────────────────
export const manifestApi = {
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_file_id: string; drive_view_url: string }>(
      `/api/trips/${tripId}/peserta/manifest-csv`, { method: "POST" },
    ),
  passportCompilation: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string; total_images: number }>(
      `/api/trips/${tripId}/passport-compilation`, { method: "POST" },
    ),
};

// ── Keberangkatan ──────────────────────────────────────────────────────────────
export const keberangkatanApi = {
  list: (tripId: string) =>
    req<ManifestKeberangkatan[]>(`/api/trips/${tripId}/keberangkatan`),
  create: (tripId: string, body: Partial<ManifestKeberangkatan>) =>
    req<ManifestKeberangkatan>(`/api/trips/${tripId}/keberangkatan`, {
      method: "POST", body: JSON.stringify(body),
    }),
  update: (tripId: string, kid: string, body: Partial<ManifestKeberangkatan>) =>
    req<void>(`/api/trips/${tripId}/keberangkatan/${kid}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  delete: (tripId: string, kid: string) =>
    req<void>(`/api/trips/${tripId}/keberangkatan/${kid}`, { method: "DELETE" }),
  uploadTiket: (tripId: string, fd: FormData) =>
    reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/keberangkatan/upload-tiket`, fd,
    ),
  ocrTiket: (tripId: string, fd: FormData) =>
    reqForm<TicketOCRResult>(
      `${BASE}/api/trips/${tripId}/keberangkatan/ocr-tiket`, fd,
    ),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/keberangkatan/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_keberangkatan.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/keberangkatan/upload-csv`, { method: "POST" },
    ),
};

// ── Hotel ──────────────────────────────────────────────────────────────────────
export const hotelApi = {
  list: (tripId: string) =>
    req<ManifestHotel[]>(`/api/trips/${tripId}/hotel`),
  create: (tripId: string, body: Partial<ManifestHotel>) =>
    req<ManifestHotel>(`/api/trips/${tripId}/hotel`, {
      method: "POST", body: JSON.stringify(body),
    }),
  update: (tripId: string, hid: string, body: Partial<ManifestHotel>) =>
    req<void>(`/api/trips/${tripId}/hotel/${hid}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  delete: (tripId: string, hid: string) =>
    req<void>(`/api/trips/${tripId}/hotel/${hid}`, { method: "DELETE" }),
  uploadNota: (tripId: string, fd: FormData) =>
    reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/hotel/upload-nota`, fd,
    ),
  ocrNota: (tripId: string, fd: FormData) =>
    reqForm<HotelOCRResult>(
      `${BASE}/api/trips/${tripId}/hotel/ocr-nota`, fd,
    ),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/hotel/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_hotel.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/hotel/upload-csv`, { method: "POST" },
    ),
};

// ── Transportasi ──────────────────────────────────────────────────────────────
export const transportasiApi = {
  list: (tripId: string) =>
    req<ManifestTransportasi[]>(`/api/trips/${tripId}/transportasi`),
  create: (tripId: string, body: Partial<ManifestTransportasi>) =>
    req<ManifestTransportasi>(`/api/trips/${tripId}/transportasi`, {
      method: "POST", body: JSON.stringify(body),
    }),
  update: (tripId: string, tid: string, body: Partial<ManifestTransportasi>) =>
    req<void>(`/api/trips/${tripId}/transportasi/${tid}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  delete: (tripId: string, tid: string) =>
    req<void>(`/api/trips/${tripId}/transportasi/${tid}`, { method: "DELETE" }),
  uploadNota: (tripId: string, fd: FormData) =>
    reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/transportasi/upload-nota`, fd,
    ),
  ocrNota: (tripId: string, fd: FormData) =>
    reqForm<TransportasiOCRResult>(
      `${BASE}/api/trips/${tripId}/transportasi/ocr-nota`, fd,
    ),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/transportasi/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_transportasi.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/transportasi/upload-csv`, { method: "POST" },
    ),
};

// ── Optional Tour ─────────────────────────────────────────────────────────────
export const optionalTourApi = {
  list: (tripId: string) =>
    req<ManifestOptionalTour[]>(`/api/trips/${tripId}/optional-tour`),
  create: (tripId: string, body: Partial<ManifestOptionalTour>) =>
    req<ManifestOptionalTour>(`/api/trips/${tripId}/optional-tour`, {
      method: "POST", body: JSON.stringify(body),
    }),
  update: (tripId: string, oid: string, body: Partial<ManifestOptionalTour>) =>
    req<void>(`/api/trips/${tripId}/optional-tour/${oid}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  delete: (tripId: string, oid: string) =>
    req<void>(`/api/trips/${tripId}/optional-tour/${oid}`, { method: "DELETE" }),
  uploadTiket: (tripId: string, fd: FormData) =>
    reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/optional-tour/upload-tiket`, fd,
    ),
  ocrTiket: (tripId: string, fd: FormData) =>
    reqForm<OptionalTourOCRResult>(
      `${BASE}/api/trips/${tripId}/optional-tour/ocr-tiket`, fd,
    ),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/optional-tour/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_optional_tour.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/optional-tour/upload-csv`, { method: "POST" },
    ),
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

// ── Visa ───────────────────────────────────────────────────────────────────────
export const visaApi = {
  upload: (tripId: string, pid: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return reqForm<{ drive_file_id: string; drive_view_url: string }>(
      `${BASE}/api/trips/${tripId}/peserta/${pid}/visa`, fd,
    );
  },
  delete: (tripId: string, pid: string) =>
    req<void>(`/api/trips/${tripId}/peserta/${pid}/visa`, { method: "DELETE" }),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/visa/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_visa.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/visa/upload-csv`, { method: "POST" },
    ),
};

// ── Payments ───────────────────────────────────────────────────────────────────
export const paymentsApi = {
  list: (tripId: string) => req<TripPayment[]>(`/api/trips/${tripId}/payments`),
  create: (tripId: string, formData: FormData) =>
    reqForm<TripPayment>(`${BASE}/api/trips/${tripId}/payments`, formData),
  delete: (tripId: string, payId: string) =>
    req<void>(`/api/trips/${tripId}/payments/${payId}`, { method: "DELETE" }),
  exportCsv: async (tripId: string): Promise<void> => {
    const url = `${BASE}/api/trips/${tripId}/payments/export-csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `manifest_payment.csv`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  },
  uploadCsvToDrive: (tripId: string) =>
    req<{ file_name: string; drive_view_url: string }>(
      `/api/trips/${tripId}/payments/upload-csv`, { method: "POST" },
    ),
};

// ── Misc ───────────────────────────────────────────────────────────────────────
export const remindersApi = {
  upcoming: () => req<PaymentSchedule[]>("/api/reminders/upcoming"),
};

export const labaApi = {
  get: (tripId: string) => req<LabaResult>(`/api/trips/${tripId}/laba`),
};
