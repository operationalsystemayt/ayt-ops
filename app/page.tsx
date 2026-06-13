// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-bold text-neutral-100">AYT Ops</h1>
        <div className="flex gap-4">
          <Link href="/rab" className="px-6 py-3 rounded-xl bg-teal-500 text-neutral-950 font-semibold text-sm hover:bg-teal-400 transition-colors">
            RAB
          </Link>
          <Link href="/trip" className="px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold text-sm hover:border-teal-500 hover:text-teal-400 transition-colors">
            Open Trip
          </Link>
          <Link href="/trip?type=private" className="px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold text-sm hover:border-teal-500 hover:text-teal-400 transition-colors">
            Private Trip
          </Link>
        </div>
      </div>
    </div>
  );
}
