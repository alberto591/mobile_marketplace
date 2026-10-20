// Supabase Edge Function: image-proxy
// Proxies images from authorized scrap yard CDNs to bypass iOS ATS issues and cache responses.
// Security Hardened: Enforces strict HTTPS, exact host whitelisting, SSRF protection,
// manual redirect validation, 10s request timeouts, 10MB body streaming caps, and MIME validation.

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

// Strict whitelist of exact hosts authorized for scrap yard imagery in this marketplace.
export const ALLOWED_HOSTS = new Set([
  'cdn11.metasync.com',
  'eurodesguacemalaga.com',
  'www.eurodesguacemalaga.com',
]);

// Allowed image formats compatible with mobile app rendering
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB strict limit
export const TIMEOUT_MS = 10000; // 10 seconds per upstream request
export const MAX_REDIRECTS = 2; // Maximum permitted redirect hops

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Validates a target URL against strict security criteria:
 * - Must be valid URL format
 * - Strictly HTTPS
 * - No userinfo (username/password)
 * - Standard HTTPS port (443 or default)
 * - No literal IP addresses (IPv4 or IPv6)
 * - Exact match in ALLOWED_HOSTS
 */
export function validateTargetUrl(urlInput: string): { valid: true; url: URL } | { valid: false; error: string; status: number } {
  let parsed: URL;
  try {
    parsed = new URL(urlInput);
  } catch {
    return { valid: false, error: 'Invalid URL format', status: 400 };
  }

  // 1. Must be strictly HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS protocol is permitted', status: 403 };
  }

  // 2. Reject credentials in URL (userinfo spoofing)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials in URL are strictly prohibited', status: 403 };
  }

  // 3. Reject non-standard ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Non-standard port is prohibited', status: 403 };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Reject literal IP addresses
  if (IPV4_REGEX.test(hostname) || hostname.startsWith('[') || hostname.includes(':')) {
    return { valid: false, error: 'Literal IP addresses are prohibited', status: 403 };
  }

  // 5. Must match strict allowed hosts
  if (!ALLOWED_HOSTS.has(hostname)) {
    return { valid: false, error: 'Target host is not permitted by image proxy policy', status: 403 };
  }

  return { valid: true, url: parsed };
}

/**
 * Reads a response stream in chunks, enforcing the 10MB limit without relying solely on Content-Length.
 * Cancels stream immediately if byte threshold is exceeded.
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array>
): Promise<{ ok: true; buffer: Uint8Array } | { ok: false; error: string; status: number }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_IMAGE_BYTES) {
          await reader.cancel('Size limit exceeded');
          return {
            ok: false,
            error: 'Image size exceeds maximum allowed limit (10MB)',
            status: 413,
          };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, buffer: combined };
}

/**
 * Fetches an upstream URL with manual redirect following, validating every intermediate hop.
 */
export async function fetchWithSafeRedirects(
  targetUrl: URL,
  maxHops = MAX_REDIRECTS,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: true; response: Response } | { ok: false; error: string; status: number }> {
  let currentUrl = targetUrl;
  let hops = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetchFn(currentUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarketplaceImageProxy/2.0)',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { ok: false, error: 'Upstream request timed out', status: 504 };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Check for redirect status
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      hops++;
      if (hops > maxHops) {
        return { ok: false, error: 'Too many redirects', status: 502 };
      }

      const location = res.headers.get('location');
      if (!location) {
        return { ok: false, error: 'Redirect without location header', status: 502 };
      }

      let resolvedUrl: URL;
      try {
        resolvedUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, error: 'Invalid redirect location URL', status: 502 };
      }

      const validation = validateTargetUrl(resolvedUrl.toString());
      if (!validation.valid) {
        return { ok: false, error: `Redirect target rejected: ${validation.error}`, status: 403 };
      }

      currentUrl = validation.url;
      continue;
    }

    return { ok: true, response: res };
  }
}

export async function handler(req: Request, customFetch?: typeof fetch): Promise<Response> {
  const fetchFn = typeof customFetch === 'function' ? customFetch : globalThis.fetch;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const targetParam = url.searchParams.get('url');

  if (!targetParam) {
    return new Response(JSON.stringify({ error: 'Missing url query parameter' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // 1. Strict URL validation
  const validation = validateTargetUrl(targetParam);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: validation.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const targetUrl = validation.url;

  try {
    let upstreamResult: { ok: true; response: Response } | { ok: false; error: string; status: number };

    try {
      upstreamResult = await fetchWithSafeRedirects(targetUrl, MAX_REDIRECTS, fetchFn);
    } catch {
      // Fallback for CDNs with expired SSL certificates (specifically cdn11.metasync.com)
      // Note: This fallback via https://images.weserv.nl is a temporary bridge until the scrap yard
      // renews their SSL certificate on cdn11.metasync.com.
      const fallbackUrl = new URL('https://images.weserv.nl/');
      fallbackUrl.searchParams.set('url', targetUrl.toString());

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const fallbackRes = await fetchFn(fallbackUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MarketplaceImageProxy/2.0)',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          redirect: 'manual',
          signal: controller.signal,
        });

        // Reject any redirects issued by the fallback service
        if ([301, 302, 303, 307, 308].includes(fallbackRes.status)) {
          return new Response(JSON.stringify({ error: 'Fallback service issued unexpected redirect' }), {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }

        upstreamResult = { ok: true, response: fallbackRes };
      } catch (fbErr: any) {
        if (fbErr?.name === 'AbortError') {
          return new Response(JSON.stringify({ error: 'Fallback request timed out' }), {
            status: 504,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }
        return new Response(JSON.stringify({ error: 'Failed to fetch image from upstream server' }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } finally {
        clearTimeout(timer);
      }
    }

    if (!upstreamResult.ok) {
      return new Response(JSON.stringify({ error: upstreamResult.error }), {
        status: upstreamResult.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const upstreamRes = upstreamResult.response;

    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream error: ${upstreamRes.status}` }),
        {
          status: upstreamRes.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // 2. Validate Content-Length if present
    const contentLengthHeader = upstreamRes.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredLength = parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        return new Response(JSON.stringify({ error: 'Image size exceeds maximum allowed limit (10MB)' }), {
          status: 413,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    }

    // 3. Validate Content-Type (must be an accepted image MIME type)
    const rawContentType = upstreamRes.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    if (!ALLOWED_MIME_TYPES.has(rawContentType)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported media type: upstream did not return an accepted image format' }),
        {
          status: 415,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // 4. Stream body with byte limit cap
    if (!upstreamRes.body) {
      return new Response(JSON.stringify({ error: 'Empty upstream body' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const bodyResult = await readBodyWithLimit(upstreamRes.body);
    if (!bodyResult.ok) {
      return new Response(JSON.stringify({ error: bodyResult.error }), {
        status: bodyResult.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // 5. Successful delivery with public immutable cache
    return new Response(bodyResult.buffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': rawContentType,
        'Content-Length': String(bodyResult.buffer.byteLength),
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable',
        'X-Proxied-By': 'marketplace-image-proxy',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch image from upstream server' }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve((req: Request) => handler(req));
}
