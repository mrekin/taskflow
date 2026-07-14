import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { DataService } from "@/services/data.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  try {
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";
    const result = await DataService.exportData(userId, appVersion);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const date = new Date().toISOString().split("T")[0];
    return NextResponse.json(result.data, {
      headers: {
        "Content-Disposition": `attachment; filename="taskflow-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export data:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
