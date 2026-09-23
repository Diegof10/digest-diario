import { NextResponse } from "next/server";
import { getFiscal } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await getFiscal();
  return NextResponse.json(snap);
}
