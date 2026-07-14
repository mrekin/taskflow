import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { DataService } from "@/services/data.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  try {
    const result = await DataService.exportFilesZip(userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { buffer, filename } = result.data;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export files:", error);
    return NextResponse.json({ error: "Failed to export files" }, { status: 500 });
  }
}
