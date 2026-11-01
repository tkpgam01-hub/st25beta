# Expanded public-code collection

Date: 2026-10-12, Asia/Bangkok.

## New primary code source

https://codepen.io/mjchal/pen/vYpaxOK

The public Pen is titled for Clash.gg, RustClash and DotaClash. Its HTML, CSS and JS panels were readable through web page extraction. Local files are transcriptions with whitespace/formatting normalized, NOT raw downloaded bytes. The live Clash.gg fairness tab remains inaccessible, so the Pen's current embedding and production equivalence have not been verified.

Public Pens are MIT licensed under CodePen's licensing policy. Attribution and license are retained. External dependencies were not downloaded or executed.

The verifier imports seedrandom 3.0.5 from esm.sh and calls CryptoJS.SHA256. The latter's exact version was not visible in the extracted panels. It checks the hash of the trimmed server seed. For every row, numbered from 1, it seeds a fresh generator with server seed, client seed and row separated by colons. Values below 0.5 go left; other values go right. The tile is one plus the number of right turns. The selector offers 8 through 16 rows; this does not prove those row counts are all currently available in production.

## Code observations

- The visible snippet has no bet nonce, risk input or payout calculation. Server-seed lifecycle and uniqueness must be established separately.
- The seed is trimmed for the commitment check but not for the RNG input. Whitespace can therefore change the path while the trimmed commitment still validates.
- Missing inputs call an error function not defined in the extracted JS panel.
- The result element is accessed through the implicit global named result.
- SHA-256 and seedrandom are separate roles: commitment versus path generation.
- No wallet logic, bet endpoint, WebSocket event, payout table or physical animation engine is present.

## Other searches and sources

https://github.com/davidbau/seedrandom is the primary upstream RNG repository. It is a dependency source, not Clash.gg game code. The exact 3.0.5 code was not downloaded; no other library version has been substituted.

GitHub searches for Clash.gg Plinko did not return a corroborated production source repository. Marketing/review repositories and unrelated Plinko games were excluded.

https://checkmypull.com/verify/clashgg discusses case-opening and battle validators. It was used as a discovery lead only; its case algorithms are not evidence for Plinko.

https://clash.gg/ru/rules describes slot-based Plinko payouts but supplies no executable algorithm. https://rustclash.com/fairness?tab=plinko and the raw CodePen JS URL could not be fetched through the web tool.

## Conditional probability model

If the verifier's row outputs behave as independent unbiased 50/50 draws, the tile distribution is binomial: P(tile=k+1)=choose(rows,k)/2^rows. This is a mathematical model of the observed verifier rule, not a measurement or proof of the production RNG/seed distribution.

For 16 rows each extreme slot is 1/65536, approximately 0.001526%; both extremes together are approximately 0.003052%. The center slot is 12870/65536, approximately 19.6381%. No 10,000x slot has been mapped to these positions. Without the actual risk-mode payout tables, RTP cannot be recomputed.

The collection is broader but remains incomplete: production JS bundles, endpoint schemas, payoff arrays, seed lifecycle, historical test vectors and backend source remain unavailable.
