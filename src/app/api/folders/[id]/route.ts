import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth-utils";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { FolderService } from "@/services/folder.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    if (auth.ctx.kind === "token") {
      const { id } = await params;
      const denied = await requireTokenEntityAccess(auth.ctx, "notes", "read", "folder", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await FolderService.getFolder(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch folder:", error);
    return NextResponse.json({ error: "Failed to fetch folder" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;
    const body = await request.json();

    if (token) {
      // Folders follow notes permissions 1:1; also validate the move target
      const denied = await requireTokenEntityAccess(
        { userId, token }, "notes", "update", "folder", id,
        body.projectId !== undefined ? body.projectId : undefined,
      );
      if (denied) return denied;
    }

    const result = await FolderService.updateFolder(userId, id, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update folder:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    if (token) {
      const { id } = await params;
      // Folders follow notes permissions 1:1 (delete)
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "delete", "folder", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await FolderService.deleteFolder(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
