import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { AreaService } from "@/services/area.service";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const result = await AreaService.listAreas(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch areas:", error);
    return NextResponse.json({ error: "Failed to fetch areas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await AreaService.createArea(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create area:", error);
    return NextResponse.json({ error: "Failed to create area" }, { status: 500 });
  }
}
