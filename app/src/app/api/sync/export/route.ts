import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getBearerToken } from "@/lib/server/sync/http";
import { exportSyncEnvelope, exportSyncPayload, requireSyncDeviceByToken } from "@/lib/server/sync/service";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const syncPrincipal = await requireSyncDeviceByToken(token);

  if (syncPrincipal) {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (format === "payload") {
      const result = await exportSyncPayload({
        userId: syncPrincipal.user.id,
        deviceId: syncPrincipal.device.id,
      });

      return NextResponse.json(
        {
          syncJobId: result.syncJobId,
          preview: result.preview,
          payload: result.payload,
        },
        { status: 200 },
      );
    }

    const result = await exportSyncEnvelope({
      userId: syncPrincipal.user.id,
      deviceId: syncPrincipal.device.id,
      syncToken: syncPrincipal.token,
    });

    return NextResponse.json({ syncJobId: result.syncJobId, envelope: result.envelope }, { status: 200 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "Export for mobile sync requires device token authentication.",
      errorCode: "SYNC_TOKEN_REQUIRED",
    },
    { status: 400 },
  );
}
