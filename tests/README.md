# Frontend regression checks

Run with Node.js:

```sh
node tests/frontend-regression.cjs
node tests/home-player-regression.cjs
node tests/quests-layout-regression.cjs
```

These tests use a fake clock, fake fetch responses and minimal DOM fixtures. They never contact IslePilot or execute live transactions. They cover stuck/overlapping reads, startup ordering, listener accumulation, hidden-page polling, blocked storage, map updates, garage card preservation, concurrent/cancelled garage actions, delayed countdown ticks, repeated trade expiry and double-click crate purchases.

The homepage checks verify shared account subscriptions, retained card nodes during stat/species updates, zero values, accessible progress values, temporary connection failures, logout transitions and the backend percentage helper without starting the server.

Quest layout checks cover category tabs/counts, real reward/progress values, locked states, claim-all, Prime Elder, empty events, escaped names and local assets. `node tests/render-quests-preview.cjs --browser` renders an offline fixture in Chrome at 1440px and 390px, checks horizontal overflow/runtime errors and writes screenshots. Its sample missions/rewards are preview-only, never added to production data.

`node tests/redesign-browser-audit.cjs` serves an offline copy with mock API responses and blocks non-GET API calls. It checks 15 enabled pages at 1440px and five key pages at 390px, reporting horizontal overflow, runtime exceptions, header icons/HUD and broken images. Casino remains disabled and is excluded. Screenshots and results are saved in tests. Real API transactions, login and live upstream latency are outside this audit. The admin page initially had a broken external default avatar; its static fallback was changed to the existing local ST25 favicon after the browser run.

`frontend-audit-results.json` records the local audit. Chrome headless tested all 16 ST25 pages at desktop width, plus the homepage, garage, map and trade pages at 375 and 820 pixels. Checks include runtime errors, broken images, horizontal overflow, stable HUD nodes/geometry, retained popovers, mobile navigation, zero balances/health, zero-coordinate markers, 144 clean grid labels and matching garage/restore borders.

Root causes addressed:

- HUD HTML and document listeners were recreated every refresh.
- Startup awaited three network requests before constructing navigation.
- Polling could overlap; expired trades could trigger a request every second.
- Full-page transition snapshots ran alongside content entrance animations.
- Mobile navigation and desktop hiding used inconsistent breakpoints.
- Map height assumed a fixed header, and a teleport callback called an undefined method.
- Garage data was rendered twice; active-data changes unnecessarily replaced storage cards.
- Garage countdowns counted timer ticks, and concurrent prepare/actions were not guarded.
- Blank avatar URLs and a full map image used as favicon added unnecessary loads.

The browser audit uses mock API data. It does not establish frame rate on a user's GPU/phone, hosting latency, or live IslePilot transaction success. The four IslePilot export snapshots receive static validation rather than live browser testing.

## 3D skin checks

API concurrency checks: `node tests/api-concurrency-regression.cjs` (also included in `npm test`). Offline fixtures cover twelve simultaneous upstream GETs becoming one request, failed-read release, independent response bodies, HTTP error preservation, timeout and recovery, fresh transaction reads, cache invalidation while an old request is in flight, changed upstream credentials, separate POSTs and double-click protection for carcass orders. `redesign-browser-audit.cjs` includes the casino page; its disabled-state check shares the statistics request instead of loading an extra script in the document head.

`node tests/skin-model-regression.cjs` validates all 17 procedural illustrations, geometry attributes, bounds, indices and triangle budgets. `ST25_3D_AUDIT=1 node tests/redesign-browser-audit.cjs` checks WebGL at five sizes, live palette changes, growth, patterns, keyboard controls, nonempty PNG output, idle/offscreen rendering, species resource disposal and context recovery on desktop. Set `ST25_3D_GUEST=1` for anonymous access; add `ST25_3D_FALLBACK=1` to explicitly disable WebGL and check the 2D fallback. See `SKIN_3D.md` for PowerShell commands. These use offline API fixtures and never execute real transactions.
