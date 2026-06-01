"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { tripApi } from "@/lib/trip/api";
import { Badge, Spinner } from "@/components/ui";
import { ManifestInti } from "@/components/trip/tabs/ManifestInti";
import { ManifestKeberangkatan } from "@/components/trip/tabs/ManifestKeberangkatan";
import { ManifestHotel } from "@/components/trip/tabs/ManifestHotel";
import { TripNotes } from "@/components/trip/tabs/TripNotes";
import { TripPayments } from "@/components/trip/tabs/TripPayments";
import { TabScaffold } from "@/components/trip/tabs/TabScaffold";
import type { Trip, TripStatus } from "@/types/trip";
import { clsx } from "clsx";

const STATUS_BADGE: Record<TripStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default", confirmed: "info", ongoing: "warning", done: "success", cancelled: "danger",
};

const TABS = [
  { key: "2a", label: "Manifest Inti" },
  { key: "2b", label: "Keberangkatan" },
  { key: "2c", label: "Room Hotel" },
  { key: "2d", label: "Transportasi" },
  { key: "2e", label: "Optional Tour" },
  { key: "2f", label: "Visa" },
  { key: "2g", label: "Payment" },
  { key: "2h", label: "Notes" },
] as const;

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("2a");

  useEffect(() => {
    tripApi.get(id).then(setTrip).catch(() => router.push("/trip")).finally(() => setLoading(false));
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
              <h1 className="text-lg font-bold text-neutral-100">{trip.nama_trip}</h1>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-xs text-neutral-500">{trip.tgl_berangkat} → {trip.tgl_pulang}</span>
                <span className="text-xs text-neutral-500">{hari}H / {trip.total_pax} pax</span>
                <Badge variant={STATUS_BADGE[trip.status]}>{trip.status}</Badge>
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
            {activeTab === "2d" && <TabScaffold label="Transportasi" />}
            {activeTab === "2e" && <TabScaffold label="Optional Tour" />}
            {activeTab === "2f" && <TabScaffold label="Visa" />}
            {activeTab === "2g" && <TripPayments tripId={id} />}
            {activeTab === "2h" && <TripNotes tripId={id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
