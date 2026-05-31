// types/rab.ts

export type DivisorType =
  | "none"
  | "per_pax"
  | "times_pax"
  | "per_malam"
  | "times_malam"
  | "per_tl"
  | "times_tl"
  | "per_hari"
  | "times_hari"
  | "custom";

export type PanelType = "peserta" | "tl" | "landtour";

export interface RabItem {
  id: string;
  detail: string;
  biaya: number | "";
  divisor: DivisorType;
  sort_order: number;
  custom_formula?: string;
  use_kurs?: boolean;
}

export interface RabHeader {
  nama: string;
  tiket_pesawat: number | "";    // IDR per pax
  hotel_peserta: number | "";    // IDR per malam per pax
  hotel_tl: number | "";         // IDR per malam per TL
  jumlah_pax: number | "";
  jumlah_hari: number | "";
  jumlah_malam: number | "";
  jumlah_tl: number | "";
  kurs: number | "";             // IDR per foreign unit (1 = IDR langsung)
}

export interface RabMaster {
  id: string;
  header: RabHeader;
  peserta_rows: RabItem[];
  tl_rows: RabItem[];
  harga_jual: number | "";
  harga_jual_landtour: number | "";
  tipping: number | "";
  tipping_landtour: number | "";
  created_at: string;
  updated_at: string;
  created_by: string;
  notes?: string;
  // set after saving to Supabase
  db_id?: string;
  drive_path?: string;
}

export interface RabComputed {
  // fixed rows
  tiket_peserta_final: number;
  hotel_peserta_final: number;
  tiket_tl_final: number;
  hotel_tl_final: number;
  // dynamic row finals
  peserta_dynamic: number[];
  tl_dynamic: number[];
  // totals
  total_tl: number;
  beban_tl: number;
  total_peserta_ex_tiket: number;
  total_peserta: number;
  total_landtour: number;
  // profit
  laba_pax: number;
  laba_pax_landtour: number;
  laba_plus_tipping: number;
  laba_plus_tipping_landtour: number;
  // validation
  is_valid: boolean;
  harga_jual_error: string | null;
}

export interface RabListItem {
  id: string;
  nama: string;
  jumlah_pax: number;
  jumlah_hari: number;
  jumlah_malam: number;
  harga_jual: number;
  laba_pax: number;
  laba_plus_tipping: number;
  created_at: string;
  updated_at: string;
}
