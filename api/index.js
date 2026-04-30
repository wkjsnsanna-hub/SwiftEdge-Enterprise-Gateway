import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * SwiftEdge Eco-Safe v6.2
 * Resource-Optimized & Stable Connection Engine
 */
export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
};

const REMOTE_UPSTREAM = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");
const MAX_PAYLOAD = 10 * 1024 * 1024; // سقف ۱۰ مگابایت

// ایجاد تأخیر ثابت و سبک برای پینگ مصنوعی
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * ایجاد محدودیت سرعت با مصرف صفر CPU
 */
const createSafeThrottler = () => {
  return new Transform({
    highWaterMark: 16384, // محدود کردن بافر برای مصرف حداقل رم
    transform(chunk, encoding, callback) {
      // ایجاد وقفه ۳۰ میلی‌ثانیه‌ای برای ثبات و مصرف کم
      setTimeout(() => callback(null, chunk), 30);
    }
  });
};

export default async function handle(req, res) {
  const url = req.url || "/";

  // صفحه ویترینی بسیار سبک (بدون بارگذاری دیتای اضافی)
  if (!REMOTE_UPSTREAM || url === "/" || url === "/favicon.ico") {
    res.setHeader("Content-Type", "text/html");
    return res.end(`<html><body style="background:#000;color:#111;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">SwiftEdge_Active_Node_6.2</body></html>`);
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 45000); // ۴۵ ثانیه سقف کل درخواست

  try {
    await sleep(200); // پینگ اولیه

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lowK = k.toLowerCase();
      if (!lowK.startsWith("x-vercel-") && lowK !== "host") {
        headers[lowK] = Array.isArray(v) ? v.join(", ") : v;
      }
    }

    const upstream = await fetch(`${REMOTE_UPSTREAM}${url}`, {
      method: req.method,
      headers,
      redirect: "manual",
      signal: abortController.signal
    });

    const size = parseInt(upstream.headers.get("content-length") || "0");
    if (size > MAX_PAYLOAD) {
      clearTimeout(timeoutId);
      res.statusCode = 413;
      return res.end("Size Limit");
    }

    res.statusCode = upstream.status;
    upstream.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "transfer-encoding") {
        try { res.setHeader(k, v); } catch {}
      }
    });

    if (upstream.body) {
      // استفاده از خط لوله امن برای انتقال دیتا با کمترین مصرف منابع
      await pipeline(
        Readable.fromWeb(upstream.body),
        createSafeThrottler(),
        res
      );
    } else {
      res.end();
    }
  } catch (err) {
    // مدیریت خطا بدون ایجاد فشار به سرور
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Node_Offline");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}