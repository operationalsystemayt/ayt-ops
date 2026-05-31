// lib/rab/calculations.ts
import type { RabMaster, RabItem, RabComputed, DivisorType } from "@/types/rab";

export function n(val: number | "" | undefined | null): number {
  if (val === "" || val === null || val === undefined) return 0;
  return Number(val) || 0;
}

function evalFormula(formula: string, biaya: number): number {
  const clean = formula.trim();
  if (!clean) return 0;
  if (!/^[\d\s\*\/\+\-\.\(\)biaya]+$/.test(clean)) return 0;
  const expr = clean.replace(/biaya/g, String(biaya));
  if (/[a-zA-Z_$]/.test(expr)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function("return " + expr)();
    return typeof result === "number" && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

export function applyDivisor(
  biaya: number,
  divisor: DivisorType,
  pax: number,
  malam: number,
  tl: number,
  hari: number,
  kurs: number,
  use_kurs = true,
  custom_formula = ""
): number {
  const km = use_kurs ? (kurs || 1) : 1;
  if (divisor === "custom") return evalFormula(custom_formula, biaya) * km;
  const raw = biaya * km;
  switch (divisor) {
    case "per_pax":     return raw / (pax || 1);
    case "times_pax":   return raw * (pax || 1);
    case "per_malam":   return raw / (malam || 1);
    case "times_malam": return raw * (malam || 1);
    case "per_tl":      return raw / (tl || 1);
    case "times_tl":    return raw * (tl || 1);
    case "per_hari":    return raw / (hari || 1);
    case "times_hari":  return raw * (hari || 1);
    default:            return raw;
  }
}

export function computeRAB(rab: RabMaster): RabComputed {
  const h = rab.header;
  const pax   = n(h.jumlah_pax);
  const malam = n(h.jumlah_malam);
  const tl    = n(h.jumlah_tl);
  const hari  = n(h.jumlah_hari);
  const kurs  = n(h.kurs) || 1;

  // Fixed rows
  // const tiket_peserta_final  = n(h.tiket_pesawat) * pax;
  const tiket_peserta_final  = n(h.tiket_pesawat);
  // const hotel_peserta_final  = n(h.hotel_peserta) * malam * pax;
  const hotel_peserta_final  = n(h.hotel_peserta) * malam;
  const tiket_tl_final       = n(h.tiket_pesawat) * tl;
  const hotel_tl_final       = n(h.hotel_tl) * malam * tl;

  // Dynamic rows
  const peserta_dynamic = rab.peserta_rows.map((r) =>
    applyDivisor(n(r.biaya), r.divisor, pax, malam, tl, hari, kurs, r.use_kurs ?? true, r.custom_formula)
  );
  const tl_dynamic = rab.tl_rows.map((r) =>
    applyDivisor(n(r.biaya), r.divisor, pax, malam, tl, hari, kurs, r.use_kurs ?? true, r.custom_formula)
  );

  const total_tl =
    tiket_tl_final +
    hotel_tl_final +
    tl_dynamic.reduce((a, b) => a + b, 0);

  const beban_tl = pax > 0 ? total_tl / pax : 0;

  const total_peserta_ex_tiket =
    hotel_peserta_final +
    peserta_dynamic.reduce((a, b) => a + b, 0);

  const total_peserta = tiket_peserta_final + total_peserta_ex_tiket + beban_tl;
  const total_landtour = total_peserta_ex_tiket + beban_tl;

  const harga_jual         = n(rab.harga_jual);
  const harga_jual_landtour = n(rab.harga_jual_landtour);
  const tipping            = n(rab.tipping);
  const tipping_landtour   = n(rab.tipping_landtour);

  const laba_pax            = harga_jual - total_peserta;
  const laba_pax_landtour   = harga_jual_landtour - total_landtour;
  const laba_plus_tipping   = (laba_pax + tipping) * pax;
  const laba_plus_tipping_landtour = (laba_pax_landtour + tipping_landtour) * pax;

  const is_valid = harga_jual === 0 || harga_jual >= total_peserta;
  const harga_jual_error =
    harga_jual > 0 && harga_jual < total_peserta
      ? `Harga jual (${formatIDR(harga_jual)}) lebih kecil dari total biaya (${formatIDR(total_peserta)})`
      : null;

  return {
    tiket_peserta_final,
    hotel_peserta_final,
    tiket_tl_final,
    hotel_tl_final,
    peserta_dynamic,
    tl_dynamic,
    total_tl,
    beban_tl,
    total_peserta_ex_tiket,
    total_peserta,
    total_landtour,
    laba_pax,
    laba_pax_landtour,
    laba_plus_tipping,
    laba_plus_tipping_landtour,
    is_valid,
    harga_jual_error,
  };
}

// ─── Formatting ──────────────────────────────────────────────
export function formatIDR(val: number | "" | null | undefined): string {
  const num = n(val as number);
  if (num === 0) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatIDRCompact(val: number): string {
  if (Math.abs(val) >= 1_000_000_000)
    return `Rp ${(val / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000_000)
    return `Rp ${(val / 1_000_000).toFixed(1)}jt`;
  return formatIDR(val);
}
