# CashFlow · Live demo

**Try it:** https://sguven.github.io/cashflow-demo/

A personal cash flow tracker and forecast. It learns from past credit card statements and
recurring income and payments, then projects the checking balance day by day and flags the
lowest point ahead of time.

This is the public demo of a private app I run on my own Mac and iPhone. It uses the same
forecast engine and interface. Every name and figure is **fictional**. The dates are generated
relative to today, so the forecast always looks current.

## What to try

- **Dashboard**: the 90-day projected balance, the lowest projected point and the dashed
  minimum-balance threshold. Hover over or touch the chart to see any day.
- **Cards**: statement history and the estimated bill (shown as `EST`) until a statement arrives,
  based on a 12- or 3-month average.
- **Income / Payments**: schedules that shift around weekends and US federal holidays
  ("adjusted from …").
- **Settings**: change the threshold, horizon or estimation method and watch the forecast update.

Edits are saved only in your browser (localStorage). Use **Settings › Restore sample data** to
start over.

## How it is built

Plain JavaScript modules, no framework and no build step:

| File | Role |
| --- | --- |
| `js/engine.js` | Forecast engine: recurrence rules, business-day and holiday adjustment, card bill estimation, projection |
| `js/views.js`, `js/ui.js` | Screens, dialogs and formatting |
| `js/charts.js` | SVG charts |
| `js/store.js` | Data model and persistence (browser storage in this demo) |
| `js/demo-data.js` | Fictional sample data |

The private version saves to a local file through a small Python server that listens only on
`127.0.0.1` and backs up to a repository it has confirmed is private. None of that is part of
this demo.

Built with Claude.
