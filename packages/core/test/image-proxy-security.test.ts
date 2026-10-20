import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_HOSTS,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  handler,
  readBodyWithLimit,
  validateTargetUrl,
} from '../../../supabase/functions/image-proxy/index.js';

describe('Image Proxy Security & Hardening (Unit Tests)', () => {
  describe('1. validateTargetUrl and Host Whitelisting', () => {
    it('accepts exact allowed hosts with HTTPS', () => {
      const allowed = [
        'https://cdn11.metasync.com/photo.jpg',
        'https://eurodesguacemalaga.com/logo.png',
        'https://www.eurodesguacemalaga.com/logo.png',
      ];
      for (const u of allowed) {
        const res = validateTargetUrl(u);
        expect(res.valid).toBe(true);
        if (res.valid) {
          expect(ALLOWED_HOSTS.has(res.url.hostname)).toBe(true);
        }
      }
    });

    it('rejects HTTP scheme with 403', () => {
      const res = validateTargetUrl('http://cdn11.metasync.com/photo.jpg');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.status).toBe(403);
        expect(res.error).toContain('HTTPS');
      }
    });

    it('rejects URLs containing username/password (userinfo spoofing) with 403', () => {
      const spoofed = [
        'https://user:pass@cdn11.metasync.com/photo.jpg',
        'https://cdn11.metasync.com@evil.com/photo.jpg',
      ];
      for (const u of spoofed) {
        const res = validateTargetUrl(u);
        expect(res.valid).toBe(false);
        if (!res.valid) {
          expect(res.status).toBe(403);
        }
      }
    });

    it('rejects non-standard ports with 403', () => {
      const res = validateTargetUrl('https://cdn11.metasync.com:8443/photo.jpg');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.status).toBe(403);
        expect(res.error).toContain('port');
      }
    });

    it('rejects literal IPv4 and IPv6 addresses with 403', () => {
      const ips = [
        'https://127.0.0.1/image.jpg',
        'https://169.254.169.254/latest/meta-data',
        'https://192.168.1.1/router.jpg',
        'https://[::1]/image.jpg',
      ];
      for (const ip of ips) {
        const res = validateTargetUrl(ip);
        expect(res.valid).toBe(false);
        if (!res.valid) {
          expect(res.status).toBe(403);
        }
      }
    });

    it('rejects unauthorized external domains with 403', () => {
      const unauthorized = [
        'https://google.com/logo.png',
        'https://evil-attacker.com/malware.exe',
        'https://metasync.com.attacker.com/image.jpg',
      ];
      for (const u of unauthorized) {
        const res = validateTargetUrl(u);
        expect(res.valid).toBe(false);
        if (!res.valid) {
          expect(res.status).toBe(403);
          expect(res.error).toContain('not permitted');
        }
      }
    });

    it('rejects malformed URLs with 400', () => {
      const res = validateTargetUrl('not-a-valid-url');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.status).toBe(400);
      }
    });
  });

  describe('2. Stream Size Limit Enforcement (10MB)', () => {
    it('successfully reads bodies within 10MB limit', async () => {
      const data = new Uint8Array(1024 * 100); // 100 KB
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const res = await readBodyWithLimit(stream);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.buffer.byteLength).toBe(1024 * 100);
      }
    });

    it('aborts stream and returns 413 if stream exceeds 10MB', async () => {
      // Chunk generator exceeding 10MB
      const chunkSize = 2 * 1024 * 1024; // 2MB
      let count = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          count++;
          if (count > 6) {
            controller.close();
          } else {
            controller.enqueue(new Uint8Array(chunkSize));
          }
        },
      });

      const res = await readBodyWithLimit(stream);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(413);
        expect(res.error).toContain('10MB');
      }
    });
  });

  describe('3. Handler Workflow, Redirects, MIME and Fallback', () => {
    it('returns 400 with no-store if url param is missing', async () => {
      const req = new Request('https://proxy.local/functions/v1/image-proxy');
      const res = await handler(req);
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.error).toContain('Missing url');
    });

    it('handles OPTIONS preflight with CORS headers', async () => {
      const req = new Request('https://proxy.local/functions/v1/image-proxy', { method: 'OPTIONS' });
      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('blocks redirect towards unauthorized host with 403', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.com/secret.jpg' },
        })
      );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://cdn11.metasync.com/photo.jpg')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.error).toContain('Redirect target rejected');
    });

    it('blocks redirect towards private IP/localhost with 403', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'http://127.0.0.1:8080/internal.jpg' },
        })
      );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://www.eurodesguacemalaga.com/image.png')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('rejects upstream Content-Length exceeding 10MB with 413 without reading body', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(new Uint8Array(10), {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(15 * 1024 * 1024), // 15MB
          },
        })
      );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://www.eurodesguacemalaga.com/huge.jpg')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(413);
      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('rejects disallowed MIME types (HTML, JSON, scripts) with 415', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response('<html><body>Hacked</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://www.eurodesguacemalaga.com/page.html')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(415);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.error).toContain('Unsupported media type');
    });

    it('successfully delivers valid JPEG with immutable public cache', async () => {
      const sampleJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(sampleJpeg, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(sampleJpeg.byteLength),
          },
        })
      );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://www.eurodesguacemalaga.com/valid.jpg')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      expect(res.headers.get('cache-control')).toContain('immutable');
      expect(res.headers.get('x-proxied-by')).toBe('marketplace-image-proxy');

      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.byteLength).toBe(sampleJpeg.byteLength);
    });

    it('triggers fallback when upstream TLS fails and recovers image', async () => {
      const sampleJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      // First call throws (TLS certificate expired on cdn11.metasync.com)
      // Second call (fallback) succeeds
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('invalid peer certificate: Expired'))
        .mockResolvedValueOnce(
          new Response(sampleJpeg, {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
          })
        );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://cdn11.metasync.com/photo.jpg')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Fallback destination checked
      expect(mockFetch.mock.calls[1][0]).toContain('https://images.weserv.nl/?url=');
    });

    it('handles fallback redirect attempt by rejecting it strictly with 502', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('invalid peer certificate: Expired'))
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'https://evil.com/redirect' },
          })
        );

      const req = new Request(
        'https://proxy.local/functions/v1/image-proxy?url=' +
          encodeURIComponent('https://cdn11.metasync.com/photo.jpg')
      );

      const res = await handler(req, mockFetch as any);
      expect(res.status).toBe(502);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.error).toContain('Fallback service issued unexpected redirect');
    });
  });
});
