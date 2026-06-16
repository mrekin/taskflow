import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { NoteVersionService } from "@/services/note-version.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id, number } = await params;
    const num = parseInt(number, 10);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    const result = await NoteVersionService.getVersion(userId, id, num);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch note version:", error);
    return NextResponse.json({ error: "Failed to fetch version" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id, number } = await params;
    const num = parseInt(number, 10);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    const { kept } = await request.json();
    if (typeof kept !== "boolean") {
      return NextResponse.json({ error: "kept must be a boolean" }, { status: 400 });
    }

    const result = await NoteVersionService.setKept(userId, id, num, kept);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update note version:", error);
    return NextResponse.json({ error: "Failed to update version" }, { status: 500 });
  }
}
