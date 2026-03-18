"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PairingResult = {
  deviceId: string;
  pairingId: string;
  pairingCode: string;
  expiresAt: string;
};

type PairingBundle = {
  baseUrl: string;
  pairingId: string;
  pairingCode: string;
  devicePublicId: string;
  deviceName: string;
  expiresAt: string;
};

function formatSeconds(remainingSeconds: number) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function resolveDefaultBaseUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000";
  }
  return window.location.origin;
}

export function MobilePairingCard() {
  const [baseUrl, setBaseUrl] = useState(resolveDefaultBaseUrl);
  const [devicePublicId, setDevicePublicId] = useState("");
  const [deviceName, setDeviceName] = useState("iPhone 17 Air");
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingResult | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    if (!pairing?.expiresAt) {
      setSecondsRemaining(0);
      return;
    }

    const expiresAtMs = new Date(pairing.expiresAt).getTime();

    const updateRemaining = () => {
      const nowMs = Date.now();
      const diff = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
      setSecondsRemaining(diff);
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [pairing?.expiresAt]);

  const pairingBundle = useMemo<PairingBundle | null>(() => {
    if (!pairing) return null;

    return {
      baseUrl: baseUrl.trim(),
      pairingId: pairing.pairingId,
      pairingCode: pairing.pairingCode,
      devicePublicId: devicePublicId.trim(),
      deviceName: deviceName.trim(),
      expiresAt: pairing.expiresAt,
    };
  }, [baseUrl, deviceName, devicePublicId, pairing]);

  const pairingBundleJson = useMemo(() => {
    if (!pairingBundle) return "";
    return JSON.stringify(pairingBundle, null, 2);
  }, [pairingBundle]);

  const pairingQrPayload = useMemo(() => {
    if (!pairingBundle) return "";
    return `pwhqbank://pair?data=${encodeURIComponent(JSON.stringify(pairingBundle))}`;
  }, [pairingBundle]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied`);
      window.setTimeout(() => setCopyStatus(null), 1800);
    } catch {
      setCopyStatus("Clipboard copy failed");
    }
  }

  async function createPairingCode() {
    setError(null);
    setCopyStatus(null);

    if (!devicePublicId.trim()) {
      setError("Enter the iPhone Device ID shown in the app settings screen.");
      return;
    }

    if (!baseUrl.trim()) {
      setError("Enter a reachable desktop base URL.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/sync/pair/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          devicePublicId: devicePublicId.trim(),
          deviceName: deviceName.trim() || "iPhone",
          platform: "ios",
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
        throw new Error(body?.error ?? body?.errorCode ?? "Unable to generate pairing code.");
      }

      const data = (await response.json()) as PairingResult;
      setPairing(data);
      setCopyStatus("Pairing code generated");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Unable to generate pairing code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mobile Pairing</CardTitle>
        <CardDescription>Generate a short-lived pairing bundle for the iPhone app. No curl needed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sync-base-url">Desktop base URL for iPhone</Label>
          <Input
            id="sync-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://192.168.x.x:3000"
            aria-describedby="sync-base-url-help"
          />
          <p id="sync-base-url-help" className="text-xs text-muted-foreground">
            Use your LAN URL so your iPhone can reach this Mac.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sync-device-id">iPhone Device ID</Label>
          <Input
            id="sync-device-id"
            value={devicePublicId}
            onChange={(event) => setDevicePublicId(event.target.value)}
            placeholder="ios-..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sync-device-name">Device Name</Label>
          <Input
            id="sync-device-name"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            placeholder="iPhone 17 Air"
          />
        </div>

        <Button onClick={createPairingCode} disabled={loading}>
          {loading ? "Generating..." : "Generate Pairing Bundle"}
        </Button>

        {pairing ? (
          <div className="rounded-lg border p-3 text-sm">
            <p>
              <strong>Pairing ID:</strong> {pairing.pairingId}
            </p>
            <p>
              <strong>Pairing Code:</strong> {pairing.pairingCode}
            </p>
            <p>
              <strong>Expires in:</strong> {secondsRemaining > 0 ? formatSeconds(secondsRemaining) : "Expired"}
            </p>
          </div>
        ) : null}

        {pairingBundle ? (
          <div className="space-y-2">
            <Label htmlFor="pairing-bundle-json">Pairing Bundle (copy/paste into iPhone app)</Label>
            <Textarea id="pairing-bundle-json" readOnly value={pairingBundleJson} className="min-h-28 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void copyText(pairingBundleJson, "Pairing bundle")}>Copy Pairing Bundle</Button>
              <Button type="button" variant="outline" onClick={() => void copyText(pairingQrPayload, "QR payload string")}>Copy QR Payload String</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional QR string is provided for future scanner flow. Current mobile app supports direct bundle paste.
            </p>
          </div>
        ) : null}

        {copyStatus ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{copyStatus}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
