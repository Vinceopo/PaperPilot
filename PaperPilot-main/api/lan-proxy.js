/**
 * LAN proxy: phone → Node :8001 (firewall-allowed) → Python API :8000 (localhost).
 * Windows blocks inbound python.exe on Public Wi‑Fi; node.exe is allowed.
 */
const http = require("http");

const LISTEN_PORT = Number(process.env.PROXY_PORT || 8001);
const TARGET_HOST = process.env.API_HOST || "127.0.0.1";
const TARGET_PORT = Number(process.env.API_PORT || 8000);

// Strip hop-by-hop headers. Keep request Content-Length so uploads stream correctly.
// Drop response Content-Length / Transfer-Encoding so Node can reframe the body
// (forwarding both often breaks XHR on Android with a fake "network error").
const REQUEST_STRIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);
const RESPONSE_STRIP = new Set([...REQUEST_STRIP, "content-length"]);

function filterHeaders(src, strip) {
  const out = {};
  for (const [key, value] of Object.entries(src || {})) {
    if (strip.has(String(key).toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

const server = http.createServer((req, res) => {
  const headers = filterHeaders(req.headers, REQUEST_STRIP);
  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const outHeaders = filterHeaders(proxyRes.headers, RESPONSE_STRIP);
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ detail: `Proxy error: ${err.message}` }));
  });

  req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(
    `LAN proxy listening on 0.0.0.0:${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT}`
  );
});
