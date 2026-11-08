// Finance web UI (public demo) — a simple, clear finance dashboard on top of the shared engine (FE)
// and the Store (browser storage in this demo). Pages: Overview, Accounts, Records, Analysis, Settings.
(function () {
  "use strict";
  const FE = globalThis.FE, Store = globalThis.Store;

  // ───────────────────────── helpers ─────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k, d = null) { try { const v = localStorage.getItem("finans-demo." + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("finans-demo." + k, v); } catch { /* private mode */ } },
  };
  const tone = (v) => (v == null || Math.round(v) === 0 ? "muted" : v < 0 ? "neg" : "pos");
  const money = (v, { signed = false, colored = false, hide = S.hide } = {}) =>
    `<span class="num ${colored && !hide ? tone(v) : ""}">${hide ? "••••••" : FE.money(v, signed)}</span>`;
  const pctTxt = (v, base, signed = true) => (base ? FE.pct(v / base, signed) : "—");
  const todayS = () => FE.today();
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function parseAmount(s) {
    if (s == null) return null;
    let t = String(s).replace(/[\s$]/g, "");
    if (!t) return null;
    if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
    else if (/,\d{1,2}$/.test(t)) t = t.replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const fmtInput = (v) => (v == null ? "" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v));
  let toastTimer;
  function toast(msg, ms = 2200) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ───────────────────────── state ─────────────────────────
  const TABS = ["overview", "accounts", "records", "analysis", "settings"];
  const S = {
    records: [], banks: [], rows: [],
    tab: TABS.includes(ls.get("tab")) ? ls.get("tab") : "overview",
    range: ls.get("range", "1Y"), hide: ls.get("hide") === "1",
    account: ls.get("account", "total"), search: "",
    quotes: {}, quotesAt: null, quotesErr: null, quotesLoading: false,
  };
  /**
   * Adds r.change (total minus the previous row's total) and r.avg30: the average increase per
   * 30 days since the first record that has any money in it (the empty starting row is skipped).
   */
  function withChanges(rows) {
    const start = rows.find((r) => r.total > 0);
    rows.forEach((r, i) => {
      r.change = i ? r.total - rows[i - 1].total : null;
      const days = start ? FE.daysBetween(start.date, r.date) : 0;
      r.avg30 = days > 0 ? ((r.total - start.total) / days) * 30 : null;
    });
    return rows;
  }
  const recompute = () => { S.rows = withChanges(FE.compute(S.records)); };
  /** Increase between two actual rows. */
  function period(label, from, to) {
    if (!from || !to || from === to) return { label, empty: true };
    return { label, from, to, change: to.total - from.total, base: from.total };
  }
  /** Standard comparison periods ending at the latest actual record. */
  function periods(l) {
    const act = actualRows(), prev = FE.previousOf(S.rows, l);
    const yStart = [...act].reverse().find((r) => FE.year(r.date) < FE.year(l.date)) || act[0];
    return [period("Last period", prev, l), period(`This year (${FE.year(l.date)})`, yStart, l), period("Last 12 months", FE.yearAgo(S.rows, l), l), { ...period("Since first entry", act.find((r) => r.total > 0) || act[0], l), base: null }];
  }
  /** Total and monthly average increase over the 12 months up to `end`. */
  function last12(rows, end) {
    const win = rows.filter((r) => !r.isPlan && r.change != null && r.date > FE.addMonths(end, -12) && r.date <= end);
    if (!win.length) return null;
    const total = win.reduce((a, r) => a + r.change, 0);
    return { total, monthly: total / 12 };
  }
  const kinds = () => FE.kindsOf(S.banks);
  const bankName = (k) => (S.banks.find((b) => b.key === k) || { name: FE.defaultName(k) }).name;
  const PALETTE = ["#6a5acd", "#13b5c4", "#e0383e", "#f08c1e", "#2f7cf6", "#9b59d0", "#e84393", "#20c997", "#a0522d", "#17a2b8", "#f4c20d", "#8e8e93"];
  const bankColor = (k) => PALETTE[Math.max(S.banks.findIndex((b) => b.key === k), 0) % PALETTE.length];
  const GROUP = { fidelity: "#18a058", banks: "#2f7cf6", borc: "#f08c1e", cash: "#8e8e93" };
  // Bank kinds (saving/checking) still exist in the data for the iOS app; the web shows banks as one group.
  const bankTotal = (rec) => (rec.saving || 0) + (rec.checking || 0);
  const actualRows = () => S.rows.filter((r) => !r.isPlan);
  const latest = () => FE.latestActual(S.rows);

  async function commit(records, banks, message, opts = {}) {
    toast("Saving…", 20000);
    try {
      await Store.save(records, banks, message, opts);
      S.records = records; S.banks = banks; recompute();
      toast("Saved");
      return true;
    } catch (e) {
      toast("Could not save: " + e.message, 5000);
      return false;
    }
  }

  // ───────────────────────── accounts model ─────────────────────────
  /** Every account and group the user can drill into, in display order. */
  function accounts() {
    const rec = S.records;
    const used = (key) => rec.some((r) => (r.banks[key] || 0) !== 0);
    const banks = S.banks.filter((b) => !b.hidden || used(b.key));
    const bankAcc = (b) => ({ id: "bank:" + b.key, name: b.name + (b.hidden ? " (removed)" : ""), color: bankColor(b.key), sub: true,
      get: (r) => (r.record.banks[b.key] ?? null) });
    return [
      { id: "total", name: "Total net worth", color: css("--accent") || "#23b46e", get: (r) => r.total, head: true },
      { id: "fidelity", name: "Brokerage", color: GROUP.fidelity, get: (r) => r.record.fidelity, head: true },
      { id: "banks", name: "Banks", color: GROUP.banks, get: (r) => bankTotal(r.record), head: true },
      ...banks.map(bankAcc),
      { id: "borc", name: "Receivables", color: GROUP.borc, get: (r) => r.record.borc ?? 0, head: true },
      { id: "cash", name: "Cash", color: GROUP.cash, get: (r) => r.record.cash ?? 0, head: true },
    ];
  }

  // ───────────────────────── charts ─────────────────────────
  let charts = [];
  const destroyCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
  const dn = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayLabel = (n) => { const d = new Date(n * 864e5); return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; };
  const fullDay = (n) => { const d = new Date(n * 864e5); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
  const shortMoney = (v) => (S.hide ? "•••" : Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 1000)}K` : `$${Math.round(v)}`);
  const cutoff = () => ({ "6M": FE.addMonths(todayS(), -6), "1Y": FE.addMonths(todayS(), -12), "3Y": FE.addMonths(todayS(), -36) }[S.range] || null);
  const inRange = (r) => { const c = cutoff(); return !c || r.date >= c; };

  function baseOptions(extra = {}) {
    const grid = css("--line"), ink = css("--muted");
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 10 } },
      scales: {
        x: { type: "linear", grid: { color: grid }, ticks: { color: ink, maxTicksLimit: 6, callback: (v) => dayLabel(v) } },
        y: { grid: { color: grid }, ticks: { color: ink, maxTicksLimit: 5, callback: (v) => shortMoney(v) } },
      },
      ...extra,
    };
  }
  function fitX(options, xs) {
    if (xs.length) options.scales.x = { ...options.scales.x, min: Math.min(...xs), max: Math.max(...xs) };
    return options;
  }
  const todayLine = {
    id: "todayLine",
    afterDatasetsDraw(chart) {
      const x = chart.scales.x.getPixelForValue(dn(todayS()));
      if (x < chart.chartArea.left || x > chart.chartArea.right) return;
      const c = chart.ctx; c.save(); c.strokeStyle = css("--orange"); c.setLineDash([3, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, chart.chartArea.top); c.lineTo(x, chart.chartArea.bottom); c.stroke();
      c.fillStyle = css("--orange"); c.font = "11px -apple-system, sans-serif"; c.fillText("today", x + 4, chart.chartArea.top + 10); c.restore();
    },
  };

  /** Line chart for one account (actual solid, plan dashed when the account has plan values). */
  function lineChart(canvas, acc, { plan = true } = {}) {
    const vis = S.rows.filter(inRange);
    const act = vis.filter((r) => !r.isPlan && acc.get(r) != null);
    const plans = plan ? vis.filter((r) => r.isPlan && acc.get(r) != null) : [];
    const planPts = plans.length && act.length ? [act[act.length - 1]].concat(plans) : plans;
    const color = acc.color;
    charts.push(new Chart(canvas, {
      type: "line",
      data: { datasets: [
        { label: "Actual", data: act.map((r) => ({ x: dn(r.date), y: acc.get(r) })), borderColor: color, borderWidth: 2.5, pointRadius: 0, pointHitRadius: 8, tension: 0.25,
          fill: { target: "origin", above: color + "18" } },
        { label: "Plan", data: planPts.map((r) => ({ x: dn(r.date), y: acc.get(r) })), borderColor: css("--faint"), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.25 },
      ] },
      options: fitX(baseOptions({
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => fullDay(it[0].parsed.x), label: (it) => `${it.dataset.label}: ${S.hide ? "••••••" : FE.money(it.parsed.y)}` } } },
      }), act.concat(planPts).map((r) => dn(r.date))),
      plugins: [todayLine],
    }));
  }

  function donutChart(canvas, groups) {
    charts.push(new Chart(canvas, {
      type: "doughnut",
      data: { labels: groups.map((g) => g.name), datasets: [{ data: groups.map((g) => Math.max(g.value, 0)), backgroundColor: groups.map((g) => g.color), borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "68%", animation: { duration: 350 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => {
          const tot = it.dataset.data.reduce((a, b) => a + b, 0);
          return ` ${it.label}: ${S.hide ? "••••••" : FE.money(it.parsed)} (${FE.pct(tot ? it.parsed / tot : 0)})`; } } } } },
    }));
  }

  function barChart(canvas, rows, get, label) {
    charts.push(new Chart(canvas, {
      type: "bar",
      data: { datasets: [{ label, data: rows.map((r) => ({ x: dn(r.date), y: get(r) })), backgroundColor: rows.map((r) => (get(r) < 0 ? css("--red") : css("--green"))), barThickness: 5, borderRadius: 2 }] },
      options: fitX(baseOptions({ scales: { x: { ...baseOptions().scales.x, offset: true }, y: baseOptions().scales.y },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => fullDay(it[0].parsed.x), label: (it) => `${label}: ${FE.money(it.parsed.y, true)}` } } } }), rows.map((r) => dn(r.date))),
    }));
  }

  function allocationChart(canvas) {
    const rows = actualRows().filter(inRange);
    const parts = [["Brokerage", GROUP.fidelity, (r) => r.record.fidelity], ["Banks", GROUP.banks, (r) => bankTotal(r.record)], ["Receivables", GROUP.borc, (r) => r.record.borc || 0], ["Cash", GROUP.cash, (r) => r.record.cash || 0]];
    charts.push(new Chart(canvas, {
      type: "line",
      data: { datasets: parts.map(([label, color, f], i) => ({ label, data: rows.map((r) => ({ x: dn(r.date), y: Math.max(f(r), 0) })), borderColor: color, backgroundColor: color + "cc",
        fill: i === 0 ? "origin" : "-1", pointRadius: 0, pointHitRadius: 6, borderWidth: 1, tension: 0.2 })) },
      options: fitX(baseOptions({
        scales: { x: baseOptions().scales.x, y: { ...baseOptions().scales.y, stacked: true, min: 0 } },
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: css("--muted") } },
          tooltip: { itemSort: (a, b) => b.datasetIndex - a.datasetIndex, callbacks: {
            title: (it) => fullDay(it[0].parsed.x),
            label: (it) => { const tot = it.chart.data.datasets.reduce((s, d) => s + (d.data[it.dataIndex]?.y || 0), 0); return ` ${it.dataset.label}: ${FE.money(it.parsed.y)} (${FE.pct(tot ? it.parsed.y / tot : 0)})`; },
            footer: (it) => "Total: " + FE.money(it[0].chart.data.datasets.reduce((s, d) => s + (d.data[it[0].dataIndex]?.y || 0), 0)) } } },
      }), rows.map((r) => dn(r.date))),
    }));
  }

  // ───────────────────────── shared pieces ─────────────────────────
  const rangeSeg = (extra = "") => `<div class="seg ${extra}">${["6M", "1Y", "3Y", "All"].map((r) => `<button class="${S.range === r ? "on" : ""}" data-action="range" data-range="${r}">${r}</button>`).join("")}</div>`;
  function pageHead(title, sub, actions = "") {
    return `<div class="page-head"><div><h1 class="title">${title}</h1>${sub ? `<div class="muted small">${sub}</div>` : ""}</div><div class="row">${actions}</div></div>`;
  }
  const hideBtn = () => `<button class="btn small" data-action="hide" title="${S.hide ? "Show amounts" : "Hide amounts"}">${S.hide ? "🙈 Hidden" : "👁 Show"}</button>`;
  const newBtn = () => `<button class="btn small primary" data-action="new">＋ New entry</button>`;
  function kpi(label, value, sub = "", extra = "") {
    return `<div class="card kpi ${extra}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  }
  function lastRecordLine() {
    const l = latest(); if (!l) return "";
    const days = FE.daysBetween(l.date, todayS());
    const next = FE.checkIn(l.date, todayS());
    return `Last entry ${FE.dateTR(l.date)} (${days} ${days === 1 ? "day" : "days"} ago) · Next entry due ${FE.dateTR(next.state === "upcoming" ? next.due : FE.suggestedDate(l.date, todayS()))}`;
  }
  function groupsOf(l) {
    const r = l.record;
    return [
      { id: "fidelity", name: "Brokerage", color: GROUP.fidelity, value: r.fidelity },
      ...(FE.hasBreakdown(r)
        ? FE.orderedKeys(S.banks.map((b) => b.key), [r]).map((k) => ({ id: "bank:" + k, name: bankName(k), color: bankColor(k), value: r.banks[k] || 0 }))
        : [{ id: "banks", name: "Banks", color: GROUP.banks, value: bankTotal(r) }]),
      { id: "borc", name: "Receivables", color: GROUP.borc, value: r.borc || 0 },
      { id: "cash", name: "Cash", color: GROUP.cash, value: r.cash || 0 },
    ].filter((g) => g.value !== 0);
  }

  // ───────────────────────── Overview ─────────────────────────
  function overviewView() {
    const l = latest();
    if (!l) return pageHead("Overview", "No entries yet", newBtn()) + `<div class="card"><p class="muted">Add your first entry, or restore the sample data in Settings.</p></div>`;
    const prev = FE.previousOf(S.rows, l), ago = FE.yearAgo(S.rows, l);
    const avg = last12(S.rows, l.date);
    const groups = groupsOf(l), tot = l.total, pers = periods(l);
    return `${pageHead("Overview", lastRecordLine(), hideBtn() + newBtn())}
      <div class="grid">
        ${kpi("Total net worth", money(tot), `Digital ${money(l.digital)} · Receivables + cash ${money((l.record.borc || 0) + (l.record.cash || 0))}`, "s3 kpi-main")}
        ${kpi("Last period", prev ? money(tot - prev.total, { signed: true, colored: true }) : "—",
          prev ? `${pctTxt(tot - prev.total, prev.total)} · ${l.days} days` : "", "s3")}
        ${kpi("Last 12 months", ago ? money(tot - ago.total, { signed: true, colored: true }) : "—",
          ago ? `${pctTxt(tot - ago.total, ago.total)} · since ${FE.dateTR(ago.date)}` : "No data from a year ago", "s3")}
        ${kpi("Avg. monthly growth", money(avg && avg.monthly, { signed: true, colored: true }), "12-month average", "s3")}

        <div class="card s8"><div class="card-head"><h2 class="card-title">Total net worth</h2>${rangeSeg("mini")}</div>
          <div class="chart-box tall"><canvas id="c-total"></canvas></div><div class="tiny muted">Solid line actual, dashed line plan${S.records.some((r) => r.status === "plan") && planLabel(planSettings()) ? ` (${planLabel(planSettings())})` : ""} · <button class="link" data-action="plan">Extend / shorten plan</button></div></div>
        <div class="card s4"><h2 class="card-title">Allocation</h2>
          <div class="donut-box"><canvas id="c-donut"></canvas><div class="donut-center"><div class="tiny muted">Total</div><b>${S.hide ? "••••••" : FE.short(tot)}</b></div></div>
          <div class="legend">${groups.map((g) => `<button class="legend-row" data-action="account" data-id="${g.id}"><i class="swatch" style="background:${g.color}"></i><span class="grow">${g.name}</span><span class="muted small">${FE.pct(g.value / tot)}</span><span class="amt">${money(g.value)}</span></button>`).join("")}</div></div>

        <div class="card s7"><div class="card-head"><h2 class="card-title">Accounts</h2><button class="link small" data-action="tab" data-tab="accounts">All ›</button></div>${accountsTable(l, prev)}</div>
        <div class="card s5"><h2 class="card-title">How much did it grow?</h2>${increaseTable(pers)}
          <div class="tiny muted" style="margin-top:12px">Growth per entry · last 12 months</div><div class="chart-box"><canvas id="c-flow"></canvas></div></div>

        <div class="s12" id="market">${marketCard()}</div>
      </div>`;
  }

  function increaseTable(pers) {
    return `<table class="mini-table"><thead><tr><th>Period</th><th>Growth</th><th>%</th></tr></thead><tbody>
      ${pers.map((p) => p.empty ? "" : `<tr><td>${p.label}<div class="tiny faint">${FE.dateTR(p.from.date)} → ${FE.dateTR(p.to.date)}</div></td><td class="bold">${money(p.change, { signed: true, colored: true })}</td><td class="muted">${p.base ? pctTxt(p.change, p.base) : ""}</td></tr>`).join("")}</tbody></table>`;
  }

  function accountsTable(l, prev) {
    const accs = accounts().filter((a) => a.id !== "total");
    const rows = accs.map((a) => {
      const v = a.get(l), p = prev ? a.get(prev) : null;
      if (!a.head && !v && !p) return "";
      const ch = v != null && p != null ? v - p : null;
      return `<tr class="row-link ${a.sub ? "sub" : ""}" data-action="account" data-id="${a.id}">
        <td><i class="swatch" style="background:${a.color}"></i> ${esc(a.name)}</td><td>${money(v)}</td><td class="muted">${l.total && v != null ? FE.pct(v / l.total) : ""}</td>
        <td>${ch != null && Math.round(ch) !== 0 ? money(ch, { signed: true, colored: true }) : '<span class="faint">—</span>'}</td></tr>`;
    }).join("");
    return `<table class="mini-table"><thead><tr><th>Account</th><th>Amount</th><th>Share</th><th>Change</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${money(l.total)}</td><td></td><td>${prev ? money(l.total - prev.total, { signed: true, colored: true }) : ""}</td></tr></tfoot></table>`;
  }

  // Market
  function sparkline(points, up) {
    if (!points || points.length < 2) return "";
    const ys = points.map((p) => p.close), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const d = points.map((p, i) => `${(i / (points.length - 1)) * 70},${26 - ((p.close - min) / span) * 24}`).join(" ");
    return `<svg viewBox="0 0 70 28" aria-hidden="true"><polyline fill="none" stroke="${up ? css("--green") : css("--red")}" stroke-width="1.5" points="${d}"/></svg>`;
  }
  function priceText(v, m) {
    if (v == null) return "—";
    const digits = m.style === "rate" ? 4 : m.style === "points" || v < 1000 ? 2 : 0;
    const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    return m.style === "usd" ? "$" + s : s;
  }
  function marketCard() {
    return `<div class="card"><div class="card-head"><h2 class="card-title">Markets</h2><div class="row"><span class="tiny muted">Sample prices in this demo · the private version shows live Yahoo Finance quotes</span><button class="icon-btn" data-action="quotes" aria-label="Refresh">${S.quotesLoading ? "⏳" : "↻"}</button></div></div>
      <div class="market-grid">${FE.MARKETS.map((m) => { const q = S.quotes[m.id]; const first = q && q.points[0];
        const up = q && first ? q.price >= first.close : true; const ch = q ? q.changePercent : null;
        return `<div class="mkt"><div class="grow"><div class="bold">${m.name}</div><div class="tiny muted">${m.detail}</div></div>${q ? sparkline(q.points, up) : ""}
          <div class="right"><div class="bold num">${q ? priceText(q.price, m) : "—"}</div><div class="small num ${ch == null ? "muted" : ch < 0 ? "neg" : "pos"}">${ch == null ? "—" : (ch < 0 ? "−" : "+") + Math.abs(ch).toFixed(2) + "%"}</div></div></div>`; }).join("")}</div>
      ${S.quotesErr ? `<div class="tiny neg">${esc(S.quotesErr)}</div>` : ""}</div>`;
  }
  async function loadQuotes(force = false) {
    if (S.quotesLoading || (!force && S.quotesAt && Date.now() - S.quotesAt < 300000)) return;
    S.quotesLoading = true; refreshMarket();
    const res = await Promise.allSettled(FE.MARKETS.map((m) => Store.quote(m.symbol, "1mo")));
    res.forEach((r, i) => { if (r.status === "fulfilled") S.quotes[FE.MARKETS[i].id] = r.value; });
    const failed = res.filter((r) => r.status === "rejected").length;
    S.quotesErr = failed ? `${failed} ${failed === 1 ? "price" : "prices"} could not be loaded` : null;
    S.quotesAt = Date.now(); S.quotesLoading = false; refreshMarket();
  }
  function refreshMarket() { const el = $("#market"); if (el) el.innerHTML = marketCard(); }

  // ───────────────────────── Accounts ─────────────────────────
  function accountsView() {
    const l = latest();
    if (!l) return pageHead("Accounts") + `<div class="card muted">No entries.</div>`;
    const accs = accounts(), acc = accs.find((a) => a.id === S.account) || accs[0];
    const prev = FE.previousOf(S.rows, l), ago = FE.yearAgo(S.rows, l);
    const v = acc.get(l), pv = prev ? acc.get(prev) : null, av = ago ? acc.get(ago) : null;
    const hist = actualRows().filter((r) => acc.get(r) != null).slice(-12).reverse();
    const max = actualRows().reduce((m, r) => { const x = acc.get(r); return x != null && (!m || x > m.v) ? { v: x, date: r.date } : m; }, null);
    const list = accs.map((a) => {
      const x = a.get(l);
      if (!a.head && !x) return a.sub && S.records.some((r) => (r.banks[a.id.slice(5)] || 0) !== 0) ? listItem(a, x, true) : "";
      return listItem(a, x, false);
    }).join("");
    function listItem(a, x, dim) {
      return `<button class="acc-item ${a.id === acc.id ? "on" : ""} ${a.sub ? "sub" : ""} ${dim ? "dim" : ""}" data-action="account" data-id="${a.id}">
        <i class="swatch" style="background:${a.color}"></i><span class="grow ellipsis">${esc(a.name)}</span><span class="num">${money(x)}</span></button>`;
    }
    return `${pageHead("Accounts", "Pick an account to see its history and changes.", hideBtn())}
      <div class="grid">
        <div class="card s4 acc-list">${list}</div>
        <div class="s8 col">
          <div class="card"><div class="card-head"><div><div class="kpi-label"><i class="swatch" style="background:${acc.color}"></i> ${esc(acc.name)}</div>
            <div class="kpi-value big">${money(v)}</div></div>${rangeSeg("mini")}</div>
            <div class="stat-row">
              <div><div class="tiny muted">Since previous entry</div><div class="bold">${pv != null && v != null ? money(v - pv, { signed: true, colored: true }) : "—"}</div><div class="tiny muted">${pv ? pctTxt(v - pv, pv) : ""}</div></div>
              <div><div class="tiny muted">Last 12 months</div><div class="bold">${av != null && v != null ? money(v - av, { signed: true, colored: true }) : "—"}</div><div class="tiny muted">${av ? pctTxt(v - av, av) : ""}</div></div>
              <div><div class="tiny muted">Share of total</div><div class="bold">${acc.id === "total" ? "100%" : l.total && v != null ? FE.pct(v / l.total, false) : "—"}</div></div>
              <div><div class="tiny muted">All-time high</div><div class="bold">${max ? money(max.v) : "—"}</div><div class="tiny muted">${max ? FE.dateTR(max.date) : ""}</div></div>
            </div>
            <div class="chart-box tall"><canvas id="c-acc"></canvas></div></div>
          <div class="card"><h2 class="card-title">Recent entries</h2>
            <table class="mini-table"><thead><tr><th>Date</th><th>Amount</th><th>Change</th>${acc.id === "fidelity" ? "<th>Transfer in</th>" : ""}</tr></thead><tbody>
            ${hist.map((r) => { const p = FE.previousOf(S.rows, r), pv2 = p ? acc.get(p) : null, ch = pv2 != null ? acc.get(r) - pv2 : null;
              return `<tr class="row-link" data-action="detail" data-date="${r.date}"><td>${FE.dateTR(r.date)}</td><td>${money(acc.get(r))}</td><td>${ch != null ? money(ch, { signed: true, colored: true }) : "—"}</td>
                ${acc.id === "fidelity" ? `<td>${r.record.fidelity_transfer_in ? money(r.record.fidelity_transfer_in) : '<span class="faint">—</span>'}</td>` : ""}</tr>`; }).join("")}
            </tbody></table></div>
        </div>
      </div>`;
  }

  // ───────────────────────── Records ─────────────────────────
  function recordsView() {
    return `${pageHead("Records", `${actualRows().length} actual, ${S.rows.length - actualRows().length} plan entries`, hideBtn() + newBtn())}
      <input class="search" style="max-width:420px" type="search" placeholder="Search by year or month (2026, September)" value="${esc(S.search)}" data-input="search">
      <div id="list">${recordsBody()}</div>`;
  }
  function recordsBody() {
    const q = S.search.trim().toLowerCase();
    const rows = S.rows.filter((r) => !q || FE.searchKey(r.date).includes(q));
    if (!rows.length) return `<p class="muted" style="text-align:center;padding:40px">${q ? "No results" : "No entries"}</p>`;
    const years = new Map(FE.yearSummaries(S.rows).map((y) => [y.year, y]));
    const by = new Map();
    for (const r of rows) { const y = FE.year(r.date); if (!by.has(y)) by.set(y, []); by.get(y).push(r); }
    const keys = [...by.keys()].sort((a, b) => b - a);
    const cell = (v, o) => `<td>${money(v, o)}</td>`;
    const table = `<div class="table-wrap only-desktop"><table class="records"><thead><tr><th>Date</th><th>Brokerage</th><th>Banks</th><th>Receivables</th><th>Cash</th><th>Total</th><th>Change</th></tr></thead>
      ${keys.map((y) => { const s = years.get(y);
        return `<tbody><tr class="year"><td colspan="5">${y}</td><td colspan="2">${s && s.annualIncrease != null ? `<span class="small muted">Annual growth</span> ${money(s.annualIncrease, { signed: true, colored: true })}` : ""}</td></tr>
          ${by.get(y).slice().reverse().map((r) => {
            return `<tr class="row-link ${r.isPlan ? "plan" : ""}" data-action="detail" data-date="${r.date}">
            <td>${FE.dateTR(r.date)} ${r.isPlan ? '<span class="pill plan">Plan</span>' : ""}${r.record.note ? ' <span title="' + esc(r.record.note) + '">📝</span>' : ""}</td>
            ${cell(r.record.fidelity)}${cell(bankTotal(r.record))}${cell(r.record.borc)}${cell(r.record.cash)}
            <td class="total">${money(r.total)}</td>${cell(r.change, { signed: true, colored: true })}</tr>`; }).join("")}</tbody>`; }).join("")}
    </table></div>`;
    const list = `<div class="only-mobile">${keys.map((y) => `<div class="year-head"><b>${y}</b></div><div class="list">${by.get(y).slice().reverse().map((r) => `<button class="item ${r.isPlan ? "plan" : ""}" data-action="detail" data-date="${r.date}">
        <div class="grow"><div class="bold">${FE.dateTR(r.date)}</div><div class="tiny muted">${r.isPlan ? '<span class="pill plan">Plan</span>' : r.days != null ? r.days + " days" : ""}</div></div>
        <div class="right"><div class="bold">${money(r.total)}</div><div class="tiny">${money(r.change, { signed: true, colored: true })}</div></div></button>`).join("")}</div>`).join("")}</div>`;
    return table + list;
  }

  // ───────────────────────── Analysis ─────────────────────────
  function analysisView() {
    const act = actualRows();
    const byYear = new Map();
    for (const r of act) { const y = FE.year(r.date); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); }
    let prevEnd = null;
    const years = [...byYear.keys()].sort((a, b) => a - b).map((y) => {
      const rs = byYear.get(y), last = rs[rs.length - 1];
      const out = { year: y, end: last.total, endDate: last.date, change: prevEnd == null ? null : last.total - prevEnd,
        start: prevEnd, count: rs.length };
      prevEnd = last.total;
      return out;
    }).reverse();
    const l = latest();
    const avg = l && last12(S.rows, l.date);
    const start = act.find((r) => r.total > 0);
    return `${pageHead("Analysis", "Growth by year and by period.", hideBtn())}
      <div class="grid">
        ${kpi("Growth, last 12 months", money(avg && avg.total, { signed: true, colored: true }), "", "s4")}
        ${kpi("Avg. monthly growth · last 12 months", money(avg && avg.monthly, { signed: true, colored: true }), "Last 12 months ÷ 12", "s4")}
        ${kpi("Avg. growth per 30 days · all time", money(l && l.avg30, { signed: true, colored: true }), start ? `Since the ${FE.dateTR(start.date)} entry` : "", "s4")}
        <div class="card s12"><h2 class="card-title">Years</h2>
          <div class="table-scroll"><table class="mini-table wide"><thead><tr><th>Year</th><th>Last entry of the year</th><th>Total</th><th>Annual growth</th><th>%</th><th>Entries</th></tr></thead><tbody>
          ${years.map((y) => `<tr><td class="bold">${y.year}</td><td class="muted">${FE.dateTR(y.endDate)}</td><td>${money(y.end)}</td><td>${y.change == null ? "—" : money(y.change, { signed: true, colored: true })}</td><td class="muted">${y.change == null ? "" : pctTxt(y.change, y.start)}</td><td class="muted">${y.count}</td></tr>`).join("")}
          </tbody></table></div><div class="tiny muted">Actual entries only. Annual growth = last entry of the year − last entry of the previous year.</div></div>
        <div class="s12">${rangeSeg()}</div>
        <div class="card s12"><h2 class="card-title">Growth per entry</h2><div class="chart-box"><canvas id="c-net"></canvas></div></div>
        <div class="card s12"><h2 class="card-title">Allocation over time</h2><div class="chart-box tall"><canvas id="c-alloc"></canvas></div><div class="tiny muted">Hover or tap the chart to see each account&rsquo;s amount and share on that date.</div></div>
      </div>`;
  }

  // ───────────────────────── Settings ─────────────────────────
  function settingsView() {
    const st = Store.state, visible = S.banks.filter((b) => !b.hidden), hidden = S.banks.filter((b) => b.hidden);
    const bankRow = (b, i) => `<div class="field"><label class="ellipsis"><button class="bold" data-action="bank-rename" data-key="${b.key}">${esc(b.name)}</button> <span class="tiny faint">${b.key}</span></label>
      <button class="icon-btn" data-action="bank-move" data-key="${b.key}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="bank-move" data-key="${b.key}" data-dir="1" ${i === visible.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="bank-remove" data-key="${b.key}" aria-label="Remove">✕</button></div>`;
    return `${pageHead("Settings")}<div class="settings-grid"><div>
      <div class="section-title">Demo data</div>
      <div class="list"><div class="kv"><span>Stored in</span><span>This browser only</span></div>
        <div class="kv"><span>Entries</span><span>${S.records.length}</span></div>
        <div class="kv"><span>Last saved</span><span>${st.savedAt ? new Date(st.savedAt).toLocaleString("en-US") : "—"}</span></div></div>
      <div class="row" style="margin-top:8px"><button class="btn small danger" data-action="reset-demo">↺ Restore sample data</button></div>
      <div class="note">This is a public demo with fictional figures. Your edits are kept only in this browser; restoring brings the sample data back.</div>
      <div class="section-title">Import / export</div>
      <div class="list"><button class="item" data-action="import"><span class="grow">⬇️ Import (CSV / JSON)</span></button>
        <button class="item" data-action="export" data-fmt="csv"><span class="grow">⬆️ Export · CSV</span></button>
        <button class="item" data-action="export" data-fmt="json"><span class="grow">⬆️ Export · JSON</span></button></div>
      <div class="note">Import updates entries by date and never deletes any; a preview comes first. Same file format as the iPhone app.</div>
      <div class="section-title">Plan</div>
      <div class="list"><button class="item" data-action="plan"><span class="grow">🗓 Update plan</span><span class="muted">›</span></button></div>
      <div class="section-title">Display</div>
      <div class="list"><div class="field"><label>Hide amounts</label><label class="switch"><input type="checkbox" data-input="hide" ${S.hide ? "checked" : ""}><i></i></label></div></div>
      </div><div>
      <div class="section-title">Banks</div>
      <div class="list">${visible.map(bankRow).join("")}
        <div class="field"><input class="grow" style="text-align:left;width:auto" placeholder="New bank name" data-input="newbank">
          <button class="btn small primary" data-action="bank-add">Add</button></div></div>
      ${hidden.length ? `<div class="note">Removed (past values are kept): ${hidden.map((b) => `${esc(b.name)} <button class="link" data-action="bank-restore" data-key="${b.key}">Restore</button>`).join(" · ")}</div>` : ""}
      <div class="note">Click a name to rename it, use the arrows to reorder. A removed bank keeps its past values.</div>
      <div class="note">The private version runs only on my own Mac and iPhone; nothing is sent anywhere.</div>
      </div></div>`;
  }

  // ───────────────────────── render ─────────────────────────
  function render() {
    destroyCharts();
    document.querySelectorAll(".tab, .side-link").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === S.tab));
    renderSideFoot();
    const views = { overview: overviewView, accounts: accountsView, records: recordsView, analysis: analysisView, settings: settingsView };
    $("#view").innerHTML = views[S.tab]();
    if (!window.Chart) return;
    const l = latest();
    if (S.tab === "overview" && l) {
      lineChart($("#c-total"), accounts()[0]);
      donutChart($("#c-donut"), groupsOf(l));
      barChart($("#c-flow"), actualRows().filter((r) => r.change != null && r.date > FE.addMonths(l.date, -12)), (r) => r.change, "Growth");
      loadQuotes();
    }
    if (S.tab === "accounts" && l) {
      const accs = accounts(), acc = accs.find((a) => a.id === S.account) || accs[0];
      lineChart($("#c-acc"), acc, { plan: ["total", "fidelity", "banks"].includes(acc.id) || acc.id.startsWith("bank:") });
    }
    if (S.tab === "analysis") {
      barChart($("#c-net"), actualRows().filter((r) => r.change != null && inRange(r)), (r) => r.change, "Growth");
      allocationChart($("#c-alloc"));
    }
  }
  function renderSideFoot() {
    const el = $("#side-foot"); if (!el) return;
    const l = latest(), sync = Store.state.sync;
    el.innerHTML = `${l ? `Latest entry<br><b style="color:var(--text)">${FE.dateTR(l.date)}</b><br>` : ""}${S.records.length} entries · stored in this browser`;
  }

  // ───────────────────────── dialogs ─────────────────────────
  let sheetActions = {};
  function openSheet(html, actions = {}, onMount) {
    const el = $("#sheet");
    el.innerHTML = `<div class="sheet-inner">${html}</div>`;
    el.hidden = false; el.scrollTop = 0; document.body.style.overflow = "hidden";
    sheetActions = actions;
    onMount && onMount(el);
  }
  function closeSheet() { const el = $("#sheet"); el.hidden = true; el.innerHTML = ""; document.body.style.overflow = ""; sheetActions = {}; }
  const bar = (title) => `<div class="sheet-bar"><button class="close" data-action="close" aria-label="Close">✕</button><h3>${title}</h3><span style="width:38px"></span></div>`;

  function openDetail(date) {
    const r = S.rows.find((x) => x.date === date);
    if (!r) return;
    const rec = r.record, p = FE.previousOf(S.rows, r), kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
    const banks = FE.orderedKeys(S.banks.map((b) => b.key), [rec]).filter((k) => rec.banks[k] != null);
    const pos = banks.reduce((s, k) => s + Math.max(rec.banks[k], 0), 0) || 1;
    openSheet(`${bar(FE.dateTR(date) + (r.isPlan ? " · Plan" : ""))}
      <div class="tiles">${[["Total", money(r.total)], ["Change", money(r.change, { signed: true, colored: true })], ["Since previous", r.days != null ? r.days + " days" : "—"]]
        .map(([t, v]) => `<div class="tile"><div class="tiny">${t}</div><div class="bold">${v}</div></div>`).join("")}</div>
      <div class="section-title">Calculated</div><div class="list">${kv("Digital total", money(r.digital))}${kv("Digital change", money(r.digitalChange, { signed: true, colored: true }))}${kv("Avg. growth per 30 days", money(r.avg30, { signed: true, colored: true }))}</div>
      <div class="section-title">Balances</div><div class="list">${kv("Brokerage", money(rec.fidelity))}${kv("Banks", money(bankTotal(rec)))}${["borc", "cash", "fidelity_transfer_in"].map((f) => kv(FE.LABELS[f], money(rec[f]))).join("")}</div>
      ${FE.hasBreakdown(rec) && banks.length ? `<div class="section-title">Banks</div><div class="card"><div class="stackbar" style="margin-top:0">${banks.filter((k) => rec.banks[k] > 0).map((k) => `<i style="width:${(rec.banks[k] / pos) * 100}%;background:${bankColor(k)}"></i>`).join("")}</div>
        ${banks.map((k) => `<div class="line"><i class="swatch" style="background:${bankColor(k)}"></i><span class="name">${esc(bankName(k))}</span><span class="amt">${money(rec.banks[k])}</span></div>`).join("")}</div>` : ""}
      ${rec.legacy_1yil != null || rec.legacy_oran != null ? `<div class="section-title">Sheet metrics</div><div class="list">${kv("1 Year", rec.legacy_1yil == null ? "—" : FE.pct(rec.legacy_1yil))}${kv("Ratio", rec.legacy_oran == null ? "—" : FE.pct(rec.legacy_oran))}</div>` : ""}
      ${rec.note ? `<div class="section-title">Note</div><div class="card">${esc(rec.note)}</div>` : ""}
      <div class="bottom-bar"><div class="inner"><button class="btn danger" data-action="delete">Delete</button><button class="btn primary grow" data-action="edit">Edit</button></div></div>`,
    {
      edit: () => openRecordForm(date),
      delete: async () => {
        if (!confirm(`Delete the ${FE.dateTR(date)} entry?`)) return;
        if (await commit(S.records.filter((x) => x.date !== date), S.banks, `Entry deleted: ${date}`)) { closeSheet(); render(); }
      },
    });
  }

  /** One form for new and existing records: every account on one screen, previous values as hints, live totals. */
  function openRecordForm(date = null) {
    const orig = date ? S.records.find((x) => x.date === date) : null;
    const base = (() => {
      if (orig) { const row = S.rows.find((x) => x.date === date); const p = row && FE.previousOf(S.rows, row); return p ? p.record : null; }
      return S.records.filter((r) => r.status === "actual").sort((a, b) => (a.date < b.date ? -1 : 1)).pop() || null;
    })();
    let d;
    if (orig) d = FE.clone(orig);
    else {
      d = FE.emptyRecord(FE.suggestedDate(base && base.date, todayS()));
      if (base) {
        Object.assign(d, { fidelity: base.fidelity, saving: base.saving, checking: base.checking, borc: base.borc, cash: base.cash });
        for (const b of S.banks) if (!b.hidden && base.banks[b.key] != null) d.banks[b.key] = base.banks[b.key];
      }
    }
    const bankKeys = FE.orderedKeys(S.banks.filter((b) => !b.hidden || d.banks[b.key] != null).map((b) => b.key), [d]);
    const prevOf = (path) => (!base ? null : path === "banksTotal" ? bankTotal(base) : path.startsWith("bank:") ? base.banks[path.slice(5)] ?? null : base[path] ?? null);
    const valueOf = (path) => (path === "banksTotal" ? bankTotal(d) : path.startsWith("bank:") ? d.banks[path.slice(5)] ?? null : d[path] ?? null);
    const hint = (path) => { const p = prevOf(path); return p == null ? "" : `previous ${FE.money(p)}`; };
    const field = (label, path, color) => `<label class="ff"><span class="ff-label">${color ? `<i class="swatch" style="background:${color}"></i>` : ""}${esc(label)}</span>
      <input inputmode="decimal" autocomplete="off" data-field="${path}" value="${esc(fmtInput(valueOf(path)))}" placeholder="0"><span class="ff-hint" data-hint="${path}">${hint(path)}</span></label>`;
    const stale = () => orig ? [] : S.records.filter((r) => r.status === "plan" && r.date < d.date && (!base || r.date > base.date));
    const finalRecord = () => { const r = FE.applyBreakdownRule(FE.clone(d), kinds()); if (!orig) r.status = "actual"; return r; };
    const summary = () => {
      const r = finalRecord(), st = new Set(stale().map((x) => x.date));
      const others = S.records.filter((x) => x.date !== r.date && x.date !== date && !st.has(x.date));
      const rows = withChanges(FE.compute(others.concat([r]))), row = rows.find((x) => x.date === r.date);
      const avg = row && !row.isPlan ? last12(rows, row.date) : null;
      const derived = FE.hasBreakdown(r) ? `<div class="tiny muted">Banks ${FE.money(bankTotal(r))}</div>` : "";
      return `<div class="sum"><div><div class="tiny muted">Total</div><b class="num">${row ? FE.money(row.total) : "—"}</b>${derived}</div>
        <div><div class="tiny muted">Change</div><b class="num ${tone(row && base ? row.total - FE.total(base) : null)}">${row && base ? FE.money(row.total - FE.total(base), true) : "—"}</b></div>
        <div><div class="tiny muted">Avg. monthly growth · 12 months</div><b class="num ${tone(avg && avg.monthly)}">${avg ? FE.money(avg.monthly, true) : "—"}</b></div></div>`;
    };
    const breakdown = FE.hasBreakdown(d) || (!orig && bankKeys.length > 0);
    openSheet(`${bar(orig ? "Edit entry" : "New entry")}
      <div class="form-top"><label class="ff"><span class="ff-label">Date</span><input type="date" data-field="date" value="${d.date}"></label>
        ${orig ? `<label class="ff"><span class="ff-label">Status</span><select data-field="status"><option value="actual" ${d.status === "actual" ? "selected" : ""}>Actual</option><option value="plan" ${d.status === "plan" ? "selected" : ""}>Plan</option></select></label>` : ""}</div>
      <div class="section-title">Investments</div><div class="ff-grid">${field("Brokerage", "fidelity", GROUP.fidelity)}${field("Transferred in (this period)", "fidelity_transfer_in")}</div>
      <div class="note">Optional: if you added new money to the brokerage account this period, enter it here (so its return can be separated later).</div>
      <div class="section-title">Banks</div><div class="ff-grid">${breakdown
        ? bankKeys.map((key) => field(bankName(key), "bank:" + key, bankColor(key))).join("") || '<div class="muted small">No banks. Add one in Settings → Banks.</div>'
        : field("Banks (total)", "banksTotal", GROUP.banks)}</div>
      <div class="section-title">Other</div><div class="ff-grid">${field("Receivables (money owed to you)", "borc", GROUP.borc)}${field("Cash", "cash", GROUP.cash)}</div>
      <div class="section-title">Note</div><textarea class="input" rows="2" data-field="note" placeholder="Optional">${esc(d.note)}</textarea>
      <div class="note" id="stale-note">${stale().length ? `${stale().length} past plan ${stale().length === 1 ? "entry" : "entries"} (${stale().map((x) => FE.dateTR(x.date)).join(", ")}) will be removed.` : ""}</div>
      <div class="bottom-bar"><div class="inner col-bar"><div id="form-sum">${summary()}</div><div class="row"><button class="btn" data-action="close">Cancel</button><button class="btn primary grow" data-action="save-record">Save</button></div></div></div>`,
    {
      "save-record": async () => {
        const rec = finalRecord();
        if (!FE.parseDay(rec.date)) return toast("Invalid date");
        const clash = S.records.find((x) => x.date === rec.date && x.date !== date);
        if (clash && (orig || clash.status === "actual")) return toast(`There is already an entry on ${FE.dateTR(rec.date)}.`, 4000);
        const st = new Set(stale().map((x) => x.date));
        let next = S.records.filter((x) => x.date !== date && x.date !== rec.date && !st.has(x.date)).concat([rec]);
        const ps = planSettings(), hadPlan = S.records.some((x) => x.status === "plan");
        if (ps.auto && hadPlan && rec.status === "actual" && latestActualRecord(next) === rec) next = replanned(next, ps);
        if (await commit(next, S.banks, orig ? `Entry edited: ${rec.date}` : `Entry: ${rec.date}`)) { closeSheet(); render(); }
      },
    },
    (el) => {
      const first = $('[data-field="fidelity"]', el); if (first && !orig) setTimeout(() => { first.focus(); first.select(); }, 60);
      el.addEventListener("input", (e) => {
        const f = e.target.dataset.field; if (!f) return;
        const v = e.target.value;
        if (f === "date") { if (FE.parseDay(v)) d.date = v; $("#stale-note", el).textContent = stale().length ? `${stale().length} past plan ${stale().length === 1 ? "entry" : "entries"} (${stale().map((x) => FE.dateTR(x.date)).join(", ")}) will be removed.` : ""; }
        else if (f === "status") d.status = v; else if (f === "note") d.note = v;
        else if (f.startsWith("bank:")) { const n = parseAmount(v); if (n == null) delete d.banks[f.slice(5)]; else d.banks[f.slice(5)] = n; }
        else if (f === "banksTotal") { d.saving = parseAmount(v) ?? 0; d.checking = 0; }
        else if (f === "fidelity") d[f] = parseAmount(v) ?? 0;
        else d[f] = parseAmount(v);
        if (f !== "note" && f !== "date" && f !== "status") {
          const h = $(`[data-hint="${f}"]`, el), p = prevOf(f), cur = valueOf(f);
          if (h && p != null) { const ch = (cur ?? 0) - p; h.innerHTML = `previous ${FE.money(p)}${Math.round(ch) ? ` · <span class="${tone(ch)}">${FE.money(ch, true)}</span>` : ""}`; }
        }
        $("#form-sum", el).innerHTML = summary();
      });
      el.addEventListener("focusout", (e) => { const f = e.target.dataset && e.target.dataset.field; if (f && f !== "date" && f !== "note" && f !== "status") e.target.value = fmtInput(valueOf(f)); });
    });
  }

  // ───────────────────────── import / export / plan ─────────────────────────
  function openImport(parsed, name) {
    const plan = FE.importPlan(parsed, S.records);
    const known = new Set(S.banks.map((b) => b.key)), newBanks = parsed.bankKeys.filter((k) => !known.has(k));
    const has = plan.newRecords.length || plan.changed.length;
    const kv = (k, v, c = "") => `<div class="kv"><span>${k}</span><span class="bold ${c}">${v}</span></div>`;
    const label = (c) => FE.LABELS[c] || bankName(c);
    openSheet(`${bar("Import preview")}<div class="section-title">${esc(name)}</div>
      <div class="list">${kv("New", plan.newRecords.length, "pos")}${kv("Changed", plan.changed.length, plan.changed.length ? "" : "muted")}${kv("Unchanged", plan.unchanged.length, "muted")}${kv("Rejected", plan.rejected.length, plan.rejected.length ? "neg" : "muted")}</div>
      <div class="note">No entry is deleted. Only new and changed rows are written.</div>
      ${newBanks.length ? `<div class="section-title">New bank columns</div><div class="list">${newBanks.map((k) => kv(FE.defaultName(k), k, "muted")).join("")}</div><div class="note">They are added as banks when you apply.</div>` : ""}
      ${plan.changed.length ? `<div class="section-title">Changed</div><div class="list">${plan.changed.map((c) => `<details class="kv" style="display:block"><summary>${FE.dateTR(c.record.date)} <span class="muted small">· ${c.changes.length} ${c.changes.length === 1 ? "field" : "fields"}</span></summary>
        ${c.changes.map((ch) => `<div class="small" style="padding:4px 0"><span class="muted">${esc(label(ch.key))}:</span> <span class="neg">${esc(ch.before || "—")}</span> → <span class="pos">${esc(ch.after || "—")}</span></div>`).join("")}</details>`).join("")}</div>` : ""}
      ${plan.rejected.length ? `<div class="section-title">Rejected rows</div><div class="list">${plan.rejected.map((r) => `<div class="kv" style="display:block"><div class="small">Row ${r.line}${r.dateText ? " · " + esc(r.dateText) : ""}</div><div class="tiny neg">${esc(r.reason)}</div></div>`).join("")}</div>` : ""}
      <div class="bottom-bar"><div class="inner"><button class="btn" data-action="close">Cancel</button><button class="btn grow primary" data-action="apply-import" ${has ? "" : "disabled"}>Apply</button></div></div>`,
    {
      "apply-import": async () => {
        const by = new Map(S.records.map((r) => [r.date, r]));
        for (const r of plan.newRecords.concat(plan.changed.map((c) => c.record))) by.set(r.date, r);
        const banks = S.banks.concat(newBanks.map((k) => ({ key: k, name: FE.defaultName(k), kind: FE.defaultKind(k), hidden: false })));
        if (await commit([...by.values()], banks, `Import: ${plan.newRecords.length} new, ${plan.changed.length} changed`, { banksChanged: newBanks.length > 0 })) { closeSheet(); render(); }
      },
    });
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ───────────────────────── Plan ─────────────────────────
  const HORIZONS = [[6, "6 months"], [12, "1 year"], [24, "2 years"], [36, "3 years"], [60, "5 years"], [120, "10 years"]];
  /**
   * Plan settings (kept in this browser). `horizon` (months) rolls forward with each new record;
   * `end` is used instead when a fixed date was picked. `transfer`/`savings` are only set when the
   * user overrode the model's numbers.
   */
  function planSettings() {
    let saved = {};
    try { saved = JSON.parse(ls.get("plan.settings") || "{}") || {}; } catch { /* corrupt: defaults */ }
    if (!saved.horizon && !saved.end && ls.get("plan.end")) saved.end = ls.get("plan.end");
    return { horizon: null, end: null, freq: ls.get("plan.freq") || "semimonthly", months: +ls.get("plan.months") || 24,
      rate: ls.get("plan.rate") != null ? +ls.get("plan.rate") : 7, transfer: null, savings: null, auto: true, ...saved };
  }
  const savePlanSettings = (p) => ls.set("plan.settings", JSON.stringify(p));
  const latestActualRecord = (records) => records.filter((r) => r.status === "actual").sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  const planEnd = (p, base) => (p.horizon ? FE.endOfMonth(FE.year(FE.addMonths(base.date, p.horizon)), +FE.addMonths(base.date, p.horizon).slice(5, 7)) : p.end || FE.addMonths(base.date, 12));
  /** Model + plan rows for `records` with settings `p`. */
  function buildPlan(records, p) {
    const base = latestActualRecord(records);
    if (!base) return null;
    const model = FE.trendModel(records, p.months, p.rate / 100);
    const transfer = p.transfer ?? (model ? model.contribution : 0), savings = p.savings ?? (model ? model.bankMonthly : 0);
    const end = planEnd(p, base);
    const rows = FE.generatePlan(base, end, p.freq, { annualReturn: p.rate / 100, monthlyTransfer: transfer, monthlySavings: savings });
    return { base, model, transfer, savings, end, rows };
  }
  /** Records with every plan after the latest actual replaced by a freshly generated plan. */
  function replanned(records, p) {
    const b = buildPlan(records, p);
    if (!b) return records;
    return records.filter((r) => !(r.status === "plan" && r.date > b.base.date)).concat(b.rows);
  }
  const planLabel = (p) => (p.horizon ? `${HORIZONS.find(([m]) => m === p.horizon)?.[1] || p.horizon + " months"} ahead` : p.end ? "ends " + FE.dateTR(p.end) : "");

  function openPlan() {
    if (!latestActualRecord(S.records)) return toast("A plan needs at least one actual entry.");
    const p = planSettings();
    let b = buildPlan(S.records, p);
    const existing = () => S.records.filter((r) => r.status === "plan" && r.date > b.base.date);
    const modelHTML = () => { const model = b.model; return !model ? '<div class="muted small">Not enough entries for the model.</div>' : `
      <div class="kv"><span>Total · monthly trend</span><span><b class="${tone(model.total.monthly)}">${FE.money(model.total.monthly, true)}</b> <span class="tiny muted">fit R² ${model.total.r2.toFixed(2)}</span></span></div>
      <div class="kv"><span>Brokerage · monthly trend</span><span>${FE.money(model.fidelity.monthly, true)} <span class="tiny muted">R² ${model.fidelity.r2.toFixed(2)}</span></span></div>
      <div class="kv"><span>Banks + receivables + cash · monthly trend</span><span>${FE.money(model.rest.monthly, true)}</span></div>
      <div class="kv"><span>Entries used</span><span class="small">${model.count} entries · ${FE.dateTR(model.from)} – ${FE.dateTR(model.to)}</span></div>`; };
    const previewHTML = () => {
      const g = b.rows, last = g[g.length - 1], base = b.base;
      const at = (n) => { const d = FE.addMonths(base.date, n), r = g.filter((x) => x.date <= d).pop(); return r && d <= last.date ? FE.money(FE.total(r)) : null; };
      const marks = last ? [[12, "In 1 year"], [36, "In 3 years"], [60, "In 5 years"]].map(([n, t]) => [t, at(n)]).filter(([, v]) => v) : [];
      return `<div class="kv"><span>Plan entries to create</span><span class="bold">${g.length}</span></div><div class="kv"><span>Old plan entries to remove</span><span>${existing().length}</span></div>
        ${last ? `<div class="kv"><span>Range</span><span class="small">${FE.dateTR(g[0].date)} – ${FE.dateTR(last.date)}</span></div>
        ${marks.map(([t, v]) => `<div class="kv"><span>${t}</span><span>${v}</span></div>`).join("")}
        <div class="kv"><span>Total at the last entry</span><span class="bold">${FE.money(FE.total(last))}</span></div><div class="kv"><span>Growth</span><span class="${tone(FE.total(last) - FE.total(base))}">${FE.money(FE.total(last) - FE.total(base), true)}</span></div>` : ""}`;
    };
    const horizonHTML = () => `<div class="seg wrap">${HORIZONS.map(([m, t]) => `<button class="${p.horizon === m ? "on" : ""}" data-action="plan-horizon" data-m="${m}">${t}</button>`).join("")}</div>`;
    const refresh = (el) => {
      b = buildPlan(S.records, p);
      $("#plan-model", el).innerHTML = modelHTML(); $("#plan-preview", el).innerHTML = previewHTML(); $("#plan-horizon", el).innerHTML = horizonHTML();
      const endIn = $('[data-p="end"]', el); if (document.activeElement !== endIn) endIn.value = b.end;
      for (const k of ["transfer", "savings"]) { const i = $(`[data-p="${k}"]`, el); if (document.activeElement !== i) i.value = b[k]; }
    };
    const f = (label, key, val, type = "text") => `<div class="field"><label>${label}</label><input ${type === "date" ? 'type="date"' : 'inputmode="decimal"'} data-p="${key}" value="${esc(val)}"></div>`;
    const sel = (label, key, opts) => `<div class="field"><label>${label}</label><select data-p="${key}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(p[key]) ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
    openSheet(`${bar("Plan")}
      <div class="section-title">How far ahead?</div><div id="plan-horizon">${horizonHTML()}</div>
      <div class="list" style="margin-top:8px"><div class="kv"><span>Start (latest actual entry)</span><span>${FE.dateTR(b.base.date)}</span></div>${f("End date", "end", b.end, "date")}
        ${sel("Frequency", "freq", FE.FREQUENCIES.map((x) => [x.id, x.label]))}</div>
      <div class="note">Pick a length (e.g. 1 year) and the plan rolls forward with each new entry. Enter a date and it ends on that date.</div>
      <div class="section-title">Learned from history</div><div class="list">${sel("Data window", "months", [[12, "Last 12 months"], [24, "Last 24 months"], [36, "Last 36 months"]])}<div id="plan-model">${modelHTML()}</div></div>
      <div class="section-title">Assumptions</div><div class="list">${f("Expected annual brokerage return (%)", "rate", p.rate)}${f("Monthly contribution to brokerage ($)", "transfer", b.transfer)}${f("Monthly added to banks ($)", "savings", b.savings)}
        <div class="field"><label>Calculate from data</label><button class="btn small" data-action="plan-reset">Reset</button></div></div>
      <div class="note">Model: a straight-line trend is fitted to past growth. The brokerage trend is split into "your contributions + return", so the model reproduces the past, while future returns grow as the account grows (compounding). Set the return to 0 for a straight trend. Contributions and bank savings are calculated from the data; if you change them, your numbers are used. Receivables and cash stay flat.</div>
      <div class="list" style="margin-top:12px"><div class="field"><label>Refresh the plan automatically after each new entry</label><label class="switch"><input type="checkbox" data-p="auto" ${p.auto ? "checked" : ""}><i></i></label></div></div>
      <div class="section-title">Preview</div><div class="list" id="plan-preview">${previewHTML()}</div>
      <div class="note">Actual entries are never touched; only plan entries after ${FE.dateTR(b.base.date)} change.</div>
      <div class="bottom-bar"><div class="inner"><button class="btn danger" data-action="plan-clear">Delete plans</button><button class="btn primary grow" data-action="plan-apply">Apply plan</button></div></div>`,
    {
      "plan-horizon": (btn) => { p.horizon = +btn.dataset.m; p.end = null; refresh($("#sheet")); },
      "plan-reset": () => { p.transfer = null; p.savings = null; refresh($("#sheet")); },
      "plan-apply": async () => {
        if (!b.rows.length) return toast("These settings produce no plan entries.");
        if (!confirm(`Replace ${existing().length} old plan entries with ${b.rows.length} new ones?`)) return;
        savePlanSettings(p);
        if (await commit(replanned(S.records, p), S.banks, `Plan updated: ${b.rows.length} entries (${planLabel(p)})`)) { closeSheet(); render(); }
      },
      "plan-clear": async () => {
        if (!confirm(`Delete ${existing().length} future plan entries?`)) return;
        p.auto = false; savePlanSettings(p);
        if (await commit(S.records.filter((r) => !(r.status === "plan" && r.date > b.base.date)), S.banks, "Future plans deleted")) { closeSheet(); render(); }
      },
    },
    (el) => {
      const onInput = (e) => {
        const k = e.target.dataset.p; if (!k) return;
        const v = e.target.value;
        if (k === "auto") p.auto = e.target.checked;
        else if (k === "end") { if (!FE.parseDay(v)) return; p.end = v; p.horizon = null; }
        else if (k === "freq") p.freq = v;
        else if (k === "transfer" || k === "savings") p[k] = v.trim() === "" ? null : parseAmount(v) ?? 0;
        else p[k] = parseAmount(v) ?? 0;
        refresh(el);
      };
      el.addEventListener("input", onInput);
      el.addEventListener("change", (e) => { if (e.target.dataset.p === "auto") onInput(e); });
    });
  }

  // ───────────────────────── actions ─────────────────────────
  const banksCopy = () => S.banks.map((b) => ({ ...b }));
  async function saveBanks(banks, msg, records = S.records) { if (await commit(records, banks, msg, { banksChanged: true })) render(); }
  const go = (tab) => { S.tab = tab; ls.set("tab", tab); window.scrollTo(0, 0); render(); };

  const A = {
    tab: (el) => go(el.dataset.tab),
    hide: () => { S.hide = !S.hide; ls.set("hide", S.hide ? "1" : "0"); render(); },
    new: () => openRecordForm(null),
    quotes: () => loadQuotes(true),
    range: (el) => { S.range = el.dataset.range; ls.set("range", S.range); render(); },
    account: (el) => { S.account = el.dataset.id; ls.set("account", S.account); if (S.tab !== "accounts") go("accounts"); else render(); },
    detail: (el) => openDetail(el.dataset.date),
    close: () => closeSheet(),
    reload: () => boot(),
    "reset-demo": async () => {
      if (!confirm("Restore the sample data? Your changes in this demo will be discarded.")) return;
      try { localStorage.removeItem("finans-demo.plan.settings"); } catch { /* ignore */ }
      await Store.reset(); await boot(); toast("Sample data restored");
    },
    import: () => $("#file").click(),
    export: (el) => {
      const keys = S.banks.map((b) => b.key), fmt = el.dataset.fmt;
      download(`finance_demo_${todayS()}.${fmt}`, fmt === "csv" ? FE.exportCSV(S.records, keys) : FE.exportJSON(S.records, keys), fmt === "csv" ? "text/csv" : "application/json");
    },
    plan: () => openPlan(),
    "bank-rename": (el) => {
      const b = S.banks.find((x) => x.key === el.dataset.key), name = prompt("Bank name", b.name);
      if (!name || !name.trim() || name.trim() === b.name) return;
      const banks = banksCopy(); banks.find((x) => x.key === b.key).name = name.trim(); saveBanks(banks, `Bank renamed: ${name.trim()}`);
    },
    "bank-move": (el) => {
      const banks = banksCopy(), vis = banks.filter((b) => !b.hidden), i = vis.findIndex((b) => b.key === el.dataset.key), j = i + +el.dataset.dir;
      if (j < 0 || j >= vis.length) return;
      [vis[i], vis[j]] = [vis[j], vis[i]]; saveBanks(vis.concat(banks.filter((b) => b.hidden)), "Bank order");
    },
    "bank-remove": (el) => {
      const key = el.dataset.key, used = S.records.filter((r) => (r.banks[key] || 0) !== 0).length, b = S.banks.find((x) => x.key === key);
      if (!confirm(used ? `${b.name} has values in ${used} entries. Hide it? (past values are kept)` : `Delete ${b.name} completely?`)) return;
      if (used) { const banks = banksCopy(); banks.find((x) => x.key === key).hidden = true; saveBanks(banks, `Bank hidden: ${b.name}`); }
      else saveBanks(S.banks.filter((x) => x.key !== key), `Bank deleted: ${b.name}`, S.records.map((r) => { if (!(key in r.banks)) return r; const c = FE.clone(r); delete c.banks[key]; return c; }));
    },
    "bank-restore": (el) => { const banks = banksCopy(); banks.find((x) => x.key === el.dataset.key).hidden = false; saveBanks(banks, "Bank restored"); },
    "bank-add": () => {
      const name = ($('[data-input="newbank"]').value || "").trim(), kind = "checking";
      if (!name) return toast("Enter a bank name.");
      if (S.banks.some((b) => b.name.toLowerCase() === name.toLowerCase())) return toast("A bank with this name already exists.");
      saveBanks(S.banks.concat([{ key: FE.makeKey(name, S.banks.map((b) => b.key)), name, kind, hidden: false }]), `Bank added: ${name}`);
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const name = el.dataset.action, fn = sheetActions[name] || A[name];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.input;
    if (k === "search") { S.search = e.target.value; $("#list").innerHTML = recordsBody(); }
    if (k === "hide") { S.hide = e.target.checked; ls.set("hide", S.hide ? "1" : "0"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
  $("#sheet").addEventListener("mousedown", (e) => { if (e.target.id === "sheet") closeSheet(); });
  $("#file").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try { openImport(FE.importAny(await file.text()), file.name); }
    catch (err) { toast(err.message || "Could not read the file", 5000); }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  globalThis.addEventListener("finans-sync", () => { const el = $("#sync-msg"); if (el && Store.state.sync) el.textContent = Store.state.sync.message; renderSideFoot(); });
  let wide = matchMedia("(min-width: 900px)").matches;
  addEventListener("resize", () => { const w = matchMedia("(min-width: 900px)").matches; if (w !== wide) { wide = w; render(); } });

  // Pick up changes made elsewhere (another tab, the CSV edited by hand) when this tab comes back.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !$("#sheet").hidden) return;
    try { const d = await Store.loadIfChanged(); if (d) { S.records = d.records; S.banks = d.banks; recompute(); render(); toast("Data updated"); } } catch { /* offline: keep current view */ }
  });

  async function boot() {
    closeSheet();
    $("#view").innerHTML = '<div class="loading">Loading…</div>';
    try {
      const d = await Store.load();
      S.records = d.records; S.banks = d.banks; recompute();
      render();
      if (d.rejected.length) toast(`${d.rejected.length} rows could not be read`, 5000);
    } catch (e) {
      $("#view").innerHTML = `<div class="error-screen"><h2>Could not load the demo</h2><p>${esc(e.message)}</p><button class="btn primary" data-action="reload">Try again</button></div>`;
    }
  }
  boot();
})();
