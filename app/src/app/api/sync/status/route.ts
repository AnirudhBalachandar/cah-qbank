import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getBearerToken } from "@/lib/server/sync/http";
import { getSyncStatusForUser, requireSyncDeviceByToken } from "@/lib/server/sync/service";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const syncPrincipal = await requireSyncDeviceByToken(token);

  if (syncPrincipal) {
    const status = await getSyncStatusForUser(syncPrincipal.user.id);
    return NextResponse.json(
      {
        scope: "device",
        device: {
          id: syncPrincipal.device.id,
          name: syncPrincipal.device.deviceName,
          platform: syncPrincipal.device.platform,
          status: syncPrincipal.device.status,
          lastSeenAt: syncPrincipal.device.lastSeenAt,
        },
        ...status,
      },
      { status: 200 },
    );
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getSyncStatusForUser(user.id);
  return NextResponse.json({ scope: "user", ...status }, { status: 200 });
}
