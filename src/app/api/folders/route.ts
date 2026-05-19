import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { FolderService } from "@/services/folder.service";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
    };

    const result = await FolderService.listFolders(userId, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await FolderService.createFolder(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
