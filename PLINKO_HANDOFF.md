# ST25 Plinko - saved handoff

Saved on 2026-10-13 (Asia/Bangkok). User requested saving progress and waiting; do not continue development or deploy until a new instruction.

## Current live project
- Account: 3phutvuiii-del; team: st-25-vietnam-game.
- Project: st25-vietnam; ID: prj_QbUosCWm45ChvByPrUeNVcqdagns.
- Team ID: team_PnMP7fQKjarXyVz8AXMruNSJ.
- Live game: https://st25-vietnam.vercel.app/plinko.html
- Latest deployment: dpl_BgzHYCS5Vja7FzqhKPBoMdLDChjG (READY, sin1).
- PLINKO_ENABLED=true for Production. SESSION_SECRET, PUBLIC_ORIGIN, PLINKO_DATABASE_URL and ISLEPILOT_API_TOKEN already exist. Never print or commit their values.
- Most recent public check: ready=true, HTML 200, no demo option or demo-generation branch, unauthenticated prepare returns 401.
- Steam login redirects to Steam with callback on st25-vietnam.vercel.app. Full interactive sign-in by the player was not verified by this agent.

## Implemented game
- Wallet-only: each ball debits game Lua through server API; any payout credits the same wallet. Server computes outcomes, payouts and seed proofs.
- Manual rapid clicks accept up to 20 outstanding balls (queued requests plus animations). Each click creates a separate round; finished balls free capacity.
- Wallet requests execute serially while animations overlap; unique-game replay does not debit again. Pending/review transactions block further play.
- One shared animation loop, cached static board, trails/peg effects, motion toggle, reduced-motion handling, responsive layout, recent multipliers and active-ball counter.
- On wallet errors, cancel unissued queued balls and refresh state; no automatic retry. Switching account cancels queued work and discards old account animations.
- Frontend POST timeout 45 seconds. Bet range 1-500 Lua; auto batch maximum 20.

## Verification and real wallet evidence
- Browser fixtures passed at 1440, 768, 390, 320px; wallet-only option, 20 overlapping balls, 21st rejected, HMAC proof, serial wallet requests and queue cancellation on uncertain response. No live currency spent in these tests.
- Plinko service regression, project syntax, backend and authentication regression checks passed.
- Current browser results: .build-cache/plinko-browser/results.json; tests/plinko-browser.cjs.
- Earlier user-approved wallet diagnostic: debit 10 and refund 10, balance 9622 -> 9612 -> 9622. Artifact .build-cache/plinko-live-wallet-a5fceda4-fd14-41fc-8cc6-8b62d4e11ab8.json.
- Earlier approved actual Preview round: Steam ID 76561198682056372, stake 1, payout 0, balance 9622 -> 9621. Game e41c7215-7c20-4256-a7b5-2259a7a4eeac. Persisted history, replay without extra debit, valid proof. Artifact .build-cache/plinko-real-verification.json.
- User previously permitted a maximum of 10 Lua for tests. Do not assume unlimited further live testing. No additional real rounds were run after the one above.
- Temporary database Preview environment scope was restored to Production only and DB-enabled verification deployment deleted. Preserve database history and player balances.

## Main domain - still blocked
- https://www.st25.io.vn/plinko.html serves the old project. Last check its Plinko API ready=false.
- Current connected project only contains st25-vietnam.vercel.app. The current account cannot access the alias/project owning www.st25.io.vn (alias lookup 404; previous domain-add refused 403 domain_not_owned).
- User first required leaving old Vercel projects untouched. Later explicitly requested replacing the OLD PLINKO portion so players enter the new game from the main website. This authorizes that specific replacement, not deleting the whole old site/project or its data.
- Prepared migration plan: .build-cache/plinko-old-site-migration.json. Redirect only /plinko.html to https://st25-vietnam.vercel.app/plinko.html; merge matching legacy routes/redirects format only after inspecting its real config. This plan has NOT been applied to the old project.
- Pending user input: link to Vercel project that owns www.st25.io.vn, plus account access to that project. Do not create extra duplicate projects or buy domains to bypass this.

## Workspace and rollback history
- Workspace: E:/ST25 WEB/aaa.
- User requested rollback to before 3 hours; local tracked source restored to d2d3d8a9538419bf807d8c2acd68b57110cbf47c without resetting Git history. Git HEAD remained 3d0e9e7; working-tree differences include rollback of that commit.
- Backup: .build-cache/restore-before-20261013-0234/ (head-source.zip, working-changes.patch, untracked files, manifest and private local config backup).
- Subsequent work rebuilt only Plinko UI, multiball, wallet-only behavior and Plinko controller/service/store safeguards. Do not restore unrelated broad reliability changes without user instruction.
- Main touched files: assets/css/plinko.css, src/pages/plinko.html, src/features/plinko.js, src/controllers/plinko.js, src/services/plinko.js, src/models/plinko-store.js, tests/plinko-regression.cjs, tests/plinko-browser.cjs, .vercelignore.
- Local mutation journal must stay excluded from Vercel uploads; never publish auth/config backups or .build-cache.
- No new Git commit/push was performed by the agent for these latest changes.

## Tools for continuation
- Node: C:/Users/JSS/AppData/Local/OpenAI/Codex/runtimes/cua_node/cfb32733c877621e/bin/node.exe
- Git: C:/Users/JSS/AppData/Local/GitHubDesktop/app-3.6.6/resources/app/git/cmd/git.exe
- Vercel CLI: .build-cache/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/index.js
- CLI auth configuration directory: .build-cache/vercel-st25-auth (private; do not expose).
- Before any deployment validate .vercel/project.json matches expected project/team and inspect assigned domains. Do not change old projects implicitly.
- Current task status: paused by user, waiting for further development instructions.
