# sguven.github.io

**Live:** https://sguven.github.io

Project portfolio of Serhat Guven: fourteen projects built with AI, in five categories — Finance & Fintech, AI & Automation, Applications, Content & Publishing and Personal Projects. Three featured projects have full case studies.

| Path | What it is |
|---|---|
| `index.html` | The portfolio home page: hero, featured projects, all projects with a category filter, about and contact (images open in an in-page viewer; viewed projects are kept in the browser's local storage) |
| `projects/` | Case studies for the featured projects (`investment-portfolio/`, `cash-flow/`, `world-brief/`): problem, solution, architecture, technology, challenges, results |
| `assets/` | Shared styles (`site.css`, `case.css`) and script (`site.js`) |
| `img/` | Screenshots of real outputs; `img/thumbs/` holds the 16:10 card images, `img/cases/` the case-study screenshots. Finance app screenshots use illustrative figures |
| `archive/v2-gamified/` | Previous (gamified, six-field) version, kept for reference; also saved as branch `archive/v2-gamified` |
| `archive/v1-newspaper/` | Previous (newspaper-style) version of the portfolio, kept for reference; also saved as branch `archive/v1-newspaper` |
| `cashflow-demo/` | [Cash flow tracker live demo](https://sguven.github.io/cashflow-demo/): the private app's forecast engine and interface running in the browser with fictional data |
| `investments-demo/` | [Investment portfolio live demo](https://sguven.github.io/investments-demo/): the private net worth app's engine and interface running in the browser with fictional data |
| `workoutlog-demo/` | [WorkoutLog Pro live demo](https://sguven.github.io/workoutlog-demo/): the gym log running in the browser with sample workout history |
| `calorie-demo/` | [CalorieLog live demo](https://sguven.github.io/calorie-demo/): analyze a sample food photo or type a meal in plain English; results add up in a daily diary. Runs fully in the browser (sample-photo results prepared in advance, typed meals read by a built-in parser and food table) |
| `daily-claude/` | [Daily Claude Idea](https://sguven.github.io/daily-claude/): one Claude feature and one project a day. A scheduled Claude task adds each entry to `entries.json` |

Static site served by GitHub Pages from `main`; no build step.
