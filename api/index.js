import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * SwiftEdge Gateway v4.5 - Optimized for Social Media & Chat (Low Profile)
 */
export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 45, // کاهش زمان برای جلوگیری از نگه داشتن طولانی مدت منابع
};

const REMOTE_UPSTREAM = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");
const GATEWAY_KEY = process.env.GATEWAY_KEY || "";
const MAX_RESPONSE_SIZE = 15 * 1024 * 1024; // سقف ۱۵ مگابایت (مناسب برای تلگرام و اینستاگرام)

const SENSITIVE_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "via",
  "x-vercel-id", "x-vercel-forwarded-for"
]);

// ایجاد یک تأخیر تصادفی کوچک برای شبیه‌سازی رفتار طبیعی انسان
const jitter = () => new Promise(r => setTimeout(r, Math.random() * 200 + 50));

function sanitizeHeaders(incoming) {
  const clean = {};
  for (const [key, value] of Object.entries(incoming)) {
    const k = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(k) || k.startsWith("x-vercel-")) continue;
    clean[k] = Array.isArray(value) ? value.join(", ") : value;
  }
  clean["x-requested-with"] = "SwiftEdge-Mobile";
  return clean;
}

export default async function handle(req, res) {
  if (!REMOTE_UPSTREAM || req.url === "/" || req.url === "/favicon.ico") {
    res.setHeader("Content-Type", "text/html");
    return res.end(`
      <!DOCTYPE html><html><head><title>SwiftEdge | Access Point</title><style>
      body{background:#0a0a0a;color:#444;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
      .box{border:1px solid #222;padding:20px;border-radius:4px}
      </style></head><body><div class="box">Node: SwiftEdge-V4.5-Active</div></body></html>
    `);
  }

  // احراز هویت (اگر کلید ست شده باشد)
  if (GATEWAY_KEY) {
    const key = req.headers["x-gateway-key"] || new URL(req.url, "http://h").searchParams.get("key");
    if (key !== GATEWAY_KEY) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
  }

  try {
    // اعمال تأخیر کوچک برای "طبیعی" جلوه دادن ترافیک
    await jitter();

    const target = `${REMOTE_UPSTREAM}${req.url}`;
    const options = {
      method: req.method,
      headers: sanitizeHeaders(req.headers),
      redirect: "manual",
      // تعیین تایم‌اوت برای جلوگیری از باز ماندن طولانی ارتباط
      signal: AbortSignal.timeout(40000) 
    };

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      options.body = Readable.toWeb(req);
      options.duplex = "half";
    }

    const upstreamResponse = await fetch(target, options);
    
    // محدودیت حجم برای جلوگیری از مصرف غیرعادی
    const size = parseInt(upstreamResponse.headers.get("content-length") || "0");
    if (size > MAX_RESPONSE_SIZE) {
      res.statusCode = 413;
      return res.end("Limited: Content too large for current tier.");
    }

    res.statusCode = upstreamResponse.status;
    upstreamResponse.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key !== "transfer-encoding" && !key.startsWith("x-v2ray")) {
        try { res.setHeader(k, v); } catch {}
      }
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (upstreamResponse.body) {
      await pipeline(Readable.fromWeb(upstreamResponse.body), res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Node Offline");
    }
  }
}