/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DASHBOARD_PASSWORD?: string;
  AUTH_SECRET?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const AUTH_COOKIE = "sea_dashboard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function loginPage(message = "") {
  const notice = message ? `<p class="notice">${message}</p>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>访问验证 · SEA 销售经营看板</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans SC", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #343038;
      background: radial-gradient(circle at 18% 12%, #ead8d8 0, transparent 35%),
                  radial-gradient(circle at 84% 18%, #d8d9e4 0, transparent 38%), #f4f0ee; }
    main { width: min(92vw, 420px); padding: 38px; border: 1px solid rgba(75,67,78,.12);
      border-radius: 26px; background: rgba(255,255,255,.82); box-shadow: 0 22px 70px rgba(69,59,72,.12);
      backdrop-filter: blur(18px); }
    .eyebrow { margin: 0 0 12px; color: #98737d; font-size: 12px; font-weight: 800; letter-spacing: .15em; }
    h1 { margin: 0; font-size: 30px; letter-spacing: -.04em; }
    .subtitle { margin: 12px 0 28px; color: #756d78; line-height: 1.7; }
    label { display: block; margin-bottom: 9px; font-size: 13px; font-weight: 700; }
    input { width: 100%; height: 48px; padding: 0 14px; border: 1px solid #d9d1d5; border-radius: 13px;
      background: #fff; color: #343038; font: inherit; outline: none; }
    input:focus { border-color: #a88791; box-shadow: 0 0 0 4px rgba(168,135,145,.13); }
    button { width: 100%; height: 48px; margin-top: 14px; border: 0; border-radius: 13px; color: #fff;
      background: #47414f; font: inherit; font-weight: 800; cursor: pointer; }
    button:hover { background: #393440; }
    .notice { margin: 0 0 14px; padding: 10px 12px; border-radius: 10px; color: #8a4f5c; background: #f5e5e7; font-size: 13px; }
    .foot { margin: 20px 0 0; color: #958d96; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">SEA · SALES INTELLIGENCE</p>
    <h1>访问经营看板</h1>
    <p class="subtitle">请输入团队共享密码。登录状态将在此设备保留 7 天。</p>
    ${notice}
    <form method="post" action="/login">
      <label for="password">共享密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">进入看板</button>
    </form>
    <p class="foot">SKINTIFIC SEA · 内部数据</p>
  </main>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

function redirect(location: string, cookie?: string) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function hasValidSession(request: Request, secret: string) {
  const token = getCookie(request, AUTH_COOKIE);
  const [expiresAt, signature] = token.split(".");
  if (!/^\d+$/.test(expiresAt ?? "") || !signature || Number(expiresAt) <= Date.now()) return false;
  return constantTimeEqual(signature, await sign(secret, expiresAt));
}

async function createSessionCookie(secret: string) {
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  const signature = await sign(secret, expiresAt);
  return `${AUTH_COOKIE}=${expiresAt}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!env.DASHBOARD_PASSWORD || !env.AUTH_SECRET) {
      return htmlResponse("<h1>看板访问保护尚未完成配置</h1>", 503);
    }

    const authenticated = await hasValidSession(request, env.AUTH_SECRET);

    if (url.pathname === "/login" && request.method === "GET") {
      return authenticated ? redirect("/") : htmlResponse(loginPage());
    }

    if (url.pathname === "/login" && request.method === "POST") {
      const form = await request.formData();
      const password = String(form.get("password") ?? "");
      if (!constantTimeEqual(password, env.DASHBOARD_PASSWORD)) {
        return htmlResponse(loginPage("密码不正确，请重试。"), 401);
      }
      return redirect("/", await createSessionCookie(env.AUTH_SECRET));
    }

    if (url.pathname === "/logout") {
      return redirect(
        "/login",
        `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    if (!authenticated) {
      if (request.headers.get("accept")?.includes("text/html")) return redirect("/login");
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
