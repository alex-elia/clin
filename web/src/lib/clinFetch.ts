/**
 * In dev, Turbopack may return 404 until a route's first compile finishes.
 * Retry briefly so the UI does not look broken right after `npm run dev`.
 */
export async function clinFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const retries = process.env.NODE_ENV === "development" ? 8 : 1;
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 404 || attempt === retries - 1) return res;
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  throw new Error("clinFetch: unreachable");
}
