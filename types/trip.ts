// types/trip.ts

export type TripStatus = "draft" | "confirmed" | "ongoing" | "done" | "cancelled";
export type PesertaTitle = "MR" | "MRS" | "MS" | "MISS" | "MASTER" | "TOUR_LEADER";
export type RoomType = "DOUBLE" | "TWIN" | "SINGLE" | "TRIPLE";
export type MealType = "MUSLIM" | "NON_MUSLIM";
export type VisaStatus = "not_required" | "pending" | "uploaded" | "approved" | "rejected";
export type PaymentJenis = "dp" | "pelunasan" | "lainnya";

export interface Trip {
  id: string;
  nama_trip: string;
  rab_master_id?: string;
  tgl_berangkat: string;
  tgl_pulang: string;
  total_pax: number;
  status: TripStatus;
  drive_folder_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ManifestPeserta {
  id: string;
  trip_id: string;
  no_urut: number;
  title?: PesertaTitle;
  nama_lengkap: string;
  no_paspor?: string;
  place_of_birth?: string;
  tgl_lahir?: string;
  place_of_issued?: string;
  issued_date?: string;
  expiry_date?: string;
  room_type?: RoomType;
  unit?: number;
  klien?: string;
  meals?: MealType;
  paspor_drive_file_id?: string;
  ktp_drive_file_id?: string;
  visa_drive_file_id?: string;
  visa_status: VisaStatus;
  created_at: string;
  updated_at: string;
}

export interface TripNote {
  id: string;
  trip_id: string;
  content: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TripPayment {
  id: string;
  trip_id: string;
  peserta_id?: string;
  nama_peserta?: string;
  jenis: PaymentJenis;
  amount: number;
  tgl_bayar: string;
  catatan?: string;
  created_by?: string;
  created_at: string;
}

export interface PaymentSchedule {
  id: string;
  trip_id: string;
  nama_trip: string;
  jenis: string;
  deskripsi?: string;
  deadline: string;
  amount?: number;
  status: string;
  days_until: number;
}

export interface ManifestKeberangkatan {
  id: string;
  trip_id: string;
  peserta_id?: string;
  payment_schedule_id?: string;
  tgl_pemesanan?: string;
  pemesanan?: string;
  agent?: string;
  harga_tiket?: number;
  kode_booking?: string;
  no_etiket?: string;
  maskapai?: string;
  rute_berangkat?: string;
  tgl_berangkat_flight?: string;
  jam_berangkat?: string;
  rute_pulang?: string;
  tgl_pulang_flight?: string;
  jam_pulang?: string;
  bagasi_kabin_kg?: number;
  bagasi_checkin_kg?: number;
  unit?: number;
  klien?: string;
  tiket_drive_file_id?: string;
  limit_pembayaran?: string;
  // Joined from manifest_peserta
  title?: string;
  nama_lengkap?: string;
  no_paspor?: string;
  place_of_birth?: string;
  tgl_lahir?: string;
  place_of_issued?: string;
  issued_date?: string;
  expiry_date?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketOCRPeserta {
  nama: string;
  no_etiket: string;
}

export interface TicketOCRBookingGroup {
  kode_booking: string;
  peserta: TicketOCRPeserta[];
}

export interface TicketOCRResult {
  maskapai: string;
  kode_booking: string;
  rute_berangkat: string;
  tgl_berangkat: string;
  jam_berangkat: string;
  rute_pulang: string;
  tgl_pulang: string;
  jam_pulang: string;
  bagasi_kabin_kg: number;
  bagasi_checkin_kg: number;
  booking_groups?: TicketOCRBookingGroup[];
  peserta: TicketOCRPeserta[];
}

export type HotelTipeRoom = "DOUBLE" | "TWIN" | "SINGLE" | "TRIPLE";

export interface ManifestHotel {
  id?: string;
  trip_id?: string;
  rute?: string;
  nama_hotel?: string;
  nama_agent?: string;
  confirmation_number?: string;
  tgl_stay_mulai?: string;
  tgl_stay_selesai?: string;
  jumlah_room?: number;
  tipe_room?: HotelTipeRoom;
  jumlah_malam?: number;
  harga_jpy?: number;
  harga_idr?: number;
  total_idr?: number;
  kurs?: number;
  peserta_ids: string[];
  peserta_names: string[];
  nota_drive_file_id?: string;
  waktu_pembayaran?: string;
  payment_schedule_id?: string;
  created_at: string;
  updated_at: string;
}

export interface HotelOCRResult {
  nama_hotel: string;
  confirmation_numbers: string[];
  tgl_checkin: string;
  tgl_checkout: string;
  jumlah_room: number;
  tipe_room: string;
  harga_jpy: number;
  kurs: number;
}

export interface LabaResult {
  trip_id: string;
  total_pemasukan: number;
  pengeluaran_tiket: number;
  pengeluaran_hotel: number;
  pengeluaran_transport: number;
  pengeluaran_optional: number;
  pengeluaran_lainnya: number;
  total_pengeluaran: number;
  laba_aktual: number;
  laba_per_pax: number;
}

// Computed client-side — not stored in DB
export type PesertaDocStatus = "valid" | "expiring" | "expired" | "no_paspor" | "no_ktp";
export function getPesertaStatus(p: ManifestPeserta): PesertaDocStatus {
  if (!p.paspor_drive_file_id) return "no_paspor";
  if (!p.ktp_drive_file_id) return "no_ktp";
  if (!p.expiry_date) return "valid";
  const expiry = new Date(p.expiry_date);
  const today = new Date();
  const sixMonths = new Date(today);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  if (expiry < today) return "expired";
  if (expiry < sixMonths) return "expiring";
  return "valid";
}

export function calcAge(tglLahir?: string): number {
  if (!tglLahir) return 0;
  const birth = new Date(tglLahir);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
