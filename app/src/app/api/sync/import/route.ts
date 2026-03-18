import { NextResponse } from "next/server";

import { syncBundlePayloadSchema, syncEnvelopeSchema } from "@cah-qbank/domain";

import { getBearerToken } from "@/lib/server/sync/http";
import { readJsonBody } from "@/lib/server/request-json";
import { importSyncEnvelope, importSyncPayload, requireSyncDeviceByToken } from "@/lib/server/sync/service";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const syncPrincipal = await requireSyncDeviceByToken(token);
  if (!syncPrincipal) {
    return NextResponse.json({ error: "Unauthorized", errorCode: "SYNC_TOKEN_INVALID" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  try {
    const parsedEnvelope = syncEnvelopeSchema.safeParse(body.payload);
    const parsedPayload = parsedEnvelope.success ? null : syncBundlePayloadSchema.safeParse(body.payload);

    const result = parsedEnvelope.success
      ? await importSyncEnvelope({
          userId: syncPrincipal.user.id,
          deviceId: syncPrincipal.device.id,
          syncToken: syncPrincipal.token,
          envelope: parsedEnvelope.data,
        })
      : parsedPayload?.success
        ? await importSyncPayload({
            userId: syncPrincipal.user.id,
            deviceId: syncPrincipal.device.id,
            payload: parsedPayload.data,
          })
        : null;

    if (!result) {
      return NextResponse.json(
        {
          error: "Invalid sync import payload.",
          errorCode: "INVALID_SYNC_IMPORT_BODY",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "SYNC_IMPORT_FAILED",
        errorCode: "SYNC_IMPORT_FAILED",
      },
      { status: 400 },
    );
  }
}
