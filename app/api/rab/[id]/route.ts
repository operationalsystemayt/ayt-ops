// app/api/rab/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  // TODO Phase 2
  return NextResponse.json({ message: "Phase 2 not implemented yet" }, { status: 501 });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  // TODO Phase 2: update existing RAB
  // 1. Backup existing latest.csv → {ddMMyyyyHHmm}.csv in Drive
  // 2. Upload new latest.csv
  // 3. Update rab_master + rab_items in Supabase
  return NextResponse.json({ message: "Phase 2 not implemented yet" }, { status: 501 });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  // TODO Phase 2: soft-delete from Supabase (Drive files never deleted)
  return NextResponse.json({ message: "Phase 2 not implemented yet" }, { status: 501 });
}
