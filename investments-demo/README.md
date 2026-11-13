# Finance · Live demo

**Try it:** https://sguven.github.io/investments-demo/

A personal investment and net worth tracker. It brings every account into one view, shows how much
the total grew in each period, and projects where it is heading from its own history.

This is the public demo of a private app I run on my own Mac and iPhone. It uses the same
calculation engine and interface. Every name and figure is **fictional**, and the dates are generated
relative to today, so the dashboard always looks current.

## What to try

- **Overview**: total net worth, growth for the last period and the last 12 months, the net worth
  chart with a dashed forecast past today, and the allocation donut.
- **New entry**: every account on one screen with the previous values as hints; totals update as you
  type. Saving an entry refreshes the forecast.
- **Extend / shorten plan**: pick how far ahead to project, the expected return and the monthly
  contributions. The model fits a trend to past growth and compounds the brokerage return.
- **Accounts**, **Records**, **Analysis**: drill into one account, browse every entry by year, and
  see growth per entry and allocation over time.
- **Holdings**: the brokerage account opened up. Each fund with its share of the money and of the
  risk, a look through the funds by sector and company, a chart of share of money against share of
  risk, and four simple risk figures. Click a fund to see what is inside. **Estimate / Last file**
  switches between today's estimated values and the last positions file; **Update holdings** edits
  the funds and the weekly plan, or imports a broker's positions CSV.
- **Show / Hidden**: hide every amount with one click.

Edits are saved only in your browser (localStorage). Use **Settings › Restore sample data** to start
over. Market prices and fund price histories are generated sample data here, so the risk figures are
illustrative; the private version uses live prices and picks up new positions files from the
Downloads folder by itself.

## How it is built

Plain JavaScript, no framework and no build step:

| File | Role |
| --- | --- |
| `js/engine.js` | Calculation engine: periods, growth, trend model, plan generator, CSV/JSON import and export |
| `js/app.js` | Screens, dialogs and charts (Chart.js) |
| `js/funds.js` | What each fund holds (sector mix, largest companies) and the sector definitions |
| `js/risk.js` | Fund look-through and risk maths: volatility, share of risk, sensitivity to the S&P 500, estimate between positions files |
| `js/store.js` | Data layer: browser storage and fictional sample data in this demo |
| `vendor/chart.umd.min.js` | Chart.js, bundled so the page makes no outside requests |

The private version saves to a CSV file through a small Python server that listens only on
`127.0.0.1` and commits each change to a local git repository; the iPhone app (SwiftUI) uses the same
file format. None of that is part of this demo.

Built with Claude.
