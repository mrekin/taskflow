import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, requireTokenEntityAccess } from "@/lib/api-token";
import { NoteVersionService } from "@/services/note-version.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id, number } = await params;
    const num = parseInt(number, 10);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    if (token) {
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "update", "note", id);
      if (denied) return denied;
    }

    const result = await NoteVersionService.restoreVersion(userId, id, num);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to restore note version:", error);
    return NextResponse.json({ error: "Failed to restore version" }, { status: 500 });
  }
}
