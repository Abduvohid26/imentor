export class HttpError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 401 da bir marta token yangilab qayta urinish */
  retryOnUnauthorized?: boolean;
};

const DEFAULT_TIMEOUT_MS = 12000;

type TokenRefresher = () => Promise<string | null>;

let tokenRefresher: TokenRefresher | null = null;

export function setHttpTokenRefresher(refresher: TokenRefresher | null): void {
  tokenRefresher = refresher;
}

async function fetchOnce(url: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const hasBody = options.body !== undefined;
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        // DELETE/GET da bo'sh body bilan Content-Type yubormaslik — ba'zi proxy/serverlarda 4xx beradi.
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function httpJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const hadAuth = Boolean(options.headers?.Authorization);
  const allowRetry = options.retryOnUnauthorized !== false && hadAuth && Boolean(tokenRefresher);

  let res = await fetchOnce(url, options);

  if (res.status === 401 && allowRetry && tokenRefresher) {
    const nextToken = await tokenRefresher();
    if (nextToken) {
      res = await fetchOnce(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${nextToken}`,
        },
        retryOnUnauthorized: false,
      });
    }
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new HttpError(`HTTP ${res.status}`, res.status, data);
  }
  return data as T;
}
