import http from "node:http";
import { spawn } from "node:child_process";

const PROXY_PORT = 5000;
const MASTRA_PORT = 5001;

let mastraReady = false;

console.log("[production.mjs] Starting healthcheck proxy on port " + PROXY_PORT);
console.log("[production.mjs] Will start Mastra on port " + MASTRA_PORT);
console.log("[production.mjs] CWD: " + process.cwd());
console.log("[production.mjs] NODE_ENV: " + process.env.NODE_ENV);

const proxy = http.createServer((req, res) => {
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (!mastraReady) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "starting" }));
    return;
  }

  const options = {
    hostname: "127.0.0.1",
    port: MASTRA_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] upstream error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "upstream error" }));
  });

  req.pipe(proxyReq, { end: true });
});

proxy.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log("[production.mjs] Healthcheck proxy running on port " + PROXY_PORT);
  startMastra();
});

proxy.on("error", (err) => {
  console.error("[production.mjs] Proxy failed to start:", err.message);
  process.exit(1);
});

function startMastra() {
  console.log("[production.mjs] Spawning Mastra child process...");
  
  const env = { ...process.env };
  env.PORT = String(MASTRA_PORT);
  delete env.REPLIT_DEV_DOMAIN;
  
  const mastra = spawn("node", ["index.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  mastra.stdout.on("data", (data) => {
    process.stdout.write("[mastra] " + data.toString());
  });

  mastra.stderr.on("data", (data) => {
    process.stderr.write("[mastra-err] " + data.toString());
  });

  mastra.on("error", (err) => {
    console.error("[production.mjs] Failed to spawn Mastra:", err.message);
  });

  mastra.on("exit", (code, signal) => {
    console.error("[production.mjs] Mastra exited with code=" + code + " signal=" + signal);
    process.exit(code || 1);
  });

  function checkMastra() {
    http
      .get("http://127.0.0.1:" + MASTRA_PORT + "/api", (res) => {
        if (res.statusCode < 500) {
          mastraReady = true;
          console.log("[production.mjs] Mastra is ready on port " + MASTRA_PORT + ", proxy forwarding enabled");
        } else {
          console.log("[production.mjs] Mastra not ready yet, status=" + res.statusCode);
          setTimeout(checkMastra, 2000);
        }
        res.resume();
      })
      .on("error", (err) => {
        console.log("[production.mjs] Waiting for Mastra... (" + err.code + ")");
        setTimeout(checkMastra, 2000);
      });
  }

  setTimeout(checkMastra, 3000);
}
