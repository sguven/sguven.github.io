// Reference data for the Fidelity page: what each fund holds (sector mix, biggest companies) and
// which market series stands in for each sector when risk is calculated.
// Fund contents are public figures collected in November 2026 (see FUND_DATA_ASOF); they drift slowly,
// so refresh them a few times a year. Percentages don't have to add up to 100: they are normalized.
(function (root) {
  "use strict";

  const FUND_DATA_ASOF = "2026-11-13";

  // Risk buckets: the 11 stock sectors plus the non-stock assets. `proxy` is the Yahoo symbol whose
  // price history represents the bucket; `vol` is the fallback yearly volatility when prices can't be loaded.
  const BUCKETS = [
    { id: "tech", name: "Technology", color: "#6a5acd", proxy: "XLK", vol: 0.26, group: "eq" },
    { id: "fin", name: "Financials", color: "#2f7cf6", proxy: "XLF", vol: 0.20, group: "eq" },
    { id: "comm", name: "Communication", color: "#13b5c4", proxy: "XLC", vol: 0.21, group: "eq" },
    { id: "disc", name: "Consumer discretionary", color: "#e84393", proxy: "XLY", vol: 0.23, group: "eq" },
    { id: "health", name: "Health care", color: "#20c997", proxy: "XLV", vol: 0.16, group: "eq" },
    { id: "ind", name: "Industrials", color: "#8e8e93", proxy: "XLI", vol: 0.19, group: "eq" },
    { id: "staples", name: "Consumer staples", color: "#a0522d", proxy: "XLP", vol: 0.14, group: "eq" },
    { id: "energy", name: "Energy", color: "#e0383e", proxy: "XLE", vol: 0.26, group: "eq" },
    { id: "mat", name: "Materials", color: "#9b59d0", proxy: "XLB", vol: 0.21, group: "eq" },
    { id: "util", name: "Utilities", color: "#17a2b8", proxy: "XLU", vol: 0.17, group: "eq" },
    { id: "re", name: "Real estate", color: "#b08d57", proxy: "XLRE", vol: 0.20, group: "eq" },
    { id: "gold", name: "Gold", color: "#f4c20d", proxy: "IAU", vol: 0.16, group: "metal" },
    { id: "silver", name: "Silver", color: "#b8c0cc", proxy: "SLV", vol: 0.30, group: "metal" },
    { id: "btc", name: "Bitcoin", color: "#f08c1e", proxy: "BTC-USD", vol: 0.55, group: "btc" },
    { id: "mf", name: "Managed futures", color: "#5c6bc0", proxy: "DBMF", vol: 0.12, group: "mf" },
    { id: "bond", name: "Bonds", color: "#78909c", proxy: "AGG", vol: 0.06, group: "bond" },
    { id: "other", name: "Other (fund not described)", color: "#bdbdbd", proxy: "^GSPC", vol: 0.20, group: "eq" },
    { id: "cash", name: "Cash", color: "#18a058", proxy: null, vol: 0, group: "cash" },
  ];
  // Fallback correlations between bucket groups (same-group pairs first).
  const GROUP_CORR = {
    "eq|eq": 0.65, "metal|metal": 0.75, "eq|metal": 0.15, "btc|eq": 0.35, "btc|metal": 0.10,
    "eq|mf": 0.05, "metal|mf": 0.15, "btc|mf": 0.05, "bond|eq": 0.15, "bond|metal": 0.20, "bond|btc": 0.05, "bond|mf": -0.10,
  };

  // Asset classes for the donut.
  const CLASSES = [
    { id: "us", name: "US stocks", color: "#2f7cf6" },
    { id: "intl", name: "Non-US stocks", color: "#13b5c4" },
    { id: "metal", name: "Gold and silver", color: "#f4c20d" },
    { id: "btc", name: "Bitcoin", color: "#f08c1e" },
    { id: "alt", name: "Other", color: "#8e8e93" },
    { id: "cash", name: "Cash", color: "#18a058" },
  ];

  const EQ_BLEND = { tech: 30, fin: 17, comm: 8, disc: 9, health: 8, ind: 10, staples: 5, energy: 4, mat: 4, util: 2.5, re: 2 };

  // `sectors`: bucket id → percent. `top`: biggest companies inside the fund [name, percent of the fund].
  const FUNDS = {
    FXAIX: { name: "Fidelity 500 Index", cls: "us", what: "The 500 largest US companies (S&P 500). The US core of the portfolio.", fee: 0.015,
      sectors: { tech: 37.4, fin: 12.2, comm: 9.9, disc: 9.6, health: 9.1, ind: 8.2, staples: 4.6, energy: 3.4, util: 2.1, re: 1.9, mat: 1.6 },
      top: [["Nvidia", 8.08], ["Apple", 7.03], ["Microsoft", 5.69], ["Alphabet (Google)", 5.41], ["Amazon", 3.84], ["Broadcom", 2.65], ["Meta", 1.90], ["Micron", 1.63], ["Tesla", 1.57]] },
    FZILX: { name: "Fidelity ZERO International Index", cls: "intl", what: "About 2,200 large and mid-size companies outside the US (developed and emerging markets). Zero expense ratio.", fee: 0,
      sectors: { fin: 25.1, tech: 20.2, ind: 13.7, disc: 8.2, mat: 6.7, health: 6.7, energy: 4.9, staples: 4.8, comm: 4.7, util: 2.9, re: 1.7 },
      top: [["TSMC", 4.30], ["Samsung Electronics", 1.93], ["ASML", 1.44], ["SK hynix", 1.25], ["Tencent", 0.95], ["HSBC", 0.81], ["Alibaba", 0.81]] },
    FPADX: { name: "Fidelity Emerging Markets Index", cls: "intl", what: "Emerging markets (Taiwan, China, India, Korea). Chip makers weigh heavily.", fee: 0.075,
      sectors: { tech: 40.5, fin: 20, disc: 8.8, comm: 6.7, ind: 6.1, mat: 5.8, energy: 3.6, health: 2.8, staples: 2.7, util: 1.9, re: 1.0 },
      top: [["TSMC", 14.2], ["Samsung Electronics", 6.0], ["SK hynix", 4.1], ["Tencent", 3.2], ["Alibaba", 2.4], ["Delta Electronics", 1.1], ["MediaTek", 1.1], ["China Construction Bank", 0.9], ["HDFC Bank", 0.8]] },
    VOOG: { name: "Vanguard S&P 500 Growth ETF", cls: "us", what: "The growth stocks of the S&P 500. Half of it is technology; it overlaps heavily with FXAIX.", fee: 0.07, approx: true,
      sectors: { tech: 51, comm: 14, disc: 10, fin: 9, ind: 7, health: 5, staples: 2, re: 0.8, energy: 0.5, mat: 0.4, util: 0.3 },
      top: [["Nvidia", 14.6], ["Microsoft", 9.5], ["Apple", 6.6], ["Alphabet (Google)", 5.7], ["Broadcom", 5.1]] },
    FBGRX: { name: "Fidelity Blue Chip Growth", cls: "us", what: "Actively managed large-cap growth fund, heavy in Nvidia and big technology. High expense ratio.", fee: 0.72,
      sectors: { tech: 50.85, comm: 14.65, disc: 13.6, health: 5.82, ind: 4.89, fin: 2.23, staples: 0.99, re: 0.68, energy: 0.21, mat: 0.12, util: 0.05 },
      top: [["Nvidia", 14.73], ["Apple", 9.28], ["Alphabet (Google)", 9.25], ["Amazon", 5.81], ["Microsoft", 4.99], ["Broadcom", 4.37], ["Eli Lilly", 2.69], ["Meta", 2.30], ["Micron", 1.95], ["Western Digital", 1.62]] },
    FNCMX: { name: "Fidelity Nasdaq Composite Index", cls: "us", what: "About 3,000 Nasdaq-listed companies. More than half is technology.", fee: 0.29,
      sectors: { tech: 54.18, comm: 13.61, disc: 12.0, health: 5.36, ind: 5.0, staples: 4.17, fin: 3.02, mat: 0.83, util: 0.75, re: 0.55, energy: 0.52 },
      top: [["Nvidia", 11.20], ["Apple", 10.15], ["Microsoft", 7.59], ["Amazon", 5.84], ["Alphabet (Google)", 4.72]] },
    FITLX: { name: "Fidelity U.S. Sustainability Index", cls: "us", what: "Large US companies with high ESG ratings. Very close to the S&P 500.", fee: 0.11,
      sectors: { tech: 39.19, comm: 12.31, health: 10.58, fin: 10.51, disc: 8.07, ind: 7.72, staples: 5.09, energy: 1.97, re: 1.93, mat: 1.81, util: 0.83 },
      top: [["Nvidia", 13.54], ["Alphabet (Google)", 10.89], ["Microsoft", 7.71], ["Tesla", 3.47]] },
    AVUV: { name: "Avantis U.S. Small Cap Value ETF", cls: "us", what: "Cheap, profitable small US companies. Balances the technology weight; about 800 stocks, none above 1%.", fee: 0.25,
      sectors: { fin: 26.06, disc: 18.67, energy: 15.83, ind: 13.61, tech: 7.42, mat: 5.1, health: 4.75, staples: 4.68, comm: 3.11, re: 0.68, util: 0.09 },
      top: [] },
    LIT: { name: "Global X Lithium & Battery Tech ETF", cls: "intl", what: "Lithium miners and battery makers (thematic). Volatile; mostly China, Korea and Japan.", fee: 0.75,
      sectors: { mat: 53.9, ind: 21.5, tech: 11.06, disc: 7.36 },
      top: [["Rio Tinto", 22.76], ["Samsung SDI", 6.76], ["Panasonic", 6.76], ["TDK", 6.0], ["NAURA Technology", 5.83]] },
    DBMF: { name: "iMGP DBi Managed Futures ETF", cls: "alt", what: "Trend-following futures strategy. Moves independently of stocks; held for diversification.", fee: 0.85,
      sectors: { mf: 100 }, top: [] },
    IAU: { name: "iShares Gold Trust", cls: "metal", what: "Physical gold.", fee: 0.25, sectors: { gold: 100 }, top: [] },
    GLDM: { name: "SPDR Gold MiniShares", cls: "metal", what: "Physical gold (low cost).", fee: 0.10, sectors: { gold: 100 }, top: [] },
    SIVR: { name: "abrdn Physical Silver Shares", cls: "metal", what: "Physical silver.", fee: 0.30, sectors: { silver: 100 }, top: [] },
    SLV: { name: "iShares Silver Trust", cls: "metal", what: "Physical silver.", fee: 0.50, sectors: { silver: 100 }, top: [] },
    FBTC: { name: "Fidelity Wise Origin Bitcoin Fund", cls: "btc", what: "Spot Bitcoin. The most volatile part of the portfolio.", fee: 0.25, sectors: { btc: 100 }, top: [] },
    FFFFX: { name: "Fidelity Freedom 2040", cls: "us", what: "Target-date blend (mostly stocks, some bonds).", fee: 0.75, approx: true,
      sectors: { ...scale(EQ_BLEND, 0.9), bond: 10 }, top: [] },
    SPRXX: { name: "Fidelity Money Market Fund", cls: "cash", cash: true, what: "Money market fund. The cash the weekly buys are drawn from.", fee: 0.42, sectors: { cash: 100 }, top: [] },
    SPAXX: { name: "Fidelity Government Money Market", cls: "cash", cash: true, what: "The account's core cash.", fee: 0.42, sectors: { cash: 100 }, top: [] },
    FDRXX: { name: "Fidelity Government Cash Reserves", cls: "cash", cash: true, what: "The account's core cash.", fee: 0.34, sectors: { cash: 100 }, top: [] },
    CASH: { name: "Cash", cls: "cash", cash: true, what: "Uninvested cash.", fee: 0, sectors: { cash: 100 }, top: [] },
  };

  function scale(obj, k) { const o = {}; for (const key of Object.keys(obj)) o[key] = obj[key] * k; return o; }

  /** Fund info for a symbol; unknown symbols get a neutral placeholder so the page still works. */
  function fundOf(symbol) {
    return FUNDS[symbol] || { name: symbol, cls: "alt", unknown: true, what: "This fund's contents are not described yet; its own price history is used for risk.", fee: null, sectors: { other: 100 }, top: [] };
  }

  root.FD = { FUND_DATA_ASOF, BUCKETS, GROUP_CORR, CLASSES, FUNDS, fundOf };
})(globalThis);
