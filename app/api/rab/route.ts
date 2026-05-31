// app/api/rab/route.ts
// Phase 2: connects to Supabase + Google Drive
// Phase 1: storage adapter handles everything in frontend (localStorage)
// These routes are activated when NEXT_PUBLIC_STORAGE_BACKEND=supabase

import { NextRequest, NextResponse } from "next/server";
// import { createClient } from "@supabase/supabase-js";
// import { serverConfig } from "@/config/app";

export async function GET() {
  // TODO Phase 2: fetch from Supabase
  // const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serverConfig.supabaseServiceRoleKey);
  // const { data, error } = await supabase.from("rab_master").select("*").order("created_at", { ascending: false });
  // if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  // return NextResponse.json(data);
  return NextResponse.json({ message: "Phase 2 not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  // TODO Phase 2: save to Supabase + upload to Google Drive
  // const body = await req.json();
  // ... validate, upsert rab_master, upsert rab_items, upload CSV to Drive
  return NextResponse.json({ message: "Phase 2 not implemented yet" }, { status: 501 });
}
