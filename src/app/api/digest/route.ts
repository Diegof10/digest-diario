import { NextRequest, NextResponse } from "next/server";
import { assembleDigest, DEFAULT_KM } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kmRaw = req.nextUrl.searchParams.get("km");
  const km =
    kmRaw != null && kmRaw !== "" && Number.isFinite(Number(kmRaw))
      ? Number(kmRaw)
      : DEFAULT_KM;
  const snap = await assembleDigest({ km });
  return NextResponse.json(snap);
}
