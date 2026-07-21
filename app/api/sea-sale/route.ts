export const runtime = "edge";
export const dynamic = "force-dynamic";

const SOURCE =
  "https://docs.google.com/spreadsheets/d/1McioJExoVC7Oy3rX2kXLQBEUEsYzW1o-oY_4nEtp2Ts/gviz/tq?tqx=out:csv&sheet=SEA-sale";

function parseCSV(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function numeric(value = "") {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const response = await fetch(SOURCE, { headers: { accept: "text/csv" } });
    if (!response.ok) throw new Error(`数据源返回 ${response.status}`);
    const matrix = parseCSV(await response.text());
    const headers = matrix.shift() ?? [];
    const index = Object.fromEntries(headers.map((name, i) => [name, i]));
    const rows = matrix
      .filter((r) => r[index["日期"]] && r[index["国家"]] && r[index["品牌"]])
      .map((r) => ({
        date: r[index["日期"]].replace(
          /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
          (_, y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        ),
        country: r[index["国家"]],
        brand: r[index["品牌"]],
        tt: numeric(r[index["TT-GMV"]]),
        ttSubsidy: numeric(r[index["TT平台补贴"]]),
        sp: numeric(r[index["SP-GMV"]]),
        spSubsidy: numeric(r[index["SP平台补贴"]]),
        spPriceSubsidy: numeric(r[index["SP平台价补"]]),
        spCouponSubsidy: numeric(r[index["SP平台券补"]]),
        merchantCoupon: numeric(r[index["SP商家设券"]]),
        lzd: numeric(r[index["LZD-GMV"]]),
        shelf: numeric(r[index["货架-GMV"]]),
        total: numeric(r[index["全渠道"]]),
      }));

    return Response.json(
      { rows, source: SOURCE, currency: "CNY", refreshedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "无法读取数据源" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
