// ==========================================================================
// fetch-recipe-source — server-side URL fetch for the Recipe Capture &
// Import Pipeline (FLAGSHIP_COOKBOOK_ROADMAP.md, "Recipe Capture & Import
// Pipeline"). Mike's Cookbook is a static site with no backend of its own
// (see CLAUDE.md's "What this is") — a browser can't fetch an arbitrary
// third-party recipe URL client-side, since most recipe sites don't send
// permissive CORS headers. This function's ONLY job is: given a URL, fetch
// it server-side and hand back the raw HTML, so mc-import.js can parse it
// client-side exactly the way tools/test-mc-import.js's fixtures already
// exercise. No parsing happens here — that stays mc-import.js's job.
//
// Deliberately narrow, per the roadmap's own risk register ("ship the
// narrowest possible version... resist growing its responsibilities").
//
// SECURITY — this function fetches whatever URL a caller sends it, which
// is a classic SSRF surface (a caller could ask it to fetch an internal
// service, or a cloud metadata endpoint, instead of a real recipe page).
// Hardening, all mandatory and all exercised by manual verification before
// this shipped (no Deno-runtime test harness exists in this repo's CI —
// every other tools/test-*.js gate sandboxes browser JS with `vm`, which
// doesn't apply to a Deno edge function; see this PR's description for the
// manual verification transcript):
//   - Only http/https, only default ports (80/443), no embedded credentials.
//   - Every hostname — the initial URL AND each redirect hop — is DNS-
//     resolved and checked against private/loopback/link-local/reserved
//     ranges (including 169.254.169.254, the common cloud metadata address)
//     before being fetched. Redirects are followed manually (`redirect:
//     "manual"`), never automatically, specifically so a public URL that
//     301s to an internal address can't slip the check a naive
//     auto-follow would miss.
//   - 8s timeout, 3MB response cap (truncates rather than hangs — a
//     recipe's JSON-LD/ingredients are almost always near the top of the
//     document, and mc-import.js already degrades honestly on a malformed
//     trailing fragment via its own try/catch around JSON.parse).
//   - Deployed with verify_jwt: true (signed-in cooks only) — this repo's
//     Supabase project already has public (verify_jwt: false) utility
//     functions (`food`, `parse-food`), but the MCP deploy tool's own
//     guidance is to default new functions to JWT-required unless the
//     function implements its own auth, and a URL-fetch proxy is a
//     meaningfully larger abuse surface than a food-database lookup. This
//     does mean recipe import via URL needs sign-in even though hand-typing
//     a recipe (mc-recipe-form.js) doesn't — a deliberate, flagged
//     trade-off, not an oversight; revisit if that friction turns out to
//     matter once the capture UI actually ships.
//   - CORS is allow-listed to this app's real origin (+ localhost for the
//     `python3 -m http.server` dev flow CLAUDE.md documents) — worth being
//     honest that CORS only affects browser-enforced cross-origin reads,
//     not a script/curl caller, so it is not itself a security boundary;
//     the SSRF/size/timeout hardening above is what actually bounds abuse,
//     with JWT-required as the access gate.
// ==========================================================================

const ALLOWED_ORIGINS = new Set(["https://mcross2298.github.io"]);
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  };
  if (isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin as string;
  return h;
}

const MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a >= 224) return true; // multicast/reserved
  return false;
}
function isPrivateIPv6(ip: string): boolean {
  const low = ip.toLowerCase();
  if (low === "::1") return true;
  if (low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb")) return true; // fe80::/10
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7
  if (low.startsWith("::ffff:")) {
    const v4 = low.split(":").pop() || "";
    if (v4.includes(".")) return isPrivateIPv4(v4);
  }
  return false;
}

async function hostIsSafe(hostname: string): Promise<boolean> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return !isPrivateIPv4(hostname);
  if (hostname.includes(":")) return !isPrivateIPv6(hostname);
  if (hostname === "localhost") return false;

  let records: string[] = [];
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    records = [...a, ...aaaa];
  } catch {
    return false;
  }
  if (records.length === 0) return false; // unresolvable -> fail closed
  return records.every((ip) => (ip.includes(":") ? !isPrivateIPv6(ip) : !isPrivateIPv4(ip)));
}

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not_a_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "unsupported_protocol" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "non_standard_port" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  return { ok: true, url };
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function safeFetchHtml(
  startUrl: URL,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; reason: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await hostIsSafe(current.hostname))) return { ok: false, reason: "blocked_host" };

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "MikesCookbookRecipeImport/1.0 (+https://mcross2298.github.io/Mikes-Cookbook/)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
    } catch (e) {
      return { ok: false, reason: e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "fetch_failed" };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "redirect_without_location" };
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false, reason: "bad_redirect" };
      }
      const v = validateUrl(next.toString());
      if (!v.ok) return { ok: false, reason: v.reason };
      current = v.url;
      continue; // re-validated (incl. host safety) at the top of the next iteration
    }

    if (!res.ok) return { ok: false, reason: "http_" + res.status };

    const contentType = res.headers.get("content-type") || "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return { ok: false, reason: "not_html" };
    }

    const reader = res.body?.getReader();
    if (!reader) return { ok: false, reason: "empty_body" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // best effort
        }
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(concatChunks(chunks));
    return { ok: true, html, finalUrl: current.toString() };
  }
  return { ok: false, reason: "too_many_redirects" };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, origin);
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, origin);
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return jsonResponse({ ok: false, error: "missing_url" }, 400, origin);
  }

  const validated = validateUrl(body.url.trim());
  if (!validated.ok) {
    return jsonResponse({ ok: false, error: validated.reason }, 400, origin);
  }

  const result = await safeFetchHtml(validated.url);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.reason }, 502, origin);
  }
  return jsonResponse({ ok: true, html: result.html, finalUrl: result.finalUrl }, 200, origin);
});
