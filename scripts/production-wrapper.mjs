import http from "node:http";
import { seedProductionDB } from "./seed-production.mjs";

const PROXY_PORT = parseInt(process.env.PORT || "5000", 10);
const MASTRA_PORT = PROXY_PORT + 1;
let mastraReady = false;

const proxy = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health" || req.url === "") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  if (!mastraReady) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"starting"}');
    return;
  }

  const proxyReq = http.request(
    { hostname: "127.0.0.1", port: MASTRA_PORT, path: req.url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on("error", () => {
    res.writeHead(502);
    res.end('{"error":"upstream"}');
  });
  req.pipe(proxyReq, { end: true });
});

proxy.listen(PROXY_PORT, "0.0.0.0", async () => {
  console.log("[wrapper] Healthcheck proxy ready on port " + PROXY_PORT);

  try {
    await seedProductionDB();
  } catch (err) {
    console.error("[wrapper] Seed error (non-fatal):", err.message);
  }

  process.env.PORT = String(MASTRA_PORT);

  try {
    await import("./index.mjs");
    console.log("[wrapper] Mastra imported and started on port " + MASTRA_PORT);
  } catch (err) {
    console.error("[wrapper] Failed to start Mastra:", err);
    process.exit(1);
  }

  function check() {
    http.get("http://127.0.0.1:" + MASTRA_PORT + "/api", (res) => {
      if (res.statusCode < 500) {
        mastraReady = true;
        console.log("[wrapper] Mastra ready, forwarding enabled");
      } else {
        setTimeout(check, 1000);
      }
      res.resume();
    }).on("error", () => setTimeout(check, 1000));
  }
  setTimeout(check, 1000);
});
