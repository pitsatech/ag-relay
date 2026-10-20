const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;
const DEFAULT_TARGET = "https://daily-cloudcode-pa.googleapis.com";

const ALLOW_REQ = new Set(["authorization", "content-type", "accept", "user-agent"]);
function allowed(name) {
  const n = name.toLowerCase();
  if (ALLOW_REQ.has(n)) return true;
  if (n.startsWith("x-goog-")) return true;
  return false;
}

const STRIP_RES = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

app.use(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }

  const target = req.headers["x-relay-target"] || DEFAULT_TARGET;
  const path = req.headers["x-relay-path"] || req.url;
  const url = new URL(path, target);

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!allowed(k)) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : v;
  }

  const init = { method: req.method, headers, redirect: "follow" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
    init.duplex = "half";
  }

  let upstream;
  try {
    upstream = await fetch(url.toString(), init);
  } catch (e) {
    res.statusCode = 502;
    return res.end("relay fetch failed: " + e.message);
  }

  res.statusCode = upstream.status;
  upstream.headers.forEach((v, k) => {
    if (!STRIP_RES.has(k.toLowerCase())) res.setHeader(k, v);
  });

  if (!upstream.body) return res.end();
  for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
  res.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Relay running on port ${PORT}`);
});
