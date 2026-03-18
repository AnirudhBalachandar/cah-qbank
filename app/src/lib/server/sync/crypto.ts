import crypto from "node:crypto";

import type { SyncBundlePayload, SyncEnvelope } from "@cah-qbank/domain";

const PBKDF2_ITERATIONS = 120000;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return secret;
}

function toBase64(input: Buffer) {
  return input.toString("base64");
}

function fromBase64(input: string) {
  return Buffer.from(input, "base64");
}

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashSyncToken(token: string) {
  return sha256Hex(`${getAuthSecret()}:sync-token:${token}`);
}

export function hashPairingCode(pairingId: string, pairingCode: string) {
  return sha256Hex(`${getAuthSecret()}:pair:${pairingId}:${pairingCode}`);
}

export function buildPayloadChecksum(payloadJson: string) {
  return sha256Hex(payloadJson);
}

function deriveBundleKey(syncToken: string, saltB64: string, iterations: number) {
  return crypto.pbkdf2Sync(
    `${getAuthSecret()}:bundle:${syncToken}`,
    fromBase64(saltB64),
    iterations,
    32,
    "sha256",
  );
}

function signEnvelopeParts(params: {
  key: Buffer;
  checksum: string;
  iv: string;
  authTag: string;
  data: string;
}) {
  return crypto
    .createHmac("sha256", params.key)
    .update(`${params.checksum}:${params.iv}:${params.authTag}:${params.data}`)
    .digest("hex");
}

export function encryptSyncPayload(params: {
  syncToken: string;
  payload: SyncBundlePayload;
  sourceDeviceId: string;
  appVersion: string;
}): SyncEnvelope {
  const payloadJson = JSON.stringify(params.payload);
  const checksum = buildPayloadChecksum(payloadJson);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const saltB64 = toBase64(salt);
  const ivB64 = toBase64(iv);

  const key = deriveBundleKey(params.syncToken, saltB64, PBKDF2_ITERATIONS);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payloadJson, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const data = toBase64(encrypted);
  const authTagB64 = toBase64(authTag);

  return {
    meta: {
      bundleVersion: "1.0",
      sourceDeviceId: params.sourceDeviceId,
      exportedAt: new Date().toISOString(),
      appVersion: params.appVersion,
      checksum,
      applyMode: "authoritative_push",
    },
    crypto: {
      algorithm: "aes-256-gcm",
      kdf: "pbkdf2-sha256",
      iterations: PBKDF2_ITERATIONS,
      salt: saltB64,
      iv: ivB64,
      authTag: authTagB64,
      signature: signEnvelopeParts({
        key,
        checksum,
        iv: ivB64,
        authTag: authTagB64,
        data,
      }),
    },
    data,
  };
}

export function decryptSyncEnvelope(params: { syncToken: string; envelope: SyncEnvelope }): SyncBundlePayload {
  const { envelope } = params;
  const key = deriveBundleKey(params.syncToken, envelope.crypto.salt, envelope.crypto.iterations);
  const expectedSignature = signEnvelopeParts({
    key,
    checksum: envelope.meta.checksum,
    iv: envelope.crypto.iv,
    authTag: envelope.crypto.authTag,
    data: envelope.data,
  });

  if (expectedSignature !== envelope.crypto.signature) {
    throw new Error("SYNC_ENVELOPE_SIGNATURE_MISMATCH");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, fromBase64(envelope.crypto.iv));
  decipher.setAuthTag(fromBase64(envelope.crypto.authTag));
  const decrypted = Buffer.concat([decipher.update(fromBase64(envelope.data)), decipher.final()]).toString("utf8");

  const checksum = buildPayloadChecksum(decrypted);
  if (checksum !== envelope.meta.checksum) {
    throw new Error("SYNC_ENVELOPE_CHECKSUM_MISMATCH");
  }

  return JSON.parse(decrypted) as SyncBundlePayload;
}
