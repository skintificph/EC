"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SaleRow = {
  date: string;
  country: string;
  brand: string;
  tt: number;
  ttSubsidy: number;
  sp: number;
  spSubsidy: number;
  spPriceSubsidy: number;
  spCouponSubsidy: number;
  merchantCoupon: number;
  lzd: number;
  shelf: number;
  total: number;
};

type Totals = Pick<SaleRow, "tt" | "ttSubsidy" | "sp" | "spSubsidy" | "lzd" | "shelf" | "total">;
type View = "overview" | "month" | "recent";

const EMPTY: Totals = { tt: 0, ttSubsidy: 0, sp: 0, spSubsidy: 0, lzd: 0, shelf: 0, total: 0 };
const COLORS = { tt: "#8fa89a", sp: "#8ea6b4", lzd: "#c7b18a", ttSub: "#ad8794", spSub: "#8b789a" };

function sum(rows: SaleRow[]): Totals {
  return rows.reduce(
    (a, r) => ({
      tt: a.tt + r.tt,
      ttSubsidy: a.ttSubsidy + r.ttSubsidy,
      sp: a.sp + r.sp,
      spSubsidy: a.spSubsidy + r.spSubsidy,
      lzd: a.lzd + r.lzd,
      shelf: a.shelf + r.shelf,
      total: a.total + r.total,
    }),
    { ...EMPTY },
  );
}

function money(value: number, compact = true) {
  if (!Number.isFinite(value)) return "—";
  if (compact && Math.abs(value) >= 100_000_000) return `¥${(value / 100_000_000).toFixed(2)}亿`;
  if (compact && Math.abs(value) >= 10_000) return `¥${(value / 10_000).toFixed(1)}万`;
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function percent(value: number) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function growth(current: number, previous: number) {
  return previous > 0 ? current / previous - 1 : Number.NaN;
}

function deltaLabel(value: number) {
  if (!Number.isFinite(value)) return "历史不足";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function aggregateByDay(rows: SaleRow[]) {
  const map = new Map<string, SaleRow[]>();
  rows.forEach((row) => map.set(row.date, [...(map.get(row.date) ?? []), row]));
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...sum(values) }));
}

function periodRows(rows: SaleRow[], asOf: string) {
  const d = utcDate(asOf);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const previous = new Date(Date.UTC(year, month - 1, 1));
  const previousLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    current: rows.filter((r) => {
      const x = utcDate(r.date);
      return x.getUTCFullYear() === year && x.getUTCMonth() === month && x.getUTCDate() <= day;
    }),
    previous: rows.filter((r) => {
      const x = utcDate(r.date);
      return (
        x.getUTCFullYear() === previous.getUTCFullYear() &&
        x.getUTCMonth() === previous.getUTCMonth() &&
        x.getUTCDate() <= Math.min(day, previousLastDay)
      );
    }),
    yoy: rows.filter((r) => {
      const x = utcDate(r.date);
      return x.getUTCFullYear() === year - 1 && x.getUTCMonth() === month && x.getUTCDate() <= day;
    }),
  };
}

function Change({ value, suffix = "" }: { value: number; suffix?: string }) {
  const positive = Number.isFinite(value) && value >= 0;
  return (
    <span className={`change ${!Number.isFinite(value) ? "neutral" : positive ? "up" : "down"}`}>
      {Number.isFinite(value) ? `${positive ? "↑" : "↓"} ${Math.abs(value * 100).toFixed(1)}${suffix || "%"}` : "历史不足"}
    </span>
  );
}

function KpiCard({ eyebrow, value, note, tone }: { eyebrow: string; value: string; note: React.ReactNode; tone: string }) {
  return (
    <article className="kpi-card" style={{ "--tone": tone } as React.CSSProperties}>
      <div className="kpi-top"><span className="tone-dot" />{eyebrow}</div>
      <strong>{value}</strong>
      <div className="kpi-note">{note}</div>
    </article>
  );
}

function ComparisonBars({ current, previous, yoy }: { current: Totals; previous: Totals; yoy: Totals }) {
  const rows = [
    { label: "TikTok", key: "tt" as const, color: COLORS.tt },
    { label: "Shopee", key: "sp" as const, color: COLORS.sp },
    { label: "Lazada", key: "lzd" as const, color: COLORS.lzd },
  ];
  const max = Math.max(1, ...rows.flatMap((r) => [current[r.key], previous[r.key], yoy[r.key]]));
  return (
    <div className="comparison-bars">
      {rows.map((row) => (
        <div className="channel-row" key={row.key}>
          <div className="channel-label"><span style={{ background: row.color }} />{row.label}</div>
          <div className="bar-cluster">
            <div className="bar-line"><i className="bar current" style={{ width: `${(current[row.key] / max) * 100}%`, background: row.color }} /><b>{money(current[row.key])}</b></div>
            <div className="bar-line"><i className="bar previous" style={{ width: `${(previous[row.key] / max) * 100}%`, background: row.color }} /><b>{money(previous[row.key])}</b></div>
            <div className="bar-line"><i className="bar yoy" style={{ width: `${(yoy[row.key] / max) * 100}%`, background: row.color }} /><b>{money(yoy[row.key])}</b></div>
          </div>
        </div>
      ))}
      <div className="bar-legend"><span><i className="legend-solid" />本月同期</span><span><i className="legend-soft" />上月同期</span><span><i className="legend-faint" />去年同期</span></div>
    </div>
  );
}

function TrendCanvas({ data }: { data: Array<{ date: string } & Totals> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const draw = () => {
      const width = canvas.parentElement?.clientWidth ?? 900;
      const height = 330;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      const pad = { left: 58, right: 58, top: 18, bottom: 46 };
      const cw = width - pad.left - pad.right;
      const ch = height - pad.top - pad.bottom;
      const maxSale = Math.max(1, ...data.map((d) => d.total)) * 1.12;
      const maxSub = Math.max(1, ...data.map((d) => d.ttSubsidy + d.spSubsidy)) * 1.15;
      ctx.font = "11px system-ui";
      ctx.fillStyle = "#817b80";
      ctx.strokeStyle = "#e8e1de";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = pad.top + (ch / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
        const value = maxSale * (1 - i / 4);
        ctx.fillText(value >= 10000 ? `${(value / 10000).toFixed(0)}万` : value.toFixed(0), 8, y + 4);
      }
      const slot = cw / data.length;
      const barWidth = Math.max(4, Math.min(20, slot * 0.58));
      data.forEach((d, i) => {
        const x = pad.left + i * slot + (slot - barWidth) / 2;
        let bottom = pad.top + ch;
        ([{ v: d.tt, c: COLORS.tt }, { v: d.sp, c: COLORS.sp }, { v: d.lzd, c: COLORS.lzd }]).forEach((part) => {
          const h = (part.v / maxSale) * ch;
          ctx.fillStyle = part.c; ctx.fillRect(x, bottom - h, barWidth, h); bottom -= h;
        });
        if (i % Math.max(1, Math.ceil(data.length / 10)) === 0 || i === data.length - 1) {
          ctx.save(); ctx.translate(x + barWidth / 2, height - 25); ctx.rotate(-0.45); ctx.fillStyle = "#817b80"; ctx.fillText(d.date.slice(5), 0, 0); ctx.restore();
        }
      });
      const line = (key: "ttSubsidy" | "spSubsidy", color: string) => {
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = pad.left + slot * (i + 0.5);
          const y = pad.top + ch - (d[key] / maxSub) * ch;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
        data.forEach((d, i) => {
          const x = pad.left + slot * (i + 0.5);
          const y = pad.top + ch - (d[key] / maxSub) * ch;
          ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        });
      };
      line("ttSubsidy", COLORS.ttSub);
      line("spSubsidy", COLORS.spSub);
      ctx.fillStyle = "#817b80";
      ctx.textAlign = "right";
      ctx.fillText(`${money(maxSub)}`, width - 6, pad.top + 4);
      ctx.fillText("补贴", width - 6, pad.top + 20);
      ctx.textAlign = "left";
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [data]);
  return <canvas ref={ref} aria-label="本月每日各渠道销售柱状图，以及 TikTok 和 Shopee 平台补贴趋势折线图" />;
}

export function SalesDashboard() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [country, setCountry] = useState("全部国家");
  const [brand, setBrand] = useState("全部品牌");
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        let response = await fetch("/api/sea-sale");
        if (!response.ok) response = await fetch("/sea-sale.json");
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || "数据读取失败");
        setRows(payload.rows);
        setRefreshedAt(payload.refreshedAt);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "数据读取失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const brands = useMemo(() => [...new Set(rows.filter((r) => country === "全部国家" || r.country === country).map((r) => r.brand))].sort(), [rows, country]);
  const filtered = useMemo(() => rows.filter((r) => (country === "全部国家" || r.country === country) && (brand === "全部品牌" || r.brand === brand)), [rows, country, brand]);
  const asOf = useMemo(() => filtered.filter((r) => r.total > 0).reduce((max, r) => (r.date > max ? r.date : max), ""), [filtered]);
  const periods = useMemo(() => asOf ? periodRows(filtered, asOf) : { current: [], previous: [], yoy: [] }, [filtered, asOf]);
  const current = useMemo(() => sum(periods.current), [periods.current]);
  const previous = useMemo(() => sum(periods.previous), [periods.previous]);
  const yoy = useMemo(() => sum(periods.yoy), [periods.yoy]);
  const shelfShare = current.total ? current.shelf / current.total : 0;
  const prevShelfShare = previous.total ? previous.shelf / previous.total : Number.NaN;
  const yesterday = useMemo(() => sum(filtered.filter((r) => r.date === asOf)), [filtered, asOf]);
  const last7 = useMemo(() => asOf ? sum(filtered.filter((r) => r.date >= addDays(asOf, -6) && r.date <= asOf)) : { ...EMPTY }, [filtered, asOf]);
  const prev7 = useMemo(() => asOf ? sum(filtered.filter((r) => r.date >= addDays(asOf, -13) && r.date <= addDays(asOf, -7))) : { ...EMPTY }, [filtered, asOf]);
  const daily = useMemo(() => aggregateByDay(periods.current), [periods.current]);
  const matrix = useMemo(() => {
    if (!asOf) return [];
    const keys = [...new Set(rows.map((r) => `${r.country}|${r.brand}`))];
    return keys.map((key) => {
      const [c, b] = key.split("|");
      const p = periodRows(rows.filter((r) => r.country === c && r.brand === b), asOf);
      const now = sum(p.current); const prev = sum(p.previous); const lastYear = sum(p.yoy);
      return { country: c, brand: b, ...now, mom: growth(now.total, prev.total), yoy: growth(now.total, lastYear.total) };
    }).filter((r) => (country === "全部国家" || r.country === country) && (brand === "全部品牌" || r.brand === brand)).sort((a, b) => b.total - a.total);
  }, [rows, asOf, country, brand]);

  const tabs: Array<{ id: View; label: string; hint: string }> = [
    { id: "overview", label: "全渠道总览", hint: "国家 × 品牌" },
    { id: "month", label: "月累计分析", hint: "MTD 同期对比" },
    { id: "recent", label: "短周期监控", hint: "昨日与近7天" },
  ];

  return (
    <main>
      <header className="hero">
        <div>
          <div className="overline">SEA · SALES INTELLIGENCE</div>
          <h1>东南亚销售<br /><em>经营看板</em></h1>
          <p>TikTok、Shopee、Lazada 全渠道经营洞察 · 人民币口径</p>
        </div>
        <div className="status-card">
          <span className={`pulse ${error ? "error" : ""}`} />
          <div><small>数据截止日期</small><strong>{asOf || "读取中…"}</strong><span>{refreshedAt ? `看板更新 ${new Date(refreshedAt).toLocaleString("zh-CN", { hour12: false })}` : "正在连接数据源"}</span></div>
        </div>
      </header>

      <nav className="tabs" aria-label="看板视图">
        {tabs.map((tab) => <button key={tab.id} className={view === tab.id ? "active" : ""} onClick={() => setView(tab.id)}><b>{tab.label}</b><span>{tab.hint}</span></button>)}
      </nav>

      <section className="filter-panel">
        <div className="filter-copy"><span>VIEW CONTROL</span><h2>筛选视图</h2><p>所有指标与图表同步更新</p></div>
        <label>国家<select value={country} onChange={(e) => { setCountry(e.target.value); setBrand("全部品牌"); }}><option>全部国家</option>{countries.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>品牌<select value={brand} onChange={(e) => setBrand(e.target.value)}><option>全部品牌</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></label>
        <div className="scope-chip"><span>当前范围</span><strong>{country.replace("全部", "全")} · {brand.replace("全部", "全")}</strong><small>本月 1 日 — {asOf ? utcDate(asOf).getUTCDate() : "—"} 日</small></div>
      </section>

      {loading && <section className="state-panel"><div className="loader" /><h2>正在整理 10,000+ 条销售记录</h2><p>统一人民币口径并识别最新真实数据日</p></section>}
      {error && <section className="state-panel error-state"><h2>暂时无法读取在线表格</h2><p>{error}</p><button onClick={() => location.reload()}>重新读取</button></section>}

      {!loading && !error && (
        <>
          <section className="kpi-grid">
            <KpiCard eyebrow="本月全渠道销售" value={money(current.total)} tone="#7f9489" note={<>环比上月同期 <Change value={growth(current.total, previous.total)} /></>} />
            <KpiCard eyebrow="TikTok 销售" value={money(current.tt)} tone={COLORS.tt} note={<>占全渠道 {percent(current.total ? current.tt / current.total : 0)}</>} />
            <KpiCard eyebrow="货架销售" value={money(current.shelf)} tone={COLORS.sp} note={<>Shopee {money(current.sp)} · Lazada {money(current.lzd)}</>} />
            <KpiCard eyebrow="TT 平台补贴" value={money(current.ttSubsidy)} tone={COLORS.ttSub} note={<>补贴率 {percent(current.tt ? current.ttSubsidy / current.tt : 0)}</>} />
            <KpiCard eyebrow="SP 平台补贴" value={money(current.spSubsidy)} tone={COLORS.spSub} note={<>补贴率 {percent(current.sp ? current.spSubsidy / current.sp : 0)}</>} />
            <KpiCard eyebrow="货架占比" value={percent(shelfShare)} tone={COLORS.lzd} note={<>较上月同期 <Change value={shelfShare - prevShelfShare} suffix="pp" /></>} />
          </section>

          {view === "overview" && (
            <section className="content-card">
              <div className="section-heading"><div><span>01 / OVERVIEW</span><h2>国家 × 品牌全渠道销售</h2><p>本月累计销售，按全渠道金额排序</p></div><div className="mini-summary"><small>覆盖组合</small><strong>{matrix.length}</strong></div></div>
              <div className="table-wrap"><table><thead><tr><th>国家 / 品牌</th><th>全渠道</th><th>环比</th><th>同比</th><th>TikTok</th><th>Shopee</th><th>Lazada</th><th>货架占比</th><th>TT补贴</th><th>SP补贴</th></tr></thead><tbody>{matrix.map((r) => <tr key={`${r.country}-${r.brand}`}><td><b>{r.brand}</b><span>{r.country}</span></td><td><strong>{money(r.total)}</strong></td><td><span className={Number.isFinite(r.mom) && r.mom >= 0 ? "table-up" : "table-down"}>{deltaLabel(r.mom)}</span></td><td><span className={Number.isFinite(r.yoy) && r.yoy >= 0 ? "table-up" : "table-down"}>{deltaLabel(r.yoy)}</span></td><td>{money(r.tt)}</td><td>{money(r.sp)}</td><td>{money(r.lzd)}</td><td>{percent(r.total ? r.shelf / r.total : 0)}</td><td>{money(r.ttSubsidy)}</td><td>{money(r.spSubsidy)}</td></tr>)}</tbody></table></div>
            </section>
          )}

          {view === "month" && (
            <div className="two-column">
              <section className="content-card">
                <div className="section-heading"><div><span>02 / MONTH TO DATE</span><h2>分渠道销售对比</h2><p>本月同期、上月同期与去年同期</p></div></div>
                <ComparisonBars current={current} previous={previous} yoy={yoy} />
              </section>
              <section className="content-card insight-card">
                <div className="section-heading"><div><span>PERFORMANCE NOTES</span><h2>月累计概览</h2><p>同口径期间变化</p></div></div>
                <div className="insight-list">
                  <div><span>全渠道环比</span><strong>{deltaLabel(growth(current.total, previous.total))}</strong><Change value={growth(current.total, previous.total)} /></div>
                  <div><span>全渠道同比</span><strong>{deltaLabel(growth(current.total, yoy.total))}</strong><Change value={growth(current.total, yoy.total)} /></div>
                  <div><span>TT平台补贴环比</span><strong>{deltaLabel(growth(current.ttSubsidy, previous.ttSubsidy))}</strong><Change value={growth(current.ttSubsidy, previous.ttSubsidy)} /></div>
                  <div><span>SP平台补贴环比</span><strong>{deltaLabel(growth(current.spSubsidy, previous.spSubsidy))}</strong><Change value={growth(current.spSubsidy, previous.spSubsidy)} /></div>
                  <div><span>货架占比变化</span><strong>{Number.isFinite(prevShelfShare) ? `${((shelfShare - prevShelfShare) * 100).toFixed(1)}pp` : "历史不足"}</strong><span className="muted">当前 {percent(shelfShare)}</span></div>
                </div>
              </section>
            </div>
          )}

          {view === "recent" && (
            <>
              <section className="period-grid">
                <article className="period-card"><span>YESTERDAY · {asOf.slice(5)}</span><h2>昨日达成</h2><strong>{money(yesterday.total)}</strong><div className="period-breakdown"><i style={{ background: COLORS.tt }} />TT {money(yesterday.tt)}<i style={{ background: COLORS.sp }} />SP {money(yesterday.sp)}<i style={{ background: COLORS.lzd }} />LZD {money(yesterday.lzd)}</div></article>
                <article className="period-card dark"><span>LAST 7 DAYS · {addDays(asOf, -6).slice(5)}—{asOf.slice(5)}</span><h2>过去7天达成</h2><strong>{money(last7.total)}</strong><div className="period-breakdown">较前7天 <Change value={growth(last7.total, prev7.total)} /> · 日均 {money(last7.total / 7)}</div></article>
                <article className="period-card subsidy"><span>PLATFORM SUBSIDY</span><h2>近7天平台补贴</h2><div className="split-number"><div><small>TikTok</small><strong>{money(last7.ttSubsidy)}</strong></div><div><small>Shopee</small><strong>{money(last7.spSubsidy)}</strong></div></div></article>
              </section>
              <section className="content-card chart-card">
                <div className="section-heading"><div><span>DAILY SALES & SUBSIDY</span><h2>本月每日销售与补贴趋势</h2><p>柱：渠道销售额（左轴） · 线：平台补贴（右轴）</p></div><div className="chart-legend"><span><i style={{ background: COLORS.tt }} />TikTok销售</span><span><i style={{ background: COLORS.sp }} />Shopee销售</span><span><i style={{ background: COLORS.lzd }} />Lazada销售</span><span><i className="line-dot" style={{ background: COLORS.ttSub }} />TT补贴</span><span><i className="line-dot" style={{ background: COLORS.spSub }} />SP补贴</span></div></div>
                <div className="canvas-wrap"><TrendCanvas data={daily} /></div>
              </section>
            </>
          )}
        </>
      )}

      <footer><span>SEA SALES · BUSINESS INSIGHTS</span><p>销售金额均为人民币；货架销售 = Shopee + Lazada；平台补贴按 TikTok 与 Shopee 分开统计。</p><a href="https://docs.google.com/spreadsheets/d/1McioJExoVC7Oy3rX2kXLQBEUEsYzW1o-oY_4nEtp2Ts/edit?gid=0#gid=0" target="_blank" rel="noreferrer">查看数据源 ↗</a></footer>
    </main>
  );
}
