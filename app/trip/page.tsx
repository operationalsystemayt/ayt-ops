"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { tripApi, remindersApi } from "@/lib/trip/api";
import { Button, Badge, Spinner } from "@/components/ui";
import type { Trip, PaymentSchedule } from "@/types/trip";
import { clsx } from "clsx";

const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  draft: "default",
  confirmed: "info",
  ongoing: "warning",
  done: "success",
  cancelled: "danger",
};

function urgencyLabel(days: number) {
  if (days === 0) return "HARI INI";
  return `H-${days}`;
}
function urgencyVariant(days: number): "danger" | "warning" {
  return days <= 1 ? "danger" : "warning";
}

export default function TripDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <TripDashboardInner />
    </Suspense>
  );
}

function TripDashboardInner() {
  const searchParams = useSearchParams();
  const isPrivate = searchParams.get("type") === "private";
  const tripType = isPrivate ? "private_trip" : "open_trip";

  const [trips, setTrips] = useState<Trip[]>([]);
  const [reminders, setReminders] = useState<PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([tripApi.list(statusFilter || undefined, tripType), remindersApi.upcoming()])
      .then(([t, r]) => { setTrips(t); setReminders(r); })
      .finally(() => setLoading(false));
  }, [statusFilter, tripType]);

  const statuses = ["", "draft", "confirmed", "ongoing", "done", "cancelled"];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-screen-xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-100">{isPrivate ? "Private Trip" : "Open Trip"}</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Kelola semua perjalanan</p>
          </div>
          <Link href={isPrivate ? "/trip/new?type=private" : "/trip/new"}>
            <Button variant="primary" size="sm">+ Buat Trip</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
          {/* Left — trip table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            {/* Filter */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 flex-wrap">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx(
                    "text-xs px-3 py-1 rounded-full border transition-colors cursor-pointer",
                    statusFilter === s
                      ? "border-teal-500 text-teal-400 bg-teal-950/30"
                      : "border-neutral-700 text-neutral-500 hover:border-neutral-500"
                  )}
                >
                  {s === "" ? "Semua" : s}
                </button>
              ))}
            </div>

            {loading ? <Spinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      {["Nama Trip", "Tanggal", "Durasi", "Total Pax", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {trips.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-600">Belum ada trip</td></tr>
                    )}
                    {trips.map((t) => {
                      const hari = Math.round((new Date(t.tgl_pulang).getTime() - new Date(t.tgl_berangkat).getTime()) / 86400000) + 1;
                      return (
                        <tr key={t.id}
                          onClick={() => window.location.href = `/trip/${t.id}`}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-neutral-100">{t.nama_trip}</td>
                          <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">{t.tgl_berangkat}</td>
                          <td className="px-4 py-3 text-xs text-neutral-400">{hari}H{hari - 1}M</td>
                          <td className="px-4 py-3 text-xs text-neutral-400">{t.total_pax} pax</td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_BADGE[t.status]}>{t.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right — payment reminder leaderboard */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 text-xs font-bold uppercase tracking-widest text-amber-400">
              Payment Deadline
            </div>
            {reminders.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-neutral-600">Tidak ada deadline mendekat</div>
            ) : (
              <div className="divide-y divide-neutral-800/50">
                {reminders.map((r) => (
                  <Link key={r.id} href={`/trip/${r.trip_id}`} className="flex items-start justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors block">
                    <div>
                      <div className="text-xs font-medium text-neutral-200 truncate max-w-[180px]">{r.nama_trip}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{r.jenis} · {r.deskripsi ?? ""}</div>
                    </div>
                    <Badge variant={urgencyVariant(r.days_until)}>{urgencyLabel(r.days_until)}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
