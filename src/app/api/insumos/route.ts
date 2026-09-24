import { NextResponse } from "next/server";
import { getInsumos } from "@/lib/insumos";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await getInsumos();
  return NextResponse.json(snap);
}
