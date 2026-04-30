import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * SwiftEdge v6.5 - Stealth API Mode
 * Hidden behind a custom API path to avoid detection.
 */
export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 45,
};

const REMOTE_UPSTREAM = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");
const SECRET_PATH = "/api/v1/node"; // مسیر مخفی برای پروکسی
const MAX_PAYLOAD = 10 * 1024 * 1024;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handle(req, res) {
  const url = req.url || "/";

  // ۱. استتار: اگر درخواست به مسیر مخفی نباشد، یک صفحه عادی نشان بده
  if (!url.startsWith(SECRET_PATH) || !REMOTE_UPSTREAM) {
    res.setHeader("Content-Type", "text/html");
    res.statusCode = 200;
    return res.end(`<html><head><title>API Node Active</title></head><body style="background:#000;color:#111;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">SwiftEdge_Core_Online_6.5</body></html>`);
  }

  // ایجاد تایم‌اوت
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    // ۲. ایجاد پینگ مصنوعی
    await sleep(150);

    // استخراج مسیر واقعی از درخواست
    const actualPath = url.replace(SECRET_PATH, "");
    const targetUrl = `${REMOTE_UPSTREAM}${actualPath}`;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase();
      // ۳. پاکسازی هدرها و تغییر User-Agent برای عدم شناسایی
      if (!key.startsWith("x-vercel-") && key !== "host") {
        headers[key] = v;
      }
    }

    // اضافه کردن هدرهای گمراه‌کننده
    headers["x-swiftedge-node"] = "v6.5-stable";

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

    // ۴. بررسی محدودیت حجم
    const length = parseInt(response.headers.get("content-length") || "0");
    if (length > MAX_PAYLOAD) {
      clearTimeout(timeoutId);
      res.statusCode = 413;
      return res.end("Payload Limit");
    }

    res.statusCode = response.status;
    response.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "transfer-encoding") {
        try { res.setHeader(k, v); } catch { }
      }
    });

    // ۵. ماسک کردن هدر سرور
    res.setHeader("Server", "SwiftEdge-API-Engine/6.5");

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Node_Connection_Error");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}