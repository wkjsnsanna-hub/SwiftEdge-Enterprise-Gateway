import { Readable, Writable } from "node:stream";

/**
 * SwiftEdge v6.6 - Balanced Stealth
 * Optimized for smoother data flow while maintaining stealth.
 */
export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 45,
};

const REMOTE_UPSTREAM = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");
const SECRET_PATH = "/api/v1/node";
const MAX_PAYLOAD = 12 * 1024 * 1024;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handle(req, res) {
  const url = req.url || "/";

  if (!url.startsWith(SECRET_PATH) || !REMOTE_UPSTREAM) {
    res.setHeader("Content-Type", "text/html");
    return res.end(`<html><body style="background:#000;color:#111;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">SwiftEdge_Core_v6.6</body></html>`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    // کاهش تأخیر اولیه برای استارت سریع‌تر (۵۰ میلی‌ثانیه)
    await sleep(50);

    const actualPath = url.replace(SECRET_PATH, "");
    const targetUrl = `${REMOTE_UPSTREAM}${actualPath}`;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase();
      if (!key.startsWith("x-vercel-") && key !== "host") {
        headers[key] = v;
      }
    }

    const fetchOptions = {
      method: req.method,
      headers,
      redirect: "manual",
      signal: controller.signal
    };

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      fetchOptions.body = Readable.toWeb(req);
      fetchOptions.duplex = "half";
    }

    const response = await fetch(targetUrl, fetchOptions);

    // انتقال سریع هدرها
    res.statusCode = response.status;
    for (const [k, v] of response.headers) {
      if (k.toLowerCase() !== "transfer-encoding") {
        try { res.setHeader(k, v); } catch {}
      }
    }

    res.setHeader("Server", "SwiftEdge-Balanced/6.6");

    if (response.body) {
      // استفاده از pipeTo برای سرعت روان‌تر و جلوگیری از حالت "بایت به بایت"
      await response.body.pipeTo(Writable.toWeb(res));
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Node_Error");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}