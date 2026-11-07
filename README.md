# Storm Money — Chain Edition (live web client)

A real browser client for the deployed `storm-economy` Soroban contract.
(A read-only Bitcoin-vault comparison card used to live on this page; it
was removed per the product owner's request — see "Chain Edition
repositioning" below. No Bitcoin-related UI remains.) **Not a Claude
Artifact** — Artifacts run inside a CSP sandbox that blocks all
cross-origin `fetch()`/XHR except to the artifact's own published
files, which silently breaks Stellar RPC/Friendbot calls. This has to
be opened as a real local page in your own browser.

## Open it

```bash
cd web
python3 -m http.server 8743
# then open http://localhost:8743/ in Chrome/Safari/Firefox
```

Click through the opening beats: create your identity (a disposable
testnet keypair, shown on screen — deliberately visible, not hidden, so
nothing about how a wallet works is hidden from you) → get funded via
Friendbot → enter the game → play rounds against the real contract.
Every action logs a link to Stellar Expert for the actual transaction.

## Design

Redesigned by a UI Designer agent, then critiqued by a UI Finish-Gate
Reviewer agent, both scoped to CSS/markup only — the `<script
type="module">` block's logic (the whole proven contract-call sequence
below) was off-limits to both and verified untouched after each pass.

Visual identity: a "terminal/ledger" register distinct from the kids'
game's palette on purpose — near-black ground, a terminal-green signal
color reserved only for live/interactive elements (never ambient
decoration), JetBrains Mono for labels/data/buttons, Public Sans for
prose. The Stellar card (solid border, glow, pulsing dot, "live ·
testnet") was deliberately built to read as live/do-something at a
glance, without needing to read the copy — a now-removed Bitcoin card
used the inverse treatment (dashed border, static dot) as its contrast
case; that card is gone, the contrast point is noted here for history
only. The reviewer fixed a real WCAG contrast failure (`--fg-faint`
at 2.96:1 against its worst-case surface, now ~5.1:1) that hit about
eight components, plus a half-wired numbered-step affordance.

Both agent passes were re-verified independently afterward — not taken
on their own word — with the same live click-driven browser test used
throughout this project: generate → fund → join (→ roll → action for
the designer's pass). All real, all passed, zero regressions.

## Gamification layer (added by explicit user override)

This page's "never ambient decoration" rule (above) was deliberately
overridden for a gamification pass, at the user's explicit request after
being warned of the conflict — see the annotation in the repo's
`BRAND.md`. A Game Designer agent added a progression/achievement layer
on top of the existing real-blockchain mechanics, under one hard
constraint: every "achievement unlocked" moment has to trace back to an
actual confirmed on-chain event, never a client-side fake. Nothing below
invents a reward the contract didn't actually produce.

What was added, all in `index.html`, none of it touching the `<script
type="module">` block's call-building/signing/sending/unwrapping logic
(verified: `call()`, `makeClient()`, the `tx.result.value` /
`sent.result.value.tag` unwrapping, and the `Action` enum encoding are
byte-identical to before):

- **An achievement shelf** (`#achvShelf`, inside `gamePanel`) showing 9
  badges that light up as the real contract state crosses them: joining,
  hitting the "Free" milestone (`free_round` going from 0 to nonzero —
  the same named moment `BRAND.md` requires every surface to celebrate),
  surviving a real `Storm` roll, buying insurance, opening the first
  Business-tier asset, three round milestones (5/10/15 of 20), and
  completing all 20 rounds without bankruptcy.
- **Toast notifications** (`#achvToasts`, fixed bottom-right) that fire
  only after the triggering transaction has already confirmed — the new
  `Progression` module's `sync()` is called from `refreshState()` right
  after a real `get_state()` resolves, and `noteRoll()` is called from
  `handleAction()` right after a real `roll_and_pay()` resolves, reading
  the same already-unwrapped `EventRoll` tag the tx log line already
  uses. Achievements persist per public key in `localStorage` (a fresh
  disposable wallet gets a fresh shelf, matching the "new keypair = new
  game" model) and are a convenience cache of what the chain already
  said, not a second source of truth.
- **A Storm flash** on the Stellar card itself, firing on *every* real
  `Storm` roll (not just the first) with a distinct color depending on
  whether the roll cost an asset — this is the `BRAND.md` storm-event
  rule taken literally: "unmistakable the instant it happens... never
  just another line in a feed."
- **A floating cash delta** (`+3` / `-12`) on the Cash tile after a
  confirmed action changes the balance, so the real round-trip latency
  of a signed Stellar transaction reads as "the chain just told you what
  happened" instead of an instant, un-felt number swap.
- **An honest game-over toast** for both outcomes — a completed run and a
  bankruptcy — using the same non-softened language the kids' prototype
  uses for a bankrupt player ("ranked last... a loss doesn't get
  softened here either"). Bankruptcy is never styled as an achievement.
- **New `ChainSFX` sounds** (`achievement`, `storm`, `complete`,
  `bankrupt`), added to the existing `SOUNDS` table without touching any
  of the four sounds already there or the `play()`/`isMuted()`/
  `toggleMute()` public API.

All new CSS reuses the page's existing, already-contrast-checked color
tokens (`--fg`, `--fg-dim`, `--fg-faint`, `--accent`, `--danger` against
`--bg-elev-2`/`--bg-elev-3`) rather than inventing new ones — recomputed
against the actual hex values, the lowest of these pairings
(`--fg-faint` on `--bg-elev-3`) is 4.66:1, still above the 4.5:1 WCAG AA
floor for normal text. All new animations respect `prefers-reduced-
motion: reduce`, matching the existing `.dot--live` pulse's own guard.

**Independently re-verified live, separately from the agent that built
it.** Static checks first: grepped every "sacred" line
(`makeClient`/`call()`/`tx.result.value`/`sent.result.value.tag`/the
`Action` enum literals) against the pre-change file — byte-identical;
confirmed all 11 required element IDs present once each; `node --check`
on the extracted script block passed.

Then three live runs via `rea`'s `capture_browser_scenario`
(headless Chrome, real testnet, real signed transactions, no mocks):

- Run 1 (join only): real `Joined` tx logged with a real Stellar Expert
  link; "On The Ledger" badge rendered `achv-badge--unlocked`; its toast
  fired in `#achvToasts`. Zero console/page errors beyond the known
  harmless favicon 404.
- Run 2 (join → roll → hustle, 8s waits): roll correctly rendered all
  six action buttons (a non-Storm roll); cash briefly read `1` instead
  of the expected `4` after the hustle tx — looked like a real bug at
  first. It wasn't: a third run with longer waits (10s/20s) on a fresh
  wallet showed the identical sequence (join → `Storm` roll, no asset to
  lose → hustle) land at **Cash 16**, matching 10 + 8 salary − 5 expense
  + 3 hustle exactly, and the "Storm Survived" badge correctly unlocked.
  Root cause: testnet RPC round-trip latency on that particular call
  exceeded an 8-second wait in the *test script*, not a bug in the page
  — the same class of flake already on record above ("Friendbot timeout
  misread as regression").

Net result: achievement shelf, toasts, Storm flash hook, and real-tx
cash sync all confirmed working against the live contract, round 1 only
(join/roll/one action). Not re-covered by this pass: rounds 2–20, the
loan/repay/insurance buttons, bankruptcy, and game-over — same gap the
agent itself flagged, still open.

## Verification status

**Fully verified: real browser, real clicks, real contract, three bugs
found and fixed along the way. Full honest trace below.**

A browser-automation tool (`rea`'s `capture_browser_scenario`) was used
to click-test this page end to end, and it earned its keep three times:

1. **`makeClient()` wasn't awaited.** `StellarSdk.contract.Client.from()`
   is async; calling it without `await` left `client` as a pending
   Promise, so every method call failed with `client[methodName] is not
   a function`. Fixed: `makeClient` is `async`, awaited at its call site.
2. **The tool itself hung twice** at a hard 1800s timeout after that
   fix, traced to an orphaned headless Chrome process
   (`--remote-debugging-pipe`) from the first run that never cleaned up
   and blocked the next launch. Killed it; the *contract-call logic*
   was re-verified in the meantime via a throwaway Node.js script
   (`@stellar/stellar-sdk@17.4.0` from npm) running this page's exact
   call sequence against the real contract — join/roll/action all
   succeeded, confirming the `await` fix was right and that
   `{tag: "SideHustle", values: undefined}` is the correct `Action`
   enum encoding.
3. **`get_state`'s return value wasn't unwrapped.** It returns
   `Result<Player, Error>`, which the JS SDK represents as `{value:
   Player}` on success — not the raw struct. `refreshState()` read
   `tx.result` directly, so every field came back `undefined`, which
   made `state.awaiting_roll` falsy regardless of the real contract
   state, which made `renderActions()` render the wrong buttons in the
   wrong positions. This one only surfaced once the browser tool was
   working again: a scripted click on "the Roll button" actually hit
   "Take loan," because the UI had silently drawn the wrong screen.
   Fixed: `tx.result.value`. Same bug existed in the roll-result log
   line (`sent.result.value.tag`, not `sent.result`).

With all three fixed, a full click-driven run succeeded cleanly: real
testnet wallet generated on-screen → funded via a real Friendbot click
→ joined via a real signed transaction → rolled (`Storm`, real tx) →
took a real `Side Hustle` action (real tx) → UI correctly showed Round
1/20, Cash 16 — matching the math exactly (10 start + 8 salary − 5
expense = 13, then +3 hustle = 16) — and the right six buttons
(Stall/Business/Hustle/Loan/Repay/Insure) for the resulting state. No
console errors beyond a harmless missing favicon.

The one thing explicitly *not* covered: a full 20-round game, or every
branch (bankruptcy, the free-action buttons, game-over). What's proven
is the mechanism — real wallet, real contract, real state sync, correct
button targeting — not exhaustive coverage of every path through it.

## Chain Edition repositioning — 2026-11-03

Implemented by a Game Designer agent from `BRAND.md` section 5
("Chain Edition repositioning — 2026-11-03"), which is the spec for
this pass — read it there for the full rationale. Summary: Chain
Edition stops framing itself as "not the kids' game... for this
audience" (exclusionary, gatekept on technical sophistication) and
becomes a universal, aspirational "Stellar-backed gaming experience
that teaches financial literacy and freedom" — real blockchain
mechanics as the feature that makes the lessons real, not a filter that
excludes non-crypto-curious players. Scope: `index.html` and this
README only; `backend/` and its leaderboard fetch/render
logic were not touched.

**Hero copy** (new tagline, replacing the old "not the kids' game, for
this audience" framing):

> Storm Money, made real. Same lessons in passive income, risk, and the
> freedom of being Free — now running on a live blockchain, one real
> signed transaction at a time.

Wordmark (`⚡STORM MONEY`) and H1 (`Chain Edition`) are unchanged per
spec. A new sub-line was added above the setup steps: "No wallet
experience required — you'll generate a real one in the next step."

**Onboarding redesign.** The old `#setupPanel` was three CLI-style
numbered steps ("1. Generate a testnet wallet", raw secret key in a
mono box, "2. Fund via Friendbot", "3. Join the game") — the first
thing a visitor saw after the header, reading as dev-tool setup rather
than a game opening. It's now framed as the game's actual opening
beats — **Create your identity → Get funded → Enter the game** — under
a "YOUR RUN STARTS HERE" kicker, and each step's number circle fills
solid accent-green with a `step--done` class the instant its real
action actually completes (keypair generated / Friendbot funded /
`join()` confirmed), reusing the same achievement-shelf visual language
already built for the live game panel below it. This is pure UI-state
sugar added to the existing click handlers (`btnGenerate`/`btnFund`/
`btnJoin`) — the underlying mechanism is byte-identical: it still
really generates a testnet `Ed25519` keypair client-side, still really
calls Friendbot, still really submits `join()` and waits for
confirmation before revealing `#gamePanel`. The secret-key reveal
itself is unchanged in substance (still shown, still a real transparency
feature per `BRAND.md`) — it's just no longer the visual centerpiece of
the first screen now that the steps above it carry the opening-beat
framing.

**Five copy/cleanup fixes applied**, all per `BRAND.md` §5:

1. `key-warning` text: dropped "for this audience," now explains *why*
   the key is shown — `"testnet only — we show this key on purpose, so
   you can see nothing is hidden; never do this with real funds on
   mainnet"`.
2. Step-1 hint: kept the precise term, added a plain-language gloss —
   `"...a disposable Ed25519 keypair (the one-time login key this game
   uses to sign for you) in your browser..."`.
3. Leaderboard card's dev-internal detail ("a contract gap, not an
   indexer bug — see `backend/README.md`") moved out of
   the main paragraph into a `<details>`/`<summary>` ("why?") so a
   first-time player isn't made to parse internal bug taxonomy; the
   visible sentence is now just "Loan/repay/insure actions don't appear
   here yet." The leaderboard's actual fetch/render logic
   (`refreshLeaderboard`/`renderLeaderboard`/`renderLbStats`) was not
   touched.
4. The audio-section code comment (previously: "This audience is
   crypto-curious/dev, so the sound language is deliberately
   different...") was reworded to justify the sound design on its own
   terms — distinct tones for distinct real event types — with no
   audience-gatekeeping framing left for a future editor to copy.
5. The stale `/* ---------- bitcoin / archive card ---------- */` CSS
   comment and its now-dead rules (`.card--archive`, `.exhibit`,
   `.exhibit-label`, `.mono-block`, `.closing-note`) were deleted —
   confirmed zero remaining references anywhere in the file (HTML and
   script block) before deleting. `.dot--archive` and `.pill--archive`
   were explicitly left alone per the implementer brief — `.dot--archive`
   is live-referenced from the leaderboard's offline-state branch in the
   script block (`dot.className = "dot dot--archive"`); `.pill--archive`
   was left in place alongside it on the same instruction even though
   this pass's own grep found no current reference to it.

**Hard constraints respected.** The `<script type="module">` block's
contract-call logic (`makeClient()`, `call()`, the `tx.result.value` /
`sent.result.value.tag` unwrapping, the `Action` enum encoding) was not
touched — confirmed by grepping those exact lines before and after this
pass; they're unchanged. Every achievement/toast/progression mechanic
still traces to a real confirmed on-chain event; nothing new was added
to that layer in this pass beyond the `step--done` completion class,
which is driven by the same real success branches the buttons already
had (Friendbot 200 response, confirmed `join()`).

### Live verification

Server: `python3 -m http.server 8743` in this directory (already
running at the time of this pass). Tool: `rea`'s
`capture_browser_scenario` against headless Chrome, real Stellar
testnet, no mocks.

**Run 1** — fresh load, click Create your identity → Get funded → Enter
the game with fixed waits (0.8s/0.5s/4s/6s). All 8 steps completed, zero
console/page errors beyond the known harmless `favicon.ico` 404. Real
network calls observed: `GET friendbot.stellar.org/?addr=GBBP6MHC...`
→ `200`; three `POST soroban-testnet.stellar.org/` calls, two completed
`200` within the capture window, the third (the join submission) was
still in flight when the 6s wait ended — not a failure, just testnet
round-trip latency exceeding the test script's wait, the same class of
flake already on record above in this README's roll/hustle verification.

**Run 2** — same flow, this time waiting on real DOM state instead of
fixed timers (`wait_for` on `#btnJoin:not([disabled])`, then on
`#gamePanel:not([hidden])`, 30s/40s ceilings). Every step completed:
Friendbot funded a fresh keypair in ~14.5s, the join transaction
confirmed in ~21s. Final DOM showed:
- `#setupPanel` now `style="display: none;"`, `#gamePanel` visible.
- Hero tagline, "YOUR RUN STARTS HERE" kicker, and the sub-line all
  present verbatim as specified above.
- All three `.step` elements carrying `step--done` (identity created,
  funded, joined).
- Tx log: `Joined —` linking to
  `https://stellar.expert/explorer/testnet/tx/66b824f31cab822ea8edcf780c5501312cc310d6414303e1a20cce6c7fbdf345`
  (real 64-hex-char Stellar tx hash).
- Achievement shelf: `On The Ledger` rendered `achv-badge--unlocked`,
  with a live toast ("ACHIEVEMENT UNLOCKED — On The Ledger… Joined the
  live contract — your first real signed transaction this run.") still
  visible in the end-of-run screenshot.
- Status grid: Round 1/20, Cash 10 — correct post-join state.

A first-paint screenshot (before any clicks) was also captured and
confirms the redesigned onboarding visually: the three opening-beat
steps render with step 1 active/primary and steps 2–3 dimmed via the
existing `:has(button:disabled)` rule, under the new kicker and
sub-line, above the still-present (collapsed) leaderboard "why?"
detail. The page reads as one continuous game opening rather than a
CLI checklist followed by a game.

Not re-covered by this pass: a full 20-round run, the loan/repay/
insurance action buttons, bankruptcy, and game-over states — same
pre-existing gap already on record above; this pass only needed to
verify the onboarding redesign and copy changes, and did.

## Visual redesign pass — 2026-11-04

The repositioning pass above fixed copy and tone but left the page
visually unchanged: numbered steps in plain boxes, a wordmark+h1+
paragraph header with no hero moment, and plain stat tiles — a
"friendlier config screen," not the opening of a game. The product
owner asked for a deliberately bolder visual pass ("make the frontend
10x better"), with real creative license, while keeping the brand
register (near-black ground, terminal green reserved for live/
interactive elements, JetBrains Mono for labels/data, Public Sans for
prose) intact. Scope: CSS and markup only, plus small additive JS where
a visual idea needed a new trigger — the proven contract-call logic
stayed off-limits throughout, same as every prior pass.

**What changed:**

1. **A real title-screen hero**, replacing the wordmark+h1+paragraph
   stack. The whole header is now a HUD-framed panel: four accent
   corner brackets, a faint receding grid backdrop (perspective-
   transformed CSS grid, masked to fade out), and a huge, low-opacity
   lightning-bolt watermark — all decorative, but anchored to the one
   element (`.bolt`) that already carried `--accent` before this pass,
   not a new use of the color. The wordmark's bolt now has a subtle
   flicker animation and a glow (`text-shadow`), H1 jumped from
   `clamp(1.6rem, 5vw, 2.1rem)` to `clamp(2.15rem, 8vw, 3.4rem)`, and
   three fact pills ("live · stellar testnet", "20 rounds / run",
   "every action a real signed tx") sit under the tagline for instant
   scannable credibility. The hero's five elements stagger-fade in on
   first paint (`.hero-anim`, 620ms rise, staggered 40–340ms), fully
   disabled under `prefers-reduced-motion: reduce`. **Tagline text is
   byte-identical** to the repositioning pass's copy — only its
   presentation changed, per the brief's requirement to preserve it.
2. **Onboarding steps restyled as mission cards, not a numbered list.**
   Each step now shows a `STEP N · <mechanism>` tag (keypair / friendbot
   / join()) and a live status chip (`locked` / `ready` / `done`)
   computed entirely in CSS from state the *existing* click handlers
   already set — no new JS. The step-index circle is bigger, flips to a
   checkmark on completion, and the connecting rail between steps fills
   with an accent gradient once a step is done (`.step.step--done:not
   (:last-child)::after`). A horizontal progress rail above the steps
   fills 34%/67%/100% using `.card:has(#setupPanel .step:nth-child(N)
   .step--done)` — a pure-CSS "step N of 3" indicator that reads real
   DOM state, not a parallel counter that could drift from it.
3. **Status grid and leaderboard stats got glyphs, bigger type, and
   richer bars**, all CSS-only against the *existing* markup those two
   off-limits render functions (`refreshState()`'s tile template,
   `renderLbStats()`) already produce — matched by tile position
   (`#statusGrid .tile:nth-child(N)`), not by touching the functions
   themselves. Round and Cash lead visually (1.55rem vs 1.3rem for the
   rest, matching what a player actually tracks round to round). The
   round progress bar got a gradient fill and a slower, eased
   transition. No new data, no invented numbers — same real `get_state()`
   response, read differently.
4. **Achievement shelf gained a progress bar and per-achievement icons.**
   This required one real code edit, inside the `Progression` IIFE added
   by the prior gamification pass — not inside the sacred list
   (`makeClient`/`call`/the `tx.result.value` unwrap/the `Action` enum/
   the leaderboard's three functions), so it was in scope. `DEFS` gained
   an `icon` field per achievement and `renderShelf()` now also renders
   an `${unlocked.size}/${DEFS.length} milestones` bar. **This edit
   introduced and then fixed a real bug** — see "Bug found and fixed"
   below. The unlock logic itself (`unlockAndAnnounce`, `sync`,
   `noteRoll`, `announceJoin`, `flashStorm`, `flashCashDelta`) was not
   touched.
5. **HUD corner brackets** on both `.card--live` panels (Stellar,
   Leaderboard) — a repeated "this is live" framing motif instead of a
   generic rounded card, reusing `--accent` at the same semantic
   ("live") the rest of the page already gives it.
6. **Storm flash got a screen-shake.** The existing `storm-flash`/
   `storm-flash--loss` keyframes (first-class, real-event-only per
   BRAND.md) gained a small horizontal shake alongside the existing
   glow, still fully gated by the pre-existing `@media
   (prefers-reduced-motion: reduce) { .storm-flash, .storm-flash--loss
   { animation: none; } }` rule — untouched.
7. **2nd/3rd-place leaderboard rows** get a quieter visual nod
   (`var(--fg)` / `var(--warn)` on the rank number) using only existing
   tokens — no new colors invented for "medals".

**What did not change:** the tagline's substantive text, the Bitcoin
card (stays removed), the NOTE banner (stays removed), any of the 20
element IDs the script block depends on, and the sacred contract-call
logic.

### Bug found and fixed during this pass

The first icon edit to `Progression`'s `DEFS` array used CSS-style hex
escapes in a JS string literal — `icon: "\2609"` instead of `icon:
"☉"`. In JS, `\2` followed by digits is a legacy octal escape,
which is a hard `SyntaxError` in strict mode, and ES modules
(`<script type="module">`) are always strict. A syntax error anywhere
in a module script aborts the *entire* module — none of its top-level
code runs, so not one `addEventListener` call in the file would have
fired. Live verification caught this immediately: clicking "Create your
identity" produced no public key and `Runtime.exceptionThrown` reported
exactly `SyntaxError: Octal escape sequences are not allowed in strict
mode.` Fixed by switching all nine `DEFS` icon strings to proper `\uXXXX`
escapes; re-verified with `node --check` against the extracted script
block (`SYNTAX OK`) and then a full live re-run (below) that completed
with zero console/page errors. This is exactly the kind of mistake the
"no 'done' claim without live proof" rule exists to catch — a visually-
reviewed diff would not have caught it; only running the real page did.

### Live verification

Static checks, both before writing the README:
- `grep` for the 20 required element IDs — all present, exactly once
  each: `achvShelf`, `achvToasts`, `actionRow`, `btnFund`,
  `btnGenerate`, `btnJoin`, `btnLbRefresh`, `btnMuteToggle`,
  `contractLink`, `gamePanel`, `lbCard`, `lbDot`, `lbList`, `lbPill`,
  `lbStats`, `setupPanel`, `statusGrid`, `stellarCard`, `txLog`,
  `walletInfo`.
- `grep` for the sacred strings — `async function makeClient()`,
  `async function call(`, `tx.result.value`, `sent.result.value.tag`,
  `BuyStall`/`BuyBusiness`/`SideHustle`, `async function
  refreshLeaderboard()`, `function renderLeaderboard(`, `function
  renderLbStats(` — all present, line-identical to before this pass.

Live checks: `rea`'s `capture_browser_scenario` MCP tool hung twice in
this environment (30 min, then 45 min, no response, against both a
fresh browser launch and a connect to a manually-started instance on
the same host) — logged here rather than silently worked around. Given
that, verification was done with a small from-scratch CDP driver
(Node's native `WebSocket`, `/private/tmp/.../scratchpad/cdp-drive.mjs`)
talking to a manually-launched headless Chrome
(`--remote-debugging-port=9333`) over the real DevTools Protocol —
same protocol, same real page, same real testnet, just without the
hung MCP wrapper. Server: `python3 -m http.server 8743` in this
directory (already running).

**First-paint screenshot** (`01-first-paint-hero.png`): hero renders
with the HUD corners, grid backdrop, bolt watermark, three fact pills,
and the three mission-card steps (step 1 "READY", steps 2–3 "LOCKED"),
exactly as designed.

**Full click-through, real testnet, no mocks:**
1. `Create your identity` → real Ed25519 keypair generated client-side:
   public key `GBXSE44PEQ2SIH24PNKYENACQYW2QQJI26BNGLPP7SANB7UOIR3JBKMY`.
   Step 1 flips to a checkmark, progress rail fills to 34%, step 2
   chip flips `LOCKED` → `READY` (`02-wallet-generated.png`).
2. `Get funded` → real `GET friendbot.stellar.org` call; button read
   `Funding…` for 14s then `Funded ✓`; `btnJoin` became enabled
   (`03-funded.png`).
3. `Enter the game` → real signed `join()` submitted and confirmed in
   17s. Tx log line: `Joined — fb95d02395…` linking to
   `https://stellar.expert/explorer/testnet/tx/fb95d0239562c6714fbb222d4188c29639ae8c20eb301979bc3e5601707f3fe2`
   (real 64-hex-char Stellar testnet tx hash). `#gamePanel` became
   visible; `refreshState()`'s own async `get_state()` call populated
   the status grid ~5s later (polled, not assumed).
4. Rendered game panel (`04-game-panel.png`), all real on-chain state:
   **Round 1/20, Cash 10, Stalls 0, Businesses 0, Loans 0, Insured No.**
   Achievement shelf: **`1/9 milestones`**, `On The Ledger` unlocked
   (accent-filled badge, `◆` icon) — correctly the only one unlocked,
   since this run only joined. Action row: `Roll the Storm die 🎲`
   (correct — contract state is `awaiting_roll`).
5. Leaderboard card (`06-leaderboard-scrolled.png`), a separate fresh
   page load scrolled into view: real indexer data — **Finished 0, In
   progress 4** (reflecting wallets joined across this verification
   session plus prior sessions), Bankrupt/Free rate/Median score all
   `—` (correct empty-state handling, no finished games yet), pill
   reading `live · local backend`.
6. A second full run (different keypair) repeated steps 1–4 to confirm
   the first wasn't a fluke: public key
   `GCC43LOO3G2ASG46E7M2ZZTRD7ZXNEUJ63J3SBNY26UQ4RBIVZOHDCRM`, Friendbot
   funded in 10s, join confirmed in 17s, tx hash
   `709afe5ca15f5cf8e9d4a46488b25fb06a3328af051e3730912ce1f428c92c45`.

**Console/page errors across all runs (post-fix): zero.**
`Runtime.consoleAPICalled` and `Runtime.exceptionThrown` were both
listened to for the full duration of every run; none fired after the
escape-sequence fix above. (The known harmless `favicon.ico` 404 was
not separately checked this pass since no console-level error tool
surfaced it, consistent with prior passes' notes that it's a 404 on
the network tab, not a console error.)

Screenshots saved at
`/private/tmp/claude-501/-Users-mac-Downloads/b03b7ede-b20d-4d20-b78b-1390d5d46df7/scratchpad/screenshots/`:
`01-first-paint-hero.png`, `02-wallet-generated.png`, `03-funded.png`,
`04-game-panel.png`, `06-leaderboard-scrolled.png`, `07-full-page.png`.

Not re-covered by this pass: rolling the Storm die, buying assets,
loans/insurance, bankruptcy, and game-over states — the status-grid and
achievement-shelf *styling* for those states was verified by code
review (CSS selectors match the existing markup those off-limits
functions already produce) but not re-exercised live, since reaching
them requires playing a full round after join, which the prior
gamification pass's README already covers for the underlying mechanics
this pass didn't touch.

## Finish-gate review — 2026-11-04

A UI Finish-Gate Reviewer agent re-audited the visual redesign pass
above, independently of its own report — grounded in the actual
rendered page and the actual CSS/JS, not the designer's account of what
it did. **No code changes were made.** Every check below either passed
outright or produced an observation calibrated as non-blocking, with
the reasoning shown; nothing was invented to pad the review.

**1. Genericness/interchangeability — pass, with a noted tension.**
The HUD motif itself (four corner brackets, a receding grid backdrop, a
giant low-opacity bolt watermark) is, taken alone, a stock
"cyberpunk/HUD" pattern that could sit on any crypto or gaming landing
page — it is not derived from anything specific to this product's real
transactions or contract state, and the README's own framing concedes
as much ("all decorative"). What *is* earned and specific to this
product sits immediately below the hero and wasn't diluted by it: the
real contract-ID chip with a working Stellar Expert link, the
deliberate on-screen secret-key reveal, a transaction log whose entries
link to real confirmed testnet transactions, an achievement shelf whose
every unlock traces to actual `get_state()`/`roll_and_pay()` results,
and a Storm-roll screen shake gated on a real `Storm` tag. The hero is
generic chrome around a genuinely non-generic core — restrained (low
opacity, no new colors), explicitly authorized by the product owner as
"real creative license," and not in conflict with any functional or
brand rule. Flagged for the record, not treated as a blocker.

**2. Accessibility — pass, no new failures found.** Computed WCAG
contrast ratios from the actual hex values in `:root` (not read off the
README's claims) for every new text/background pairing introduced by
this pass:

| pairing | ratio |
|---|---|
| `--fg-faint` on `--bg-elev-2` (hero-fact pills, achv-badges, contract-chip label) | 5.12:1 |
| `--fg-faint` on `--bg-elev-3` (worst case, pre-existing) | 4.66:1 |
| `--fg-faint` on `--bg-elev` (step-tag, step-hint, onboard-subline, card-head-sub) | 5.48:1 |
| `--accent` on composited `rgba(accent,0.08)` over `--bg-elev` (step-state "ready" chip, `.pill--live`) | 9.82:1 |
| `--accent` / `--danger` on `--bg-elev-3` (cash-delta badge) | 9.71:1 / 5.48:1 |
| `--accent` on `--bg-elev-2` (achv-toast-tag, unlocked badge text) | 10.67:1 |
| `--danger` on `--bg-elev-2` (loss-outcome toast tag) | 6.02:1 |
| `--info` on `--bg-elev` (tx-link) | 8.16:1 |

All clear the 4.5:1 AA floor for normal text (none of this pass's new
text qualifies as "large text," so 4.5:1 is the correct bar), several
by a wide margin. No new failure introduced; the prior pass's fix
(`--fg-faint` worst case now 4.66:1) still holds. Every new `@keyframes`
animation (`bolt-flicker`, `hero-fact-dot`'s `pulse`, `hero-rise` /
`.hero-anim`, `storm-flash` / `storm-flash--loss`'s new shake, `achv-in`
/ `achv-out`, `cash-delta-float`) was grepped against the `@media
(prefers-reduced-motion: reduce)` blocks individually — all seven are
covered, none slipped through. The decorative `::before` status-chip
text (`locked`/`ready`/`done`) and per-tile icon glyphs are correctly
`aria-hidden` or redundant with the button's native `disabled` state,
so no information is screen-reader-only-inaccessible that isn't also
available through native semantics.

**3. Honesty of visual signals — pass, one borderline case examined
and resolved as pre-existing, not new.** Every status chip, progress
bar, and badge was traced to real JS: the `.step-state` chip's
`locked`/`ready`/`done` content is pure CSS keyed off `button:disabled`
and `.step--done` — both set only by the real click handlers
(`btnGenerate`/`btnFund`/`btnJoin`) on Friendbot success / confirmed
`join()`. The `.onboard-progress-fill` width and the achievement shelf's
`${unlocked.size}/${DEFS.length}` bar both read real DOM/state, not a
parallel counter. The one item that looked questionable on inspection:
`.hero-fact-dot` (the pulsing dot next to "live · stellar testnet" in
the static hero) uses the identical `pulse` animation and box-shadow as
`.dot--live`, which elsewhere on the page *does* reflect a real check
(`#lbDot` toggles `dot--live`/`dot--archive` based on whether the
leaderboard fetch actually succeeded). Isolated, a pulsing "live" dot
on hardcoded, never-updated text reads as implying a live check that
isn't happening. But `#stellarCard`'s own heading dot has carried the
exact same static, unverified `dot--live` class since before this pass
(it's asserting "this card is wired to a live chain," a true, static
product fact, not "currently polling and confirmed reachable") — this
pass's hero dot extends an existing, already-reviewed convention rather
than inventing a new one. Not re-litigated as a new defect; worth
tightening in a future pass if the two meanings (static "this is a live
feature" vs. dynamic "this connection just checked out") are ever
consolidated.

**4. Implementation integrity — pass, independently confirmed.**
`grep -o 'id="<id>"'` for all 20 required element IDs against the live
file: `achvShelf`, `achvToasts`, `actionRow`, `btnFund`, `btnGenerate`,
`btnJoin`, `btnLbRefresh`, `btnMuteToggle`, `contractLink`, `gamePanel`,
`lbCard`, `lbDot`, `lbList`, `lbPill`, `lbStats`, `setupPanel`,
`statusGrid`, `stellarCard`, `txLog`, `walletInfo` — each present
exactly once. Grepped the sacred lines independently of the designer's
own report: `async function makeClient()`, `async function call(`,
`tx.result.value`, `sent.result.value.tag`, the `BuyStall`/
`BuyBusiness`/`SideHustle` enum literals, `async function
refreshLeaderboard()`, `function renderLeaderboard(`, `function
renderLbStats(` — all present, unchanged. `node --check` against the
extracted `<script type="module">` block: syntax OK. (This project
isn't under git, so no commit diff was available to cross-check against
— the grep-based checks above are the full extent of static
verification possible here.)

**5. Finish quality — pass.** Screenshotted first paint and the
post-join game panel independently (see Live verification below); the
hero and the cards below it read as one system, not two bolted
together — same corner-bracket language (sized and positioned
differently by design: 16px/10px-inset on the static hero vs.
14px/flush on the interactive `.card--live` panels, which reads as
intentional hierarchy rather than inconsistency), same typography
scale discipline, same color restraint. No half-wired affordances
found: the progress rail's `:has()` selectors resolve correctly at
every combination of done steps (verified both by reading the CSS
cascade order and by observing the rail reach 100% live after join),
the step-state chip never contradicts the button's actual disabled
state, and the achievement shelf's progress bar/badges matched real
unlock state in the live run below.

### Live verification

Server: `python3 -m http.server 8743` (already running from a prior
pass, left as-is). Tool: a from-scratch CDP driver (Node 26's native
`WebSocket`/`fetch`, no dependencies) against a separately-launched
headless Chrome (`--remote-debugging-port=9334`, killed after this
pass finished) — the same approach the prior pass fell back to, chosen
up front this time rather than after a hang, since the prior pass's
notes already flagged `capture_browser_scenario` as unreliable in this
environment.

Ran a full fresh click-through, real testnet, no mocks, independent of
the designer's own run: `Create your identity` → `Get funded` → `Enter
the game`, waiting on real DOM state
(`#btnFund:not([disabled])`/`#btnJoin:not([disabled])`/`#gamePanel:not([hidden])`)
rather than fixed timers. Result: new keypair
`GCOFIPQNEDEW37ZENJA7FYGBHN35NNOQQGUEH6G36EOQPBKATFVEGOZX`, Friendbot
funded, `join()` confirmed with real tx hash
`0dfb46bcd14d243685cd85d3438af6bde5306464408c72b2101abefcb6a272e1`
(linked correctly to Stellar Expert in the tx log), status grid
populated with real post-join state (Round 1/20, Cash 10, Stalls 0,
Businesses 0, Loans 0, Insured No), achievement shelf showing `1/9
milestones` with only `On The Ledger` unlocked (correct — only `join`
happened this run). Zero `Runtime.exceptionThrown` /
`Runtime.consoleAPICalled(error)` events across the whole run.
Screenshots: `fg-01-first-paint.png`, `fg-02-wallet-generated.png`,
`fg-03-funded.png`, `fg-05-game-panel-populated.png` in this session's
scratchpad.

**Net: PASS on all five categories, zero code changes.** This pass's
own re-check found the file in the state its own report claimed — the
first time in this file's review history that an independent gate
pass didn't find something to fix.

## Character creation (personas) — 2026-11-05

Added at the user's explicit request for "an interactive interface with
actual personalities that a user can create," with an explicit decision
up front that personas would affect real gameplay (not just cosmetic
flavor) — which meant a contract redeploy, a one-way door (no upgrade
function exists on this contract; a new `join()` parameter needs a new
contract ID, not an in-place update). The first generation stays live,
unmodified, and un-migrated at
`CABDVHFVUJSNTWLHYWWSOWKIZS6OYFOSRLQNXPXI2OICFSHZCNMG4RAT` for anyone
with a game already on it. This page now points at the second
generation, `CBO4POPU3FQXXYE353LKO6KNHT2QJRZGOFDTQEKELS3H2ZZBNEPF3SOE`
— see the top-level README for the full persona table and the contract
diff.

**What's new in `index.html`:** Step 3 of onboarding ("Enter the game")
now opens with a persona grid (`#personaGrid`, 5 cards — Classic,
Hustler, Saver, Builder, Gambler — each showing its real mechanical
effect, copied verbatim from the contract's own constants, not
invented for display) and an operator-identity row (`#operatorName`
text input, `#avatarPicker` emoji row). The persona choice is sent as a
real argument to `join()` — `call("join", { player, persona: { tag:
selectedPersona, values: void 0 } })` — and is therefore enforced by the
contract itself, not just displayed by the client. The name/avatar are
cosmetic only: saved to `localStorage` under a new
`stormMoneyChainOperator:<pubkey>` key (same per-public-key pattern the
achievement shelf already uses), never sent on-chain, and rendered in a
new `#operatorBadge` once in-game. `renderActions()`'s cost/gain labels
and affordability checks are now computed from `state.persona.tag` (the
chain's own answer from a real `get_state()` call) via a new
`personaRates()` helper, not hardcoded — if the contract's persona math
ever disagrees with this helper, it's this helper that's wrong, by
construction.

**What's explicitly unchanged:** `makeClient()`, `call()`, the
`tx.result.value`/`sent.result.value.tag` unwrapping, the `Action`
enum encoding (`BuyStall`/`BuyBusiness`/`SideHustle`), and all three
leaderboard functions — verified by grep before and after, same as
every prior pass. The one deliberate exception to "never touch the
sacred call-building lines" is `join()`'s own argument list, which
necessarily changed because the contract's `join()` signature changed
(`fn join(env, player, persona)` instead of `fn join(env, player)`) —
not an accidental edit, the actual point of this pass.

**Verification performed (CLI-based, not browser click-through this
time):** the user asked to click through the browser UI personally
after the last pass, so this pass did not run `rea`'s
`capture_browser_scenario` (also still flagged unreliable in this
environment per the notes above) or any substitute headless driver
against the live page. Instead: (1) all 13 `cargo test` cases pass,
including four new persona-specific tests and a `classic_persona_
matches_original_flat_rates` control; (2) `stellar contract build`
clean, 7 functions exported; (3) real testnet round-trips for all five
personas against the freshly deployed second-generation contract —
Hustler's Side Hustle paid exactly 5 (cash 13→18), Builder's stall cost
exactly 6 (cash 13→7), Saver's expenses were exactly 1 lower on an
`Emergency` roll (cash landed at 2, one more than the Classic-equivalent
1 from the first generation's own earlier verification), Gambler's Side
Hustle landed the 0-payout branch on a real transaction (cash 13→13,
not 13→16), and Classic's `persona` field round-tripped correctly
through `get_state` (`"persona":"Classic"`) even though a flaky testnet
RPC window prevented confirming its roll/hustle math live in this pass
specifically (the unit test and the first generation's extensive prior
Classic-equivalent verification cover that math instead); (4)
`node --check` on the extracted `<script type="module">` block passes;
(5) grep-verified all "sacred" lines byte-identical except `join()`'s
argument list, as scoped above.

### Live verification — 2026-11-07

The user asked the agent to do this click-through itself. `rea`'s
`capture_browser_scenario` was skipped again (still on record above as
hanging 30–45 min twice in this environment) in favor of the same
from-scratch CDP driver approach the 2026-11-04 pass used successfully:
a manually-launched headless Chrome (`--remote-debugging-port=9222`,
killed after this pass) driven by a small Node script
(`/tmp/storm-cdp/drive.mjs`, native `WebSocket`/`fetch`, no deps).

**Real click-through, real testnet, no mocks:** generate identity
(`GCJTKUR5U7...`) → select the Hustler persona card → type an operator
name → select an avatar → fund via Friendbot → join. Final state,
read back from the live DOM after the real `get_state()` call resolved:
status grid `Round 1/20, Cash 10, Stalls 0, Businesses 0, Loans 0,
Insured No`; operator badge `🦊 CDP Test Operator · Hustler — Grind
harder, earn more` (the persona name/tagline there comes from
`state.persona.tag`, the chain's own answer, not the client's local
pick); tx log `Joined as CDP Test Operator (Hustler) — <real tx
hash>`. Zero console errors or exceptions across the run.

**One real bug found and fixed:** the Stellar card's contract-ID chip
(`.contract-chip-id`) was hardcoded text in the HTML, while the
"view on Stellar Expert →" link next to it was already set dynamically
from the `CONTRACT_ID` constant. This was invisible before the persona
redeploy (the hardcoded text happened to match the only contract that
had ever existed) and became visibly wrong the moment a second
generation was deployed — the chip kept showing the *first*
generation's ID while the link correctly pointed at the second. Fixed
by giving the span an id (`contractChipId`) and setting its
`textContent` from the same `CONTRACT_ID` constant the link already
uses, so the two can't drift apart again. Caught by a real screenshot
during this pass, not by code review — the diff looked fine on paper
since the JS responsible for the link was untouched.

**One test-harness false alarm, not an app bug:** two of this pass's
own DOM checks (`persona-card--selected` class, `avatar-opt--selected`
class) read `false` immediately after a scripted click, because both
`renderPersonaGrid()` and `renderAvatarPicker()` rebuild their
container's `innerHTML` on every selection — which detaches the exact
button node the test script's `.click()` call had a reference to. The
*application* behavior was already correct (re-queried fresh, the right
card/avatar were marked selected, and the real `join()` call carried
the right persona) — only the test script's stale-reference check was
wrong. Noted here so a future pass doesn't "fix" code that was never
broken.

**Practical note for anyone reloading this page after an edit:**
`python3 -m http.server` sends no `Cache-Control` headers, so Chrome
(and likely other browsers) can serve a stale cached copy of
`index.html` on a plain reload. A hard refresh (Cmd+Shift+R) or cache-
disabled reload is what actually picks up a fresh edit — this pass hit
exactly that trap once before realizing it was cache, not a failed fix.

**Not yet covered:** rounds 2–20, bankruptcy, and game-over states for
the persona system specifically (Hustler's Side Hustle rate, Saver's
discount, Builder's costs, and Gambler's variance were all verified
earlier via direct CLI contract calls against the live second-generation
contract — see the top-level README — but not yet exercised through
this browser UI across a full run).
