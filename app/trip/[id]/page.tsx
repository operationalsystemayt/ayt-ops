"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { tripApi } from "@/lib/trip/api";
import { Badge, Spinner, TextInput } from "@/components/ui";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { ManifestInti } from "@/components/trip/tabs/ManifestInti";
import { ManifestKeberangkatan } from "@/components/trip/tabs/ManifestKeberangkatan";
import { ManifestHotel } from "@/components/trip/tabs/ManifestHotel";
import { ManifestTransportasi } from "@/components/trip/tabs/ManifestTransportasi";
import { ManifestOptionalTour } from "@/components/trip/tabs/ManifestOptionalTour";
import { TripNotes } from "@/components/trip/tabs/TripNotes";
import { TripPayments } from "@/components/trip/tabs/TripPayments";
import { ManifestVisa } from "@/components/trip/tabs/ManifestVisa";
import { ManifestItinerary } from "@/components/trip/tabs/ManifestItinerary";
import { ManifestAsuransi } from "@/components/trip/tabs/ManifestAsuransi";
import { RabRealisasi } from "@/components/trip/tabs/RabRealisasi";
import { rabStorage } from "@/lib/rab/storage";
import type { RabMaster } from "@/types/rab";
import type { Trip, TripStatus } from "@/types/trip";
import { clsx } from "clsx";

const STATUS_BADGE: Record<TripStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default", confirmed: "info", ongoing: "warning", done: "success", cancelled: "danger",
};

const STATUS_SELECT: Record<TripStatus, string> = {
  draft:     "bg-neutral-700 text-neutral-300 border-neutral-600",
  confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ongoing:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  done:      "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ALL_STATUSES: TripStatus[] = ["draft", "confirmed", "ongoing", "done", "cancelled"];

const TABS = [
  { key: "2a", label: "Manifest Inti" },
  { key: "2b", label: "Keberangkatan" },
  { key: "2c", label: "Room Hotel" },
  { key: "2d", label: "Transportasi" },
  { key: "2e", label: "Optional Tour" },
  { key: "2f", label: "Visa" },
  { key: "2g", label: "Data Pemasukan" },
  { key: "2h", label: "Notes" },
  { key: "2i", label: "Itinerary" },
  { key: "2j", label: "Asuransi" },
  { key: "2k", label: "RAB vs Realisasi" },
] as const;

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<string>("2a");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [rabList, setRabList] = useState<RabMaster[]>([]);
  const [rabUpdating, setRabUpdating] = useState(false);

  useEffect(() => {
    tripApi.get(id).then(setTrip).catch(() => router.push("/trip")).finally(() => setLoading(false));
    rabStorage.list().then(setRabList).catch(() => setRabList([]));
  }, [id]);

  if (loading) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><Spinner /></div>;
  if (!trip) return null;

  const hari = Math.round(
    (new Date(trip.tgl_pulang).getTime() - new Date(trip.tgl_berangkat).getTime()) / 86400000
  ) + 1;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => router.push("/trip")} className="text-xs text-neutral-500 hover:text-neutral-300 mb-4 flex items-center gap-1 cursor-pointer">
          ← Semua Trip
        </button>

        {/* Trip header */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <EditableTripTitle trip={trip} onSaved={(nama) => setTrip(t => t ? { ...t, nama_trip: nama } : t)} />
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-xs text-neutral-500">{trip.tgl_berangkat} → {trip.tgl_pulang}</span>
                <span className="text-xs text-neutral-500">{hari}H / {trip.total_pax} pax</span>
                <select
                  value={trip.status}
                  disabled={statusUpdating}
                  onChange={async (e) => {
                    const next = e.target.value as TripStatus;
                    const prev = trip.status;
                    setTrip(t => t ? { ...t, status: next } : t);
                    setStatusUpdating(true);
                    try {
                      await tripApi.update(id, { status: next });
                    } catch {
                      setTrip(t => t ? { ...t, status: prev } : t);
                    } finally {
                      setStatusUpdating(false);
                    }
                  }}
                  className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                    "cursor-pointer focus:outline-none appearance-none transition-colors disabled:opacity-60",
                    STATUS_SELECT[trip.status]
                  )}
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s} className="bg-neutral-900 text-neutral-100">{s}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                  RAB Master:
                  <select
                    value={trip.rab_master_id ?? ""}
                    disabled={rabUpdating}
                    onChange={async (e) => {
                      const next = e.target.value || undefined;
                      const prev = trip.rab_master_id;
                      setTrip(t => t ? { ...t, rab_master_id: next } : t);
                      setRabUpdating(true);
                      try {
                        await tripApi.update(id, { rab_master_id: next });
                      } catch {
                        setTrip(t => t ? { ...t, rab_master_id: prev } : t);
                      } finally {
                        setRabUpdating(false);
                      }
                    }}
                    className="rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-[#37bea3] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <option value="">— Tidak ada —</option>
                    {rabList.map((r) => (
                      <option key={r.id} value={r.id}>{r.header.nama}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-neutral-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={clsx(
                  "px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex-shrink-0",
                  activeTab === t.key
                    ? "border-b-2 border-teal-500 text-teal-400"
                    : "text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent"
                )}
              >
                <span className="text-neutral-600 mr-1.5">{t.key}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "2a" && <ManifestInti tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2b" && <ManifestKeberangkatan tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2c" && <ManifestHotel tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2d" && <ManifestTransportasi tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2e" && <ManifestOptionalTour tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2f" && <ManifestVisa tripId={id} tripName={trip.nama_trip} tglBerangkat={trip.tgl_berangkat} tglPulang={trip.tgl_pulang} />}
            {activeTab === "2g" && <TripPayments tripId={id} tripName={trip.nama_trip} />}
            {activeTab === "2h" && <TripNotes tripId={id} />}
            {activeTab === "2i" && <ManifestItinerary tripId={id} tripName={trip.nama_trip} />}
            {activeTab === "2j" && <ManifestAsuransi tripId={id} tripName={trip.nama_trip} />}
            {activeTab === "2k" && <RabRealisasi tripId={id} tripName={trip.nama_trip} totalPax={trip.total_pax} rabMasterId={trip.rab_master_id} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// Click-to-edit trip title; auto-saves via debounced PATCH after the user stops typing.
function EditableTripTitle({ trip, onSaved }: { trip: Trip; onSaved: (nama: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(trip.nama_trip);

  useAutoSave(value, async (v) => {
    if (v.trim() && v !== trip.nama_trip) {
      await tripApi.update(trip.id, { nama_trip: v });
      onSaved(v);
    }
  });

  if (!editing) {
    return (
      <h1
        onClick={() => setEditing(true)}
        className="text-lg font-bold text-neutral-100 cursor-text hover:underline inline-block"
      >
        {value}
      </h1>
    );
  }

  return (
    <TextInput
      value={value}
      onChange={setValue}
      autoFocus
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }}
      className="text-lg font-bold"
    />
  );
}
