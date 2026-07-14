import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { DataService, type ImportMode } from "@/services/data.service";

export const dynamic = "force-dynamic";

const VALID_MODES: ImportMode[] = ["replace", "merge-skip", "merge-overwrite"];

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  try {
    const body = await request.json();
    const mode: ImportMode =
      body && typeof body === "object" && VALID_MODES.includes(body.mode) ? body.mode : "merge-skip";
    const data = body?.data;

    const result = await DataService.importData(userId, data, mode);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to import data:", error);
    return NextResponse.json({ error: "Failed to import data" }, { status: 500 });
  }
}
