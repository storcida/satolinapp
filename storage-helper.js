// ============================================================
// SATOLINA · Storage Helper
// Phase Privatization · P1
// ============================================================
// Provides a unified API for private bucket access via signed URLs.
// All buckets are assumed PRIVATE after Phase Privatization completes.
//
// Usage pattern (preload + sync render):
//
//   // In your loader, after fetching rows:
//   await SatolinaStorage.preload('product-photos', items.map(i => i.foto_url));
//
//   // In your render code (sync, fast):
//   const src = SatolinaStorage.url('product-photos', item.foto_url);
//   if (src) html += `<img src="${src}">`;
//
// Requires globals: SB_URL, SB_KEY (defined by the host HTML).
// Reads access token from localStorage('sb_access_token').
// ============================================================

(function () {
  'use strict';

  const TTL_SEC = 86400;            // 24h, per Phase Privatization decision
  const REFRESH_BEFORE_SEC = 3600;  // refresh signed URLs that expire in <1h

  // cache: key = "bucket:path" → { url, expiresAt }
  const CACHE = new Map();

  function _sbUrl() { return (typeof SB_URL !== 'undefined') ? SB_URL : window.SB_URL; }
  function _sbKey() { return (typeof SB_KEY !== 'undefined') ? SB_KEY : window.SB_KEY; }

  function _headers(extra) {
    const h = { apikey: _sbKey(), 'Content-Type': 'application/json' };
    const t = localStorage.getItem('sb_access_token');
    if (t) h['Authorization'] = 'Bearer ' + t;
    return Object.assign(h, extra || {});
  }

  // Normalize a value into a relative path within the given bucket.
  // Accepts:
  //   - empty/null  → ''
  //   - external URL (not Supabase) → '' (caller handles externally)
  //   - full Supabase public URL containing "/object/public/{bucket}/{path}" → "{path}"
  //   - full Supabase signed URL containing "/object/sign/{bucket}/{path}?..."  → "{path}"
  //   - already a path → as-is
  function extractPath(value, bucket) {
    if (!value) return '';
    const v = String(value);
    if (v.startsWith('http://') || v.startsWith('https://')) {
      // Try to extract path from a Supabase storage URL
      const markers = [
        '/object/public/' + bucket + '/',
        '/object/sign/' + bucket + '/',
        '/object/' + bucket + '/'
      ];
      for (const m of markers) {
        const idx = v.indexOf(m);
        if (idx >= 0) {
          let p = v.substring(idx + m.length);
          // strip query string
          const q = p.indexOf('?');
          if (q >= 0) p = p.substring(0, q);
          return p;
        }
      }
      return ''; // external URL we don't manage
    }
    // already a relative path; strip leading slash if any
    return v.replace(/^\/+/, '');
  }

  function _cacheKey(bucket, path) { return bucket + ':' + path; }

  function _cacheGet(bucket, path) {
    const k = _cacheKey(bucket, path);
    const entry = CACHE.get(k);
    if (!entry) return null;
    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt - now < REFRESH_BEFORE_SEC) {
      CACHE.delete(k);
      return null;
    }
    return entry.url;
  }

  function _cacheSet(bucket, path, url, ttlSec) {
    const expiresAt = Math.floor(Date.now() / 1000) + (ttlSec || TTL_SEC);
    CACHE.set(_cacheKey(bucket, path), { url, expiresAt });
  }

  // Preload signed URLs for a list of paths (or full URLs).
  // Splits into chunks of 100 to stay polite with the API.
  // Skips paths already in cache. Tolerates errors per-path silently.
  async function preload(bucket, valuesArray, ttlSec) {
    if (!Array.isArray(valuesArray) || !valuesArray.length) return;
    const ttl = ttlSec || TTL_SEC;
    const needed = [];
    const seen = new Set();
    for (const v of valuesArray) {
      const p = extractPath(v, bucket);
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      if (_cacheGet(bucket, p)) continue;
      needed.push(p);
    }
    if (!needed.length) return;

    const CHUNK = 100;
    for (let i = 0; i < needed.length; i += CHUNK) {
      const chunk = needed.slice(i, i + CHUNK);
      try {
        const res = await fetch(_sbUrl() + '/storage/v1/object/sign/' + bucket, {
          method: 'POST',
          headers: _headers(),
          body: JSON.stringify({ expiresIn: ttl, paths: chunk })
        });
        if (!res.ok) {
          // While buckets are still public during the migration, this endpoint
          // also works on public buckets, so a non-OK response is unexpected.
          // We log and continue silently.
          if (window.console) console.warn('[SatolinaStorage.preload]', bucket, res.status);
          continue;
        }
        const arr = await res.json();
        if (Array.isArray(arr)) {
          for (const row of arr) {
            // row.signedURL is relative: "/object/sign/bucket/path?token=..."
            // row.error indicates failure for that specific path
            if (row.error || !row.signedURL) continue;
            const fullUrl = _sbUrl() + '/storage/v1' + row.signedURL;
            _cacheSet(bucket, row.path, fullUrl, ttl);
          }
        }
      } catch (e) {
        if (window.console) console.warn('[SatolinaStorage.preload error]', e);
      }
    }
  }

  // Sync URL resolver. Returns:
  //   - cached signed URL if present
  //   - empty string if value is empty
  //   - the original value if it's an external URL we don't manage
  //   - empty string if path is uncached (caller should have called preload)
  function url(bucket, value) {
    if (!value) return '';
    const v = String(value);
    if (v.startsWith('http')) {
      // External URL we don't manage → return as-is (e.g. Google avatars)
      const isOurs =
        v.indexOf('/object/public/' + bucket + '/') >= 0 ||
        v.indexOf('/object/sign/' + bucket + '/') >= 0 ||
        v.indexOf('/object/' + bucket + '/') >= 0;
      if (!isOurs) return v;
    }
    const p = extractPath(value, bucket);
    if (!p) return '';
    const cached = _cacheGet(bucket, p);
    if (cached) return cached;
    return ''; // not preloaded
  }

  // Async one-shot signed URL. Use only when you know it's a single file
  // and you cannot preload (e.g. brand-new upload result).
  async function signedUrl(bucket, value, ttlSec) {
    const p = extractPath(value, bucket);
    if (!p) return '';
    const ttl = ttlSec || TTL_SEC;
    const cached = _cacheGet(bucket, p);
    if (cached) return cached;
    try {
      const res = await fetch(_sbUrl() + '/storage/v1/object/sign/' + bucket + '/' + p, {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify({ expiresIn: ttl })
      });
      if (!res.ok) return '';
      const data = await res.json();
      if (!data || !data.signedURL) return '';
      const fullUrl = _sbUrl() + '/storage/v1' + data.signedURL;
      _cacheSet(bucket, p, fullUrl, ttl);
      return fullUrl;
    } catch (e) {
      if (window.console) console.warn('[SatolinaStorage.signedUrl error]', e);
      return '';
    }
  }

  // Upload a file to a bucket at the given path.
  // Returns the path on success. Throws on error (NO silent failures).
  // Use 'x-upsert: true' to overwrite existing files at the same path.
  async function upload(bucket, path, file, opts) {
    const upsert = opts && opts.upsert !== false; // default true
    const headers = {
      apikey: _sbKey(),
      'Content-Type': file.type || 'application/octet-stream'
    };
    const t = localStorage.getItem('sb_access_token');
    if (t) headers['Authorization'] = 'Bearer ' + t;
    if (upsert) headers['x-upsert'] = 'true';
    const res = await fetch(_sbUrl() + '/storage/v1/object/' + bucket + '/' + path, {
      method: 'POST',
      headers,
      body: file
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('Storage upload failed (' + res.status + '): ' + txt);
    }
    return path;
  }

  // Clear the cache (e.g. on logout)
  function clearCache() { CACHE.clear(); }

  window.SatolinaStorage = {
    preload,
    url,
    signedUrl,
    upload,
    extractPath,
    clearCache,
    TTL_SEC,
    _cache: CACHE  // exposed for debugging only
  };
})();
