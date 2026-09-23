import { NextResponse } from "next/server";
import { getMercado } from "@/lib/mercado";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await getMercado();
  return NextResponse.json(snap);
}
