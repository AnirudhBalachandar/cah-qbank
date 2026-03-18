import { expect, test } from "@playwright/test";

const email = process.env.DEV_USER_EMAIL ?? "dev@example.com";
const password = process.env.DEV_USER_PASSWORD ?? "changeme123";

function extractSessionCookie(setCookieHeader: string | undefined) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/pwh_session=[^;]+/);
  return match ? match[0] : null;
}

test("login returns 400 for malformed JSON body", async ({ request }) => {
  const response = await request.fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: Buffer.from("{", "utf8"),
  });

  expect(response.status()).toBe(400);
  await expect(await response.json()).toMatchObject({
    errorCode: "INVALID_JSON_BODY",
  });
});

test("protected session endpoint returns 400 for malformed JSON body", async ({ request }) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const cookie = extractSessionCookie(loginResponse.headers()["set-cookie"]);
  expect(cookie).toBeTruthy();

  const response = await request.fetch("/api/session/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie as string,
    },
    data: Buffer.from("{", "utf8"),
  });

  expect(response.status()).toBe(400);
  await expect(await response.json()).toMatchObject({
    errorCode: "INVALID_JSON_BODY",
  });
});

test("preferences endpoint returns 400 for malformed JSON body", async ({ request }) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const cookie = extractSessionCookie(loginResponse.headers()["set-cookie"]);
  expect(cookie).toBeTruthy();

  const response = await request.fetch("/api/user/preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie as string,
    },
    data: Buffer.from("{", "utf8"),
  });

  expect(response.status()).toBe(400);
  await expect(await response.json()).toMatchObject({
    errorCode: "INVALID_JSON_BODY",
  });
});
