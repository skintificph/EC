import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  DASHBOARD_PASSWORD: "test-password",
  AUTH_SECRET: "test-secret-with-enough-entropy",
};

async function fetchWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
}

async function authenticatedCookie() {
  const response = await fetchWorker(
    new Request("https://localhost/login", {
      method: "POST",
      body: new URLSearchParams({ password: env.DASHBOARD_PASSWORD }),
    }),
  );
  assert.equal(response.status, 303);
  return response.headers.get("set-cookie").split(";")[0];
}

async function render() {
  const cookie = await authenticatedCookie();
  return fetchWorker(
    new Request("https://localhost/", {
      headers: { accept: "text/html", host: "localhost", cookie },
    }),
  );
}

test("protects pages and data endpoints with a shared password", async () => {
  const page = await fetchWorker(
    new Request("https://localhost/", { headers: { accept: "text/html" } }),
  );
  assert.equal(page.status, 303);
  assert.equal(page.headers.get("location"), "/login");

  const data = await fetchWorker(
    new Request("https://localhost/sea-sale.json", { headers: { accept: "application/json" } }),
  );
  assert.equal(data.status, 401);

  const wrongPassword = await fetchWorker(
    new Request("https://localhost/login", {
      method: "POST",
      body: new URLSearchParams({ password: "wrong" }),
    }),
  );
  assert.equal(wrongPassword.status, 401);
  assert.match(await wrongPassword.text(), /密码不正确/);
});

test("server-renders the SEA sales dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /SEA 销售经营看板/);
  assert.match(html, /东南亚销售/);
  assert.match(html, /TikTok、Shopee、Lazada/);
  assert.match(html, /筛选与时间/);
  assert.match(html, /时间粒度/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("includes the meeting notes and automatic review modules", async () => {
  const source = await readFile(new URL("../app/sales-dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /数据刷新摘要/);
  assert.match(source, /会议小结与分析结论/);
  assert.match(source, /全渠道总览/);
  assert.match(source, /周期累计分析/);
  assert.match(source, /短周期监控/);
  assert.match(source, /开始日期/);
  assert.match(source, /结束日期/);
  assert.match(source, /上一等长周期/);
  assert.match(source, /type="date"/);
  assert.match(source, /type="month"/);
});

test("ships a complete SEA-sale fallback snapshot", async () => {
  const raw = await readFile(new URL("../public/sea-sale.json", import.meta.url), "utf8");
  const payload = JSON.parse(raw);
  assert.equal(payload.currency, "CNY");
  assert.equal(payload.rows.length, 10843);
  assert.equal(payload.rows.filter((row) => row.total > 0).at(-1).date, "2026-07-20");
  assert.deepEqual(
    [...new Set(payload.rows.map((row) => row.country))].sort(),
    ["印尼", "新加坡", "泰国", "菲律宾", "越南", "马来"].sort(),
  );
});
