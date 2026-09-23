import { NextRequest, NextResponse } from "next/server";
import { getCatac } from "@/lib/catac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : null;
  const snap = await getCatac(km);
  return NextResponse.json(snap);
}
