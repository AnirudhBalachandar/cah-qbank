import { expect, test } from "@playwright/test";

test("offline route, service worker, and manifest endpoints are available", async ({ request }) => {
  const offlineResponse = await request.get("/~offline");
  expect(offlineResponse.ok()).toBeTruthy();
  await expect(await offlineResponse.text()).toContain("offline");

  const serviceWorkerResponse = await request.get("/sw.js");
  expect(serviceWorkerResponse.ok()).toBeTruthy();

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
});
