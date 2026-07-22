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
type TimeMode = "day" | "month";

const ALL_COUNTRIES = "全部国家";
const ALL_BRANDS = "全部品牌";
const NOTES_KEY = "sea-sales-dashboard-meeting-notes";
const EMPTY: Totals = { tt: 0, ttSubsidy: 0, sp: 0, spSubsidy: 0, lzd: 0, shelf: 0, total: 0 };
const COLORS = {
  tt: "#5D7389",
  sp: "#7FAFBE",
  lzd: "#A8D8E3",
  ttSub: "#A68E98",
  spSub: "#82758E",
};

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

function signedMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value), false)}`;
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

function previousYearDate(value: string) {
  const date = utcDate(value);
  const year = date.getUTCFullYear() - 1;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function aggregateByDay(rows: SaleRow[]) {
  const map = new Map<string, SaleRow[]>();
  rows.forEach((row) => map.set(row.date, [...(map.get(row.date) ?? []), row]));
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...sum(values) }));
}

function cutoffForMonth(rows: SaleRow[], month: string) {
  const positiveDates = rows.filter((r) => r.date.startsWith(`${month}-`) && r.total > 0).map((r) => r.date);
  if (!positiveDates.length) return daysInMonth(month);
  return Math.max(...positiveDates.map((date) => Number(date.slice(8, 10))));
}

function periodRows(rows: SaleRow[], mode: TimeMode, selection: string, cutoffDay?: number, rangeEnd?: string) {
  if (mode === "day") {
    const requestedEnd = rangeEnd || selection;
    const start = selection <= requestedEnd ? selection : requestedEnd;
    const end = selection <= requestedEnd ? requestedEnd : selection;
    const durationDays = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(durationDays - 1));
    const yoyStart = previousYearDate(start);
    const yoyEnd = previousYearDate(end);
    const withinRange = (row: SaleRow, from: string, to: string) => row.date >= from && row.date <= to;
    return {
      current: rows.filter((r) => withinRange(r, start, end)),
      previous: rows.filter((r) => withinRange(r, previousStart, previousEnd)),
      yoy: rows.filter((r) => withinRange(r, yoyStart, yoyEnd)),
      anchorDate: end,
      periodLabel: start === end ? start : `${start} 至 ${end}`,
      previousLabel: previousStart === previousEnd ? previousStart : `${previousStart} 至 ${previousEnd}`,
      yoyLabel: yoyStart === yoyEnd ? yoyStart : `${yoyStart} 至 ${yoyEnd}`,
      cutoffDay: Number(end.slice(8, 10)),
    };
  }

  const [year, monthNumber] = selection.split("-").map(Number);
  const cutoff = cutoffDay ?? cutoffForMonth(rows, selection);
  const previousMonthDate = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const yoyMonth = `${year - 1}-${String(monthNumber).padStart(2, "0")}`;
  const previousCutoff = Math.min(cutoff, daysInMonth(previousMonth));
  const yoyCutoff = Math.min(cutoff, daysInMonth(yoyMonth));
  const within = (row: SaleRow, month: string, day: number) => row.date.startsWith(`${month}-`) && Number(row.date.slice(8, 10)) <= day;
  const anchorDay = Math.min(cutoff, daysInMonth(selection));
  return {
    current: rows.filter((r) => within(r, selection, anchorDay)),
    previous: rows.filter((r) => within(r, previousMonth, previousCutoff)),
    yoy: rows.filter((r) => within(r, yoyMonth, yoyCutoff)),
    anchorDate: `${selection}-${String(anchorDay).padStart(2, "0")}`,
    periodLabel: `${selection}-01 至 ${String(anchorDay).padStart(2, "0")}日`,
    previousLabel: `${previousMonth}-01 至 ${String(previousCutoff).padStart(2, "0")}日`,
    yoyLabel: `${yoyMonth}-01 至 ${String(yoyCutoff).padStart(2, "0")}日`,
    cutoffDay: anchorDay,
  };
}

function Change({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const positive = Number.isFinite(value) && value >= 0;
  return (
    <span className={`change ${!Number.isFinite(value) ? "neutral" : positive ? "up" : "down"}`}>
      {Number.isFinite(value) ? `${positive ? "↑" : "↓"} ${Math.abs(value * 100).toFixed(1)}${suffix}` : "历史不足"}
    </span>
  );
}

function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const allSelected = selected.length === 0;
  const summary = allSelected
    ? allLabel
    : selected.length <= 2
      ? selected.join("、")
      : `${selected[0]} 等 ${selected.length} 项`;

  const toggle = (option: string) => {
    if (allSelected) {
      const next = options.filter((item) => item !== option);
      onChange(next.length === options.length ? [] : next);
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.length === 0 || next.length === options.length ? [] : next);
  };

  return (
    <div className="multi-select">
      <span>{label}</span>
      <details>
        <summary><span>{summary}</span><i /></summary>
        <div className="multi-menu">
          <label className="select-all">
            <input type="checkbox" checked={allSelected} onChange={() => onChange([])} />
            <span>{allLabel}</span>
          </label>
          <div className="multi-options">
            {options.map((option) => (
              <label key={option}>
                <input type="checkbox" checked={allSelected || selected.includes(option)} onChange={() => toggle(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <small>{allSelected ? `已选择全部 ${options.length} 项` : `已选择 ${selected.length} / ${options.length} 项`}</small>
        </div>
      </details>
    </div>
  );
}

function KpiCard({
  eyebrow,
  value,
  detail,
  mom,
  yoy,
  tone,
  pointChange = false,
}: {
  eyebrow: string;
  value: string;
  detail?: string;
  mom: number;
  yoy: number;
  tone: string;
  pointChange?: boolean;
}) {
  return (
    <article className="kpi-card" style={{ "--tone": tone } as React.CSSProperties}>
      <div className="kpi-top"><span className="tone-dot" />{eyebrow}</div>
      <strong>{value}</strong>
      {detail && <p className="kpi-detail">{detail}</p>}
      <div className="kpi-comparisons">
        <span>环比 <Change value={mom} suffix={pointChange ? "pp" : "%"} /></span>
        <span>同比 <Change value={yoy} suffix={pointChange ? "pp" : "%"} /></span>
      </div>
    </article>
  );
}

function ComparisonBars({ current, previous, yoy, labels }: { current: Totals; previous: Totals; yoy: Totals; labels: string[] }) {
  const channels = [
    { label: "TikTok", key: "tt" as const, color: COLORS.tt },
    { label: "Shopee", key: "sp" as const, color: COLORS.sp },
    { label: "Lazada", key: "lzd" as const, color: COLORS.lzd },
  ];
  const max = Math.max(1, ...channels.flatMap((r) => [current[r.key], previous[r.key], yoy[r.key]]));
  return (
    <div className="comparison-bars">
      {channels.map((row) => (
        <div className="channel-row" key={row.key}>
          <div className="channel-label"><span style={{ background: row.color }} />{row.label}</div>
          <div className="bar-cluster">
            <div className="bar-line"><i className="bar current" style={{ width: `${(current[row.key] / max) * 100}%`, background: row.color }} /><b>{money(current[row.key])}</b></div>
            <div className="bar-line"><i className="bar previous" style={{ width: `${(previous[row.key] / max) * 100}%`, background: row.color }} /><b>{money(previous[row.key])}</b></div>
            <div className="bar-line"><i className="bar yoy" style={{ width: `${(yoy[row.key] / max) * 100}%`, background: row.color }} /><b>{money(yoy[row.key])}</b></div>
          </div>
        </div>
      ))}
      <div className="bar-legend"><span><i className="legend-solid" />{labels[0]}</span><span><i className="legend-soft" />{labels[1]}</span><span><i className="legend-faint" />{labels[2]}</span></div>
    </div>
  );
}

function TrendCanvas({ data }: { data: Array<{ date: string } & Totals> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const draw = () => {
      const width = canvas.parentElement?.clientWidth ?? 1200;
      const height = 430;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      const pad = { left: 78, right: 82, top: 24, bottom: 62 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const maxSale = Math.max(1, ...data.map((d) => d.total)) * 1.12;
      const maxSubsidy = Math.max(1, ...data.map((d) => d.ttSubsidy + d.spSubsidy)) * 1.15;
      ctx.font = "14px Inter, system-ui";
      ctx.fillStyle = "#657786";
      ctx.strokeStyle = "#D7E3E7";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = pad.top + (chartHeight / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
        const value = maxSale * (1 - i / 4);
        ctx.fillText(value >= 10_000 ? `${(value / 10_000).toFixed(0)}万` : value.toFixed(0), 10, y + 5);
      }
      const slot = chartWidth / data.length;
      const barWidth = Math.max(6, Math.min(28, slot * 0.62));
      data.forEach((d, i) => {
        const x = pad.left + i * slot + (slot - barWidth) / 2;
        let bottom = pad.top + chartHeight;
        ([{ v: d.tt, c: COLORS.tt }, { v: d.sp, c: COLORS.sp }, { v: d.lzd, c: COLORS.lzd }]).forEach((part) => {
          const h = (part.v / maxSale) * chartHeight;
          ctx.fillStyle = part.c; ctx.fillRect(x, bottom - h, barWidth, h); bottom -= h;
        });
        if (i % Math.max(1, Math.ceil(data.length / 10)) === 0 || i === data.length - 1) {
          ctx.save(); ctx.translate(x + barWidth / 2, height - 35); ctx.rotate(-0.45); ctx.fillStyle = "#657786"; ctx.fillText(d.date.slice(5), 0, 0); ctx.restore();
        }
      });
      const line = (key: "ttSubsidy" | "spSubsidy", color: string) => {
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = pad.left + slot * (i + 0.5);
          const y = pad.top + chartHeight - (d[key] / maxSubsidy) * chartHeight;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
        data.forEach((d, i) => {
          const x = pad.left + slot * (i + 0.5);
          const y = pad.top + chartHeight - (d[key] / maxSubsidy) * chartHeight;
          ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        });
      };
      line("ttSubsidy", COLORS.ttSub);
      line("spSubsidy", COLORS.spSub);
      ctx.fillStyle = "#657786";
      ctx.textAlign = "right";
      ctx.fillText(money(maxSubsidy), width - 8, pad.top + 5);
      ctx.fillText("补贴", width - 8, pad.top + 24);
      ctx.textAlign = "left";
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [data]);
  return <canvas ref={ref} aria-label="所选月份每日各渠道销售柱状图，以及 TikTok 和 Shopee 平台补贴趋势折线图" />;
}

export function SalesDashboard() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [view, setView] = useState<View>("overview");
  const [timeMode, setTimeMode] = useState<TimeMode>("month");
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [notesStatus, setNotesStatus] = useState("本机自动保存");

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

  useEffect(() => {
    const timer = window.setTimeout(() => setMeetingNotes(localStorage.getItem(NOTES_KEY) ?? ""), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const updateMeetingNotes = (value: string) => {
    setMeetingNotes(value);
    localStorage.setItem(NOTES_KEY, value);
    setNotesStatus(`已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
  };

  const latestDate = useMemo(() => rows.filter((r) => r.total > 0).reduce((max, r) => (r.date > max ? r.date : max), ""), [rows]);
  const earliestDate = useMemo(() => rows.filter((r) => r.total > 0).reduce((min, r) => (!min || r.date < min ? r.date : min), ""), [rows]);

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const brands = useMemo(() => [...new Set(rows.filter((r) => !selectedCountries.length || selectedCountries.includes(r.country)).map((r) => r.brand))].sort(), [rows, selectedCountries]);
  const filtered = useMemo(() => rows.filter((r) => (!selectedCountries.length || selectedCountries.includes(r.country)) && (!selectedBrands.length || selectedBrands.includes(r.brand))), [rows, selectedCountries, selectedBrands]);
  const updateSelectedCountries = (items: string[]) => {
    setSelectedCountries(items);
    const availableBrands = [...new Set(rows.filter((r) => !items.length || items.includes(r.country)).map((r) => r.brand))];
    setSelectedBrands((current) => {
      if (!current.length) return current;
      const available = current.filter((item) => availableBrands.includes(item));
      return available.length === availableBrands.length ? [] : available;
    });
  };
  const effectiveStartDate = selectedStartDate || latestDate;
  const effectiveEndDate = selectedEndDate || latestDate;
  const effectiveMonth = selectedMonth || latestDate.slice(0, 7);
  const selection = timeMode === "day" ? effectiveStartDate : effectiveMonth;
  const rangeEnd = timeMode === "day" ? effectiveEndDate : undefined;
  const sharedCutoff = useMemo(() => timeMode === "month" && effectiveMonth ? cutoffForMonth(rows, effectiveMonth) : undefined, [rows, effectiveMonth, timeMode]);
  const periods = useMemo(() => selection ? periodRows(filtered, timeMode, selection, sharedCutoff, rangeEnd) : null, [filtered, timeMode, selection, sharedCutoff, rangeEnd]);
  const current = useMemo(() => periods ? sum(periods.current) : { ...EMPTY }, [periods]);
  const previous = useMemo(() => periods ? sum(periods.previous) : { ...EMPTY }, [periods]);
  const yoy = useMemo(() => periods ? sum(periods.yoy) : { ...EMPTY }, [periods]);
  const anchorDate = periods?.anchorDate ?? latestDate;
  const shelfShare = current.total ? current.shelf / current.total : 0;
  const previousShelfShare = previous.total ? previous.shelf / previous.total : Number.NaN;
  const yoyShelfShare = yoy.total ? yoy.shelf / yoy.total : Number.NaN;

  const yesterday = useMemo(() => sum(filtered.filter((r) => r.date === anchorDate)), [filtered, anchorDate]);
  const priorDay = useMemo(() => sum(filtered.filter((r) => r.date === addDays(anchorDate, -1))), [filtered, anchorDate]);
  const last7 = useMemo(() => anchorDate ? sum(filtered.filter((r) => r.date >= addDays(anchorDate, -6) && r.date <= anchorDate)) : { ...EMPTY }, [filtered, anchorDate]);
  const prev7 = useMemo(() => anchorDate ? sum(filtered.filter((r) => r.date >= addDays(anchorDate, -13) && r.date <= addDays(anchorDate, -7))) : { ...EMPTY }, [filtered, anchorDate]);
  const trendMonth = anchorDate.slice(0, 7);
  const daily = useMemo(() => aggregateByDay(filtered.filter((r) => r.date.startsWith(`${trendMonth}-`) && r.date <= anchorDate)), [filtered, trendMonth, anchorDate]);

  const matrix = useMemo(() => {
    if (!selection) return [];
    const scopedRows = rows.filter((r) => (!selectedCountries.length || selectedCountries.includes(r.country)) && (!selectedBrands.length || selectedBrands.includes(r.brand)));
    const keys = [...new Set(scopedRows.map((r) => `${r.country}|${r.brand}`))];
    return keys.map((key) => {
      const [itemCountry, itemBrand] = key.split("|");
      const group = rows.filter((r) => r.country === itemCountry && r.brand === itemBrand);
      const itemPeriods = periodRows(group, timeMode, selection, sharedCutoff, rangeEnd);
      const now = sum(itemPeriods.current);
      const prev = sum(itemPeriods.previous);
      const lastYear = sum(itemPeriods.yoy);
      return {
        country: itemCountry,
        brand: itemBrand,
        ...now,
        mom: growth(now.total, prev.total),
        yoy: growth(now.total, lastYear.total),
        delta: now.total - prev.total,
        ttDelta: now.tt - prev.tt,
        spDelta: now.sp - prev.sp,
        lzdDelta: now.lzd - prev.lzd,
        ttSubsidyDelta: now.ttSubsidy - prev.ttSubsidy,
        spSubsidyDelta: now.spSubsidy - prev.spSubsidy,
      };
    }).sort((a, b) => b.total - a.total);
  }, [rows, timeMode, selection, sharedCutoff, rangeEnd, selectedCountries, selectedBrands]);

  const reviewData = useMemo(() => {
    const topGrowth = matrix.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const topDecline = matrix.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    const movers = [...topGrowth, ...topDecline];

    const dimensionTrends = (key: "brand" | "country") => {
      const groups = new Map<string, (typeof matrix)[number][]>();
      matrix.forEach((item) => groups.set(item[key], [...(groups.get(item[key]) ?? []), item]));
      return [...groups.entries()].map(([name, items]) => {
        const ranked = [...items].sort((a, b) => b.delta - a.delta);
        return {
          name,
          total: items.reduce((value, item) => value + item.total, 0),
          delta: items.reduce((value, item) => value + item.delta, 0),
          best: ranked[0],
          weakest: ranked.at(-1)!,
        };
      }).sort((a, b) => b.delta - a.delta);
    };

    return {
      topGrowth,
      topDecline,
      movers,
      brandTrends: dimensionTrends("brand"),
      countryTrends: dimensionTrends("country"),
    };
  }, [matrix]);

  const analysis = useMemo(() => {
    if (!periods || !matrix.length) return [];
    const totalMom = growth(current.total, previous.total);
    const totalYoy = growth(current.total, yoy.total);
    const top = matrix[0];
    const channelDeltas = [
      { name: "TikTok", value: current.tt - previous.tt },
      { name: "Shopee", value: current.sp - previous.sp },
      { name: "Lazada", value: current.lzd - previous.lzd },
    ].sort((a, b) => b.value - a.value);
    const strongest = matrix.filter((item) => Number.isFinite(item.mom)).sort((a, b) => b.mom - a.mom)[0];
    const subsidyRate = current.total ? (current.ttSubsidy + current.spSubsidy) / current.total : 0;
    const previousSubsidyRate = previous.total ? (previous.ttSubsidy + previous.spSubsidy) / previous.total : Number.NaN;
    return [
      {
        tag: "整体走势",
        title: `${timeMode === "day" ? "所选区间" : "所选月"}销售${Number.isFinite(totalMom) && totalMom >= 0 ? "增长" : "承压"}`,
        text: `全渠道 ${money(current.total)}，环比 ${deltaLabel(totalMom)}，同比 ${deltaLabel(totalYoy)}。`,
        tone: "blue",
      },
      {
        tag: "核心贡献",
        title: `${top.brand} · ${top.country}`,
        text: `销售 ${money(top.total)}，占当前筛选范围 ${percent(current.total ? top.total / current.total : 0)}。`,
        tone: "navy",
      },
      {
        tag: "渠道变化",
        title: `${channelDeltas[0].name} 是最大增量渠道`,
        text: `较对比期变化 ${money(channelDeltas[0].value, false)}；${channelDeltas.at(-1)?.name} 变化 ${money(channelDeltas.at(-1)?.value ?? 0, false)}。`,
        tone: "cyan",
      },
      {
        tag: "值得关注",
        title: strongest ? `${strongest.brand} · ${strongest.country} 环比领先` : "关注结构变化",
        text: strongest ? `环比 ${deltaLabel(strongest.mom)}，当前销售 ${money(strongest.total)}。` : `货架占比 ${percent(shelfShare)}。`,
        tone: "mauve",
      },
      {
        tag: "补贴效率",
        title: `综合补贴率 ${percent(subsidyRate)}`,
        text: Number.isFinite(previousSubsidyRate) ? `较对比期${subsidyRate >= previousSubsidyRate ? "上升" : "下降"} ${Math.abs((subsidyRate - previousSubsidyRate) * 100).toFixed(1)}pp。` : "对比期数据不足。",
        tone: "soft",
      },
    ];
  }, [periods, matrix, current, previous, yoy, timeMode, shelfShare]);

  const tabs: Array<{ id: View; label: string; hint: string }> = [
    { id: "overview", label: "全渠道总览", hint: "国家 × 品牌" },
    { id: "month", label: "周期累计分析", hint: "同期对比" },
    { id: "recent", label: "短周期监控", hint: "区间末日与近7天" },
  ];

  const comparisonLabels = timeMode === "day" ? ["所选区间", "上一等长周期", "去年同期"] : ["所选月", "上月同期", "去年同期"];
  const countryScope = selectedCountries.length ? (selectedCountries.length === 1 ? selectedCountries[0] : `${selectedCountries.length} 个国家`) : "全国家";
  const brandScope = selectedBrands.length ? (selectedBrands.length === 1 ? selectedBrands[0] : `${selectedBrands.length} 个品牌`) : "全品牌";
  const scopeLabel = `${countryScope} · ${brandScope}`;

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
          <div><small>数据最新日期</small><strong>{latestDate || "读取中…"}</strong><span>{refreshedAt ? `本次刷新 ${new Date(refreshedAt).toLocaleString("zh-CN", { hour12: false })}` : "正在连接数据源"}</span></div>
        </div>
      </header>

      <section className="filter-panel">
        <div className="filter-copy"><span>VIEW CONTROL</span><h2>筛选与时间</h2><p>所有指标、图表和自动摘要同步更新</p></div>
        <MultiSelect label="国家" allLabel={ALL_COUNTRIES} options={countries} selected={selectedCountries} onChange={updateSelectedCountries} />
        <MultiSelect label="品牌" allLabel={ALL_BRANDS} options={brands} selected={selectedBrands} onChange={setSelectedBrands} />
        <div className="time-control">
          <span>时间粒度</span>
          <div className="time-toggle" aria-label="时间粒度">
            <button className={timeMode === "day" ? "active" : ""} aria-pressed={timeMode === "day"} onClick={() => { setTimeMode("day"); if (!selectedStartDate && latestDate) setSelectedStartDate(latestDate); if (!selectedEndDate && latestDate) setSelectedEndDate(latestDate); }}>按日</button>
            <button className={timeMode === "month" ? "active" : ""} aria-pressed={timeMode === "month"} onClick={() => { setTimeMode("month"); if (!selectedMonth && latestDate) setSelectedMonth(latestDate.slice(0, 7)); }}>按月</button>
          </div>
          {timeMode === "day" ? (
            <div className="date-range">
              <label>开始日期<input aria-label="开始日期" type="date" value={effectiveStartDate} min={earliestDate} max={effectiveEndDate || latestDate} onChange={(event) => { const value = event.target.value; setSelectedStartDate(value); if (value > effectiveEndDate) setSelectedEndDate(value); }} /></label>
              <b>至</b>
              <label>结束日期<input aria-label="结束日期" type="date" value={effectiveEndDate} min={effectiveStartDate || earliestDate} max={latestDate} onChange={(event) => { const value = event.target.value; setSelectedEndDate(value); if (value < effectiveStartDate) setSelectedStartDate(value); }} /></label>
            </div>
          ) : (
            <input aria-label="选择月份" type="month" value={effectiveMonth} min={earliestDate.slice(0, 7)} max={latestDate.slice(0, 7)} onChange={(event) => setSelectedMonth(event.target.value)} />
          )}
        </div>
        <div className="scope-chip"><span>当前范围</span><strong>{scopeLabel}</strong><small>{periods?.periodLabel ?? "等待数据"}</small></div>
      </section>

      {loading && <section className="state-panel"><div className="loader" /><h2>正在整理 10,000+ 条销售记录</h2><p>统一人民币口径并识别最新真实数据日</p></section>}
      {error && <section className="state-panel error-state"><h2>暂时无法读取在线表格</h2><p>{error}</p><button onClick={() => location.reload()}>重新读取</button></section>}

      {!loading && !error && periods && (
        <>
          <section className="kpi-grid">
            <KpiCard eyebrow={timeMode === "day" ? "所选区间全渠道销售" : "所选月全渠道销售"} value={money(current.total)} tone="#5D7389" mom={growth(current.total, previous.total)} yoy={growth(current.total, yoy.total)} />
            <KpiCard eyebrow="TikTok 销售" value={money(current.tt)} tone={COLORS.tt} detail={`占全渠道 ${percent(current.total ? current.tt / current.total : 0)}`} mom={growth(current.tt, previous.tt)} yoy={growth(current.tt, yoy.tt)} />
            <KpiCard eyebrow="货架销售" value={money(current.shelf)} tone={COLORS.sp} detail={`Shopee ${money(current.sp)} · Lazada ${money(current.lzd)}`} mom={growth(current.shelf, previous.shelf)} yoy={growth(current.shelf, yoy.shelf)} />
            <KpiCard eyebrow="TT 平台补贴" value={money(current.ttSubsidy)} tone={COLORS.ttSub} detail={`补贴率 ${percent(current.tt ? current.ttSubsidy / current.tt : 0)}`} mom={growth(current.ttSubsidy, previous.ttSubsidy)} yoy={growth(current.ttSubsidy, yoy.ttSubsidy)} />
            <KpiCard eyebrow="SP 平台补贴" value={money(current.spSubsidy)} tone={COLORS.spSub} detail={`补贴率 ${percent(current.sp ? current.spSubsidy / current.sp : 0)}`} mom={growth(current.spSubsidy, previous.spSubsidy)} yoy={growth(current.spSubsidy, yoy.spSubsidy)} />
            <KpiCard eyebrow="货架占比" value={percent(shelfShare)} tone="#91A9B7" detail="Shopee + Lazada" mom={shelfShare - previousShelfShare} yoy={shelfShare - yoyShelfShare} pointChange />
          </section>

          <section className="auto-insights">
            <div className="section-heading"><div><span>AUTO REVIEW</span><h2>数据刷新摘要</h2><p>根据当前国家、品牌和时间范围自动生成</p></div><div className="analysis-badge"><i />已同步</div></div>
            <div className="insight-strip">
              {analysis.map((item) => <article className={`auto-insight ${item.tone}`} key={item.tag}><span>{item.tag}</span><strong>{item.title}</strong><p>{item.text}</p></article>)}
            </div>

            <div className="review-section-heading">
              <div><span>COUNTRY × BRAND MOVERS</span><h3>国家品牌增长与下滑 TOP5</h3></div>
              <small>按较上一对比周期的销售金额变化排序</small>
            </div>
            <div className="review-rankings">
              <article className="review-panel growth-panel">
                <header><div><i />增长最多</div><strong>TOP 5</strong></header>
                <ol>
                  {reviewData.topGrowth.map((item, index) => (
                    <li key={`${item.country}-${item.brand}`}><b>{index + 1}</b><div><strong>{item.brand}</strong><span>{item.country} · 环比 {deltaLabel(item.mom)}</span></div><em>{signedMoney(item.delta)}</em></li>
                  ))}
                  {!reviewData.topGrowth.length && <li className="empty-review">当前筛选范围暂无增长组合</li>}
                </ol>
              </article>
              <article className="review-panel decline-panel">
                <header><div><i />下滑最多</div><strong>TOP 5</strong></header>
                <ol>
                  {reviewData.topDecline.map((item, index) => (
                    <li key={`${item.country}-${item.brand}`}><b>{index + 1}</b><div><strong>{item.brand}</strong><span>{item.country} · 环比 {deltaLabel(item.mom)}</span></div><em>{signedMoney(item.delta)}</em></li>
                  ))}
                  {!reviewData.topDecline.length && <li className="empty-review">当前筛选范围暂无下滑组合</li>}
                </ol>
              </article>
            </div>

            <article className="review-panel movement-panel">
              <header><div><i />重点组合拆解</div><strong>渠道趋势与补贴变化</strong></header>
              <div className="review-table">
                <table>
                  <thead><tr><th>国家 / 品牌</th><th>销售变化</th><th>环比</th><th>TikTok</th><th>Shopee</th><th>Lazada</th><th>TT 补贴</th><th>SP 补贴</th></tr></thead>
                  <tbody>
                    {reviewData.movers.map((item) => (
                      <tr key={`${item.country}-${item.brand}`}>
                        <td><b>{item.brand}</b><span>{item.country}</span></td>
                        <td><strong className={item.delta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.delta)}</strong></td>
                        <td>{deltaLabel(item.mom)}</td>
                        <td className={item.ttDelta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.ttDelta)}</td>
                        <td className={item.spDelta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.spDelta)}</td>
                        <td className={item.lzdDelta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.lzdDelta)}</td>
                        <td className={item.ttSubsidyDelta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.ttSubsidyDelta)}</td>
                        <td className={item.spSubsidyDelta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.spSubsidyDelta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dimension-review-grid">
              <article className="review-panel dimension-panel">
                <header><div><i />品牌维度</div><strong>各品牌在不同国家的趋势</strong></header>
                <div className="dimension-list">
                  {reviewData.brandTrends.map((item) => <div className="dimension-row" key={item.name}><div><strong>{item.name}</strong><span>当前销售 {money(item.total)}</span></div><em className={item.delta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.delta)}</em><p><span>增长最好</span><b>{item.best.country} {signedMoney(item.best.delta)}</b><span>相对承压</span><b>{item.weakest.country} {signedMoney(item.weakest.delta)}</b></p></div>)}
                </div>
              </article>
              <article className="review-panel dimension-panel">
                <header><div><i />国家维度</div><strong>各国家站点内品牌趋势</strong></header>
                <div className="dimension-list">
                  {reviewData.countryTrends.map((item) => <div className="dimension-row" key={item.name}><div><strong>{item.name}</strong><span>当前销售 {money(item.total)}</span></div><em className={item.delta >= 0 ? "review-up" : "review-down"}>{signedMoney(item.delta)}</em><p><span>增长最好</span><b>{item.best.brand} {signedMoney(item.best.delta)}</b><span>相对承压</span><b>{item.weakest.brand} {signedMoney(item.weakest.delta)}</b></p></div>)}
                </div>
              </article>
            </div>
          </section>

          <nav className="tabs analysis-tabs" aria-label="看板视图">
            {tabs.map((tab) => <button key={tab.id} className={view === tab.id ? "active" : ""} onClick={() => setView(tab.id)}><b>{tab.label}</b><span>{tab.hint}</span></button>)}
          </nav>

          {view === "overview" && (
            <section className="content-card">
              <div className="section-heading"><div><span>01 / OVERVIEW</span><h2>国家 × 品牌全渠道销售</h2><p>{comparisonLabels.join("、")}，按全渠道金额排序</p></div><div className="mini-summary"><small>覆盖组合</small><strong>{matrix.length}</strong></div></div>
              <div className="table-wrap"><table><thead><tr><th>国家 / 品牌</th><th>全渠道</th><th>环比</th><th>同比</th><th>TikTok</th><th>Shopee</th><th>Lazada</th><th>货架占比</th><th>TT补贴</th><th>SP补贴</th></tr></thead><tbody>{matrix.map((row) => <tr key={`${row.country}-${row.brand}`}><td><b>{row.brand}</b><span>{row.country}</span></td><td><strong>{money(row.total)}</strong></td><td><span className={Number.isFinite(row.mom) && row.mom >= 0 ? "table-up" : "table-down"}>{deltaLabel(row.mom)}</span></td><td><span className={Number.isFinite(row.yoy) && row.yoy >= 0 ? "table-up" : "table-down"}>{deltaLabel(row.yoy)}</span></td><td>{money(row.tt)}</td><td>{money(row.sp)}</td><td>{money(row.lzd)}</td><td>{percent(row.total ? row.shelf / row.total : 0)}</td><td>{money(row.ttSubsidy)}</td><td>{money(row.spSubsidy)}</td></tr>)}</tbody></table></div>
            </section>
          )}

          {view === "month" && (
            <div className="two-column">
              <section className="content-card">
                <div className="section-heading"><div><span>02 / PERIOD COMPARISON</span><h2>分渠道销售对比</h2><p>{periods.periodLabel} · 对比 {periods.previousLabel} 与 {periods.yoyLabel}</p></div></div>
                <ComparisonBars current={current} previous={previous} yoy={yoy} labels={comparisonLabels} />
              </section>
              <section className="content-card insight-card">
                <div className="section-heading"><div><span>PERFORMANCE NOTES</span><h2>累计达成概览</h2><p>随时间选择动态变化</p></div></div>
                <div className="insight-list">
                  <div><span>全渠道环比</span><strong>{deltaLabel(growth(current.total, previous.total))}</strong><Change value={growth(current.total, previous.total)} /></div>
                  <div><span>全渠道同比</span><strong>{deltaLabel(growth(current.total, yoy.total))}</strong><Change value={growth(current.total, yoy.total)} /></div>
                  <div><span>TT 平台补贴环比</span><strong>{deltaLabel(growth(current.ttSubsidy, previous.ttSubsidy))}</strong><Change value={growth(current.ttSubsidy, previous.ttSubsidy)} /></div>
                  <div><span>SP 平台补贴环比</span><strong>{deltaLabel(growth(current.spSubsidy, previous.spSubsidy))}</strong><Change value={growth(current.spSubsidy, previous.spSubsidy)} /></div>
                  <div><span>货架占比变化</span><strong>{Number.isFinite(previousShelfShare) ? `${((shelfShare - previousShelfShare) * 100).toFixed(1)}pp` : "历史不足"}</strong><span className="muted">当前 {percent(shelfShare)}</span></div>
                </div>
              </section>
            </div>
          )}

          {view === "recent" && (
            <>
              <section className="period-grid">
                <article className="period-card"><span>SELECTED DAY · {anchorDate.slice(5)}</span><h2>所选日达成</h2><strong>{money(yesterday.total)}</strong><div className="period-breakdown"><i style={{ background: COLORS.tt }} />TT {money(yesterday.tt)}<i style={{ background: COLORS.sp }} />SP {money(yesterday.sp)}<i style={{ background: COLORS.lzd }} />LZD {money(yesterday.lzd)}<Change value={growth(yesterday.total, priorDay.total)} /></div></article>
                <article className="period-card dark"><span>LAST 7 DAYS · {addDays(anchorDate, -6).slice(5)}—{anchorDate.slice(5)}</span><h2>过去7天达成</h2><strong>{money(last7.total)}</strong><div className="period-breakdown">较前7天 <Change value={growth(last7.total, prev7.total)} /> · 日均 {money(last7.total / 7)}</div></article>
                <article className="period-card subsidy"><span>PLATFORM SUBSIDY</span><h2>近7天平台补贴</h2><div className="split-number"><div><small>TikTok</small><strong>{money(last7.ttSubsidy)}</strong></div><div><small>Shopee</small><strong>{money(last7.spSubsidy)}</strong></div></div></article>
              </section>
              <section className="content-card chart-card">
                <div className="section-heading"><div><span>DAILY SALES & SUBSIDY</span><h2>{trendMonth} 每日销售与补贴趋势</h2><p>柱：渠道销售额（左轴） · 线：平台补贴（右轴）</p></div><div className="chart-legend"><span><i style={{ background: COLORS.tt }} />TikTok销售</span><span><i style={{ background: COLORS.sp }} />Shopee销售</span><span><i style={{ background: COLORS.lzd }} />Lazada销售</span><span><i className="line-dot" style={{ background: COLORS.ttSub }} />TT补贴</span><span><i className="line-dot" style={{ background: COLORS.spSub }} />SP补贴</span></div></div>
                <div className="canvas-wrap"><TrendCanvas data={daily} /></div>
              </section>
            </>
          )}

          <section className="meeting-notes">
            <div className="notes-heading"><div><span>MEETING NOTES</span><h2>会议小结与分析结论</h2><p>适合记录业务判断、待办事项和负责人；内容仅保存在当前浏览器。</p></div><div className="notes-status"><i />{notesStatus}</div></div>
            <textarea aria-label="会议小结" value={meetingNotes} onChange={(event) => updateMeetingNotes(event.target.value)} placeholder="示例：&#10;1. 印尼 Glad2Glow 本期贡献最高，继续观察 TikTok 增量。&#10;2. SP 补贴率变化需要与销售增量一起复盘。&#10;3. 下周行动：负责人 / 截止时间 / 目标。" />
            <div className="notes-actions"><button onClick={async () => { await navigator.clipboard.writeText(meetingNotes); setNotesStatus("已复制到剪贴板"); }}>复制小结</button><button className="ghost" onClick={() => updateMeetingNotes(analysis.map((item) => `【${item.tag}】${item.title}：${item.text}`).join("\n"))}>填入自动摘要</button></div>
          </section>
        </>
      )}

      <footer><span>SEA SALES · BUSINESS INSIGHTS</span><p>销售金额均为人民币；货架销售 = Shopee + Lazada；平台补贴按 TikTok 与 Shopee 分开统计。</p><a href="https://docs.google.com/spreadsheets/d/1McioJExoVC7Oy3rX2kXLQBEUEsYzW1o-oY_4nEtp2Ts/edit?gid=0#gid=0" target="_blank" rel="noreferrer">查看数据源 →</a></footer>
    </main>
  );
}
