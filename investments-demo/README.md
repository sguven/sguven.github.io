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
- **Show / Hidden**: hide every amount with one click.

Edits are saved only in your browser (localStorage). Use **Settings › Restore sample data** to start
over. Market prices are sample data here; the private version fetches live quotes.

## How it is built

Plain JavaScript, no framework and no build step:

| File | Role |
| --- | --- |
| `js/engine.js` | Calculation engine: periods, growth, trend model, plan generator, CSV/JSON import and export |
| `js/app.js` | Screens, dialogs and charts (Chart.js) |
| `js/store.js` | Data layer: browser storage and fictional sample data in this demo |
| `vendor/chart.umd.min.js` | Chart.js, bundled so the page makes no outside requests |

The private version saves to a CSV file through a small Python server that listens only on
`127.0.0.1` and commits each change to a local git repository; the iPhone app (SwiftUI) uses the same
file format. None of that is part of this demo.

Built with Claude.
