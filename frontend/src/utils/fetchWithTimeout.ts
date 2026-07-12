/** Fetch with abort timeout — osilib qolgan API so'rovlarini oldini oladi. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('request-timeout');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}
