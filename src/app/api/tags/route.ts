import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { TagService } from "@/services/tag.service";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const result = await TagService.listTags(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await TagService.createTag(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create tag:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
