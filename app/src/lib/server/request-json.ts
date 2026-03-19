export async function readJsonBody(request: Request) {
  try {
    const payload = await request.json();
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const };
  }
}
