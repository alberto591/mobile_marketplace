// Supabase Edge Function: image-proxy
// Proxies images from authorized scrap yard CDNs to bypass iOS ATS issues and cache responses.

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

const ALLOWED_HOSTS = new Set([
  'cdn11.metasync.com',
  'eurodesguacemalaga.com',
  'metasync.com',
]);

function isAllowedHost(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith('.metasync.com')) return true;
  if (hostname.endsWith('.eurodesguacemalaga.com')) return true;
  return false;
}

export async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const targetParam = url.searchParams.get('url');

  if (!targetParam) {
    return new Response(JSON.stringify({ error: 'Missing url query parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(targetParam);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Security: Prevent SSRF
  if (!isAllowedHost(targetUrl.hostname) || targetUrl.protocol !== 'https:') {
    return new Response(
      JSON.stringify({ error: 'Target host is not permitted by image proxy policy', host: targetUrl.hostname }),
      {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarketplaceImageProxy/1.0)',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
    } catch {
      // Fallback for CDNs with expired SSL certificates (e.g. *.metasync.com)
      const fallbackUrl = `https://images.weserv.nl/?url=${encodeURIComponent(targetUrl.toString())}`;
      upstreamRes = await fetch(fallbackUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarketplaceImageProxy/1.0)',
        },
      });
    }

    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream CDN error: ${upstreamRes.status}` }),
        {
          status: upstreamRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await upstreamRes.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable',
        'X-Proxied-By': 'marketplace-image-proxy',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch from upstream CDN',
        details: err?.message || String(err),
      }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handler);
}
