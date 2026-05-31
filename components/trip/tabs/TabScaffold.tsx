"use client";
// Placeholder for tabs not yet fully implemented (2b–2f)
export function TabScaffold({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-3xl mb-4">🚧</div>
      <div className="text-sm font-medium text-neutral-400">{label}</div>
      <div className="text-xs text-neutral-600 mt-2">Coming soon — akan diimplementasikan berikutnya</div>
    </div>
  );
}
