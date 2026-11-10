import * as StellarSdk from "https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@17.4.0/+esm";

const CONTRACT_ID = "CBO4POPU3FQXXYE353LKO6KNHT2QJRZGOFDTQEKELS3H2ZZBNEPF3SOE";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const FRIENDBOT_URL = "https://friendbot.stellar.org";

document.getElementById("contractLink").href =
  `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;
// Was previously hardcoded in the HTML (drifted silently to a stale
// contract ID the first time this page pointed at a new deployment,
// since only .href above was ever kept in sync) -- driven from the same
// CONTRACT_ID constant as the link now, so the two can't disagree again.
document.getElementById("contractChipId").textContent = CONTRACT_ID;

let keypair = null;
let client = null;

const $ = (id) => document.getElementById(id);
const walletInfo = $("walletInfo");
const statusGrid = $("statusGrid");
const actionRow = $("actionRow");
const txLog = $("txLog");

// ---- operator creation: persona (real on-chain trait, enforced by the
// contract's `Persona` enum — see lib.rs) + name/avatar (cosmetic, client-
// only). Numbers below are copied from the deployed contract's own
// constants, not invented for display — if the contract's persona math
// ever changes, these labels have to move with it.
const PERSONAS = [
  { tag: "Classic", icon: "⬡", name: "Classic", tagline: "The original economy", desc: "No bonuses, no penalties. Stall 8, Business 24, Side Hustle +3, standard expenses." },
  { tag: "Hustler", icon: "⚡", name: "Hustler", tagline: "Grind harder, earn more", desc: "Side Hustle pays +5 instead of +3. Everything else is the standard economy." },
  { tag: "Saver", icon: "✺", name: "Saver", tagline: "Frugality pays off", desc: "Every round's living expenses are 1 cash lower — compounds over 20 rounds." },
  { tag: "Builder", icon: "▣", name: "Builder", tagline: "Cheaper path to passive income", desc: "Stall costs 6 instead of 8. Business costs 18 instead of 24. Same payout." },
  { tag: "Gambler", icon: "🎲", name: "Gambler", tagline: "High risk, high variance", desc: "Side Hustle is a coin flip: nothing, or +6. Same average as the flat rate." },
];
const AVATARS = ["🦅", "🦊", "🐺", "🦉", "🐢", "🦁", "🐙", "🦝"];
const OPERATOR_KEY_PREFIX = "stormMoneyChainOperator:";
// Plaintext is fine here: this key only ever controls disposable testnet
// play-money, and the whole point of this game is that nothing is hidden.
// Without this, closing or reloading the tab permanently loses the
// account -- there's no server-side account recovery, since the chain
// itself is the only source of truth and it only knows a public key.
const SECRET_KEY_STORAGE = "stormMoneyChainSecret";
function saveSecretKey(secret) {
  try { window.localStorage.setItem(SECRET_KEY_STORAGE, secret); } catch (e) { /* best-effort */ }
}
function loadSecretKey() {
  try { return window.localStorage.getItem(SECRET_KEY_STORAGE); } catch (e) { return null; }
}
function clearSecretKey() {
  try { window.localStorage.removeItem(SECRET_KEY_STORAGE); } catch (e) { /* best-effort */ }
}

let selectedPersona = PERSONAS[0].tag;
let selectedAvatar = AVATARS[0];

function renderPersonaGrid() {
  const grid = $("personaGrid");
  grid.innerHTML = PERSONAS.map((p) => `
    <button type="button" class="persona-card${p.tag === selectedPersona ? " persona-card--selected" : ""}" data-persona="${p.tag}" role="radio" aria-checked="${p.tag === selectedPersona}">
      <div class="persona-card-head">
        <span class="persona-card-icon" aria-hidden="true">${p.icon}</span>
        <span class="persona-card-name">${p.name}</span>
        <span class="persona-card-radio" aria-hidden="true"></span>
      </div>
      <span class="persona-card-tagline">${p.tagline}</span>
      <span class="persona-card-desc">${p.desc}</span>
    </button>`).join("");
  grid.querySelectorAll(".persona-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedPersona = btn.dataset.persona;
      renderPersonaGrid();
    });
  });
}

function renderAvatarPicker() {
  const picker = $("avatarPicker");
  picker.innerHTML = AVATARS.map((a) => `
    <button type="button" class="avatar-opt${a === selectedAvatar ? " avatar-opt--selected" : ""}" data-avatar="${a}" role="radio" aria-checked="${a === selectedAvatar}" aria-label="Avatar ${a}">${a}</button>`).join("");
  picker.querySelectorAll(".avatar-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedAvatar = btn.dataset.avatar;
      renderAvatarPicker();
    });
  });
}
renderPersonaGrid();
renderAvatarPicker();

function operatorStorageKey(pubKey) { return OPERATOR_KEY_PREFIX + pubKey; }

function saveOperatorProfile(pubKey) {
  const profile = { name: $("operatorName").value.trim() || "Operator", avatar: selectedAvatar, persona: selectedPersona };
  try { window.localStorage.setItem(operatorStorageKey(pubKey), JSON.stringify(profile)); } catch (e) { /* best-effort */ }
  return profile;
}

function loadOperatorProfile(pubKey) {
  try {
    const raw = window.localStorage.getItem(operatorStorageKey(pubKey));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* best-effort */ }
  return null;
}

// Renders from the chain's own `state.persona`, not the client's local
// selection — if they ever disagree, the chain wins (same principle the
// rest of this page already applies to cash/round/etc).
function renderOperatorBadge(state) {
  const badge = $("operatorBadge");
  if (!badge) return;
  const profile = loadOperatorProfile(keypair.publicKey()) || { name: "Operator", avatar: AVATARS[0] };
  const personaDef = PERSONAS.find((p) => p.tag === state.persona?.tag) || PERSONAS[0];
  badge.innerHTML = `
    <span class="operator-badge-avatar" aria-hidden="true">${profile.avatar}</span>
    <span>
      <span class="operator-badge-name">${profile.name}</span>
      <span class="operator-badge-persona"> · <strong>${personaDef.name}</strong> — ${personaDef.tagline}</span>
    </span>`;
}

// ---- audio (Web Audio API; procedurally synthesized, no external files) ----
// Each tone is distinct because each real event it confirms is distinct: a
// clean, consistent "a real signed transaction just happened" confirm tone,
// a separate local "key materialized" sound for wallet generation (which
// never touches the network, so it must not sound like a transaction), a
// warm "funds received" chime for Friendbot, and a distinct glitch tone for
// errors. play() never throws — a blocked AudioContext or missing Web Audio
// support can never interfere with an actual transaction. Nothing plays
// before a real click; the context is created/resumed lazily on first use,
// and every call site below is inside a click handler, so that's always a
// real user gesture.
const SFX_MUTE_KEY = "stormMoneyChainMuted";
const ChainSFX = (() => {
  let ctx = null;
  let muted = false;
  try { muted = window.localStorage.getItem(SFX_MUTE_KEY) === "1"; } catch (e) { /* no storage, default on */ }

  function ensureCtx() {
    if (ctx) { if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function noiseBuffer(c, seconds) {
    const n = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(c, t0, freq, dur, opts = {}) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.toFreq) osc.frequency.linearRampToValueAtTime(opts.toFreq, t0 + dur);
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
    const peak = opts.gain != null ? opts.gain : 0.2;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + (opts.attack || 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function filteredNoise(c, t0, dur, opts = {}) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur);
    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || "highpass";
    filter.frequency.setValueAtTime(opts.freq || 2000, t0);
    if (opts.toFreq) filter.frequency.linearRampToValueAtTime(opts.toFreq, t0 + dur);
    filter.Q.value = opts.q || 1;
    const gain = c.createGain();
    const peak = opts.gain != null ? opts.gain : 0.25;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + (opts.attack || 0.002));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    // wallet generated locally — no network call yet, so this is deliberately
    // NOT a "transaction" sound: a quick bright spark of key material appearing
    keygen: (c, t0) => {
      filteredNoise(c, t0, 0.035, { filterType: "highpass", freq: 4000, gain: 0.16, attack: 0.001 });
      tone(c, t0 + 0.01, 900, 0.18, { type: "sine", toFreq: 1800, gain: 0.14, attack: 0.005 });
      tone(c, t0 + 0.01, 905, 0.18, { type: "sine", toFreq: 1810, gain: 0.1, attack: 0.005 });
    },
    // Friendbot funded the account — a warm two-note "received" chime
    funded: (c, t0) => {
      tone(c, t0, 600, 0.16, { type: "sine", gain: 0.16, attack: 0.004 });
      tone(c, t0 + 0.1, 900, 0.22, { type: "sine", gain: 0.16, attack: 0.004 });
    },
    // joined the on-chain game — the first real signed transaction: two
    // tones converging into one, a felt "handshake" with the contract
    joined: (c, t0) => {
      tone(c, t0, 500, 0.3, { type: "sine", toFreq: 700, gain: 0.15, attack: 0.005 });
      tone(c, t0, 900, 0.3, { type: "sine", toFreq: 700, gain: 0.12, attack: 0.005 });
      tone(c, t0 + 0.05, 90, 0.2, { type: "sine", gain: 0.2, attack: 0.002 });
    },
    // any later signed transaction confirming on-chain — the recurring
    // "that was real" tick: short, consistent, slightly weighty
    txConfirm: (c, t0) => {
      tone(c, t0, 1000, 0.07, { type: "square", gain: 0.12, attack: 0.001 });
      tone(c, t0 + 0.06, 1300, 0.08, { type: "square", gain: 0.1, attack: 0.001 });
      tone(c, t0, 85, 0.12, { type: "sine", gain: 0.18, attack: 0.001 });
    },
    // a call failed (Friendbot, join, or a game action) — a short dissonant glitch
    error: (c, t0) => {
      tone(c, t0, 300, 0.1, { type: "square", gain: 0.14, attack: 0.001 });
      tone(c, t0, 318, 0.1, { type: "square", gain: 0.14, attack: 0.001 });
      tone(c, t0 + 0.1, 220, 0.14, { type: "sawtooth", toFreq: 110, gain: 0.14, attack: 0.001 });
    },
    // an achievement unlocked — a bright ascending three-note flourish,
    // distinct from the plain txConfirm tick so a real milestone stands out
    achievement: (c, t0) => {
      tone(c, t0, 523, 0.14, { type: "sine", gain: 0.16, attack: 0.004 });
      tone(c, t0 + 0.09, 659, 0.14, { type: "sine", gain: 0.16, attack: 0.004 });
      tone(c, t0 + 0.18, 784, 0.22, { type: "sine", gain: 0.18, attack: 0.004 });
    },
    // a real on-chain Storm roll resolving — a low rumble and a sharp
    // crack, deliberately NOT the "error" glitch: this is a valid
    // contract event, not a failed call
    storm: (c, t0) => {
      filteredNoise(c, t0, 0.22, { filterType: "lowpass", freq: 900, toFreq: 220, gain: 0.22, attack: 0.002 });
      tone(c, t0 + 0.03, 140, 0.22, { type: "sawtooth", toFreq: 60, gain: 0.16, attack: 0.002 });
      filteredNoise(c, t0 + 0.05, 0.05, { filterType: "highpass", freq: 3000, gain: 0.14, attack: 0.001 });
    },
    // full 20-round run completed without going bankrupt
    complete: (c, t0) => {
      tone(c, t0, 440, 0.16, { type: "sine", gain: 0.15, attack: 0.004 });
      tone(c, t0 + 0.1, 554, 0.16, { type: "sine", gain: 0.15, attack: 0.004 });
      tone(c, t0 + 0.2, 659, 0.16, { type: "sine", gain: 0.15, attack: 0.004 });
      tone(c, t0 + 0.3, 880, 0.3, { type: "sine", gain: 0.18, attack: 0.004 });
    },
    // bankrupt — somber and descending; an honest ending tone, not a glitch
    bankrupt: (c, t0) => {
      tone(c, t0, 320, 0.22, { type: "sine", toFreq: 180, gain: 0.16, attack: 0.004 });
      tone(c, t0 + 0.18, 220, 0.3, { type: "sine", toFreq: 110, gain: 0.14, attack: 0.004 });
    }
  };

  function play(name) {
    if (muted) return;
    try {
      const c = ensureCtx();
      if (!c) return;
      const fn = SOUNDS[name];
      if (!fn) return;
      fn(c, c.currentTime);
    } catch (e) { /* audio is best-effort; never interfere with a real transaction */ }
  }

  function isMuted() { return muted; }
  function toggleMute() {
    muted = !muted;
    try { window.localStorage.setItem(SFX_MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
    return muted;
  }

  return { play, isMuted, toggleMute };
})();

function syncMuteButton() {
  const b = document.getElementById("btnMuteToggle");
  if (b) {
    b.textContent = ChainSFX.isMuted() ? "🔇 Sound off" : "🔊 Sound on";
    b.setAttribute("aria-pressed", ChainSFX.isMuted() ? "true" : "false");
  }
}
syncMuteButton();
const btnMuteToggleEl = document.getElementById("btnMuteToggle");
if (btnMuteToggleEl) {
  btnMuteToggleEl.addEventListener("click", () => {
    ChainSFX.toggleMute();
    syncMuteButton();
  });
}

function fmtNum(v) {
  try { return v.toLocaleString(); } catch { return String(v); }
}

// ---- gamification layer: achievements/progression derived strictly from
// confirmed on-chain state (see BRAND.md's override note for why this page
// now carries decoration it didn't before). Every unlock below is traced
// to a real signed, broadcast, confirmed transaction's resulting state —
// nothing here is a client-side fake reward. `sync()` is called from
// refreshState() right after a real get_state() call resolves; noteRoll()
// is called from handleAction() right after a real roll_and_pay() call
// resolves, reading the same already-unwrapped EventRoll tag the tx log
// line uses. This module never touches call()/makeClient()/the Action
// enum encoding — it only reacts to their results after the fact.
const ACHV_KEY_PREFIX = "stormMoneyChainAchv:";
const Progression = (() => {
  const DEFS = [
    { id: "joined", icon: "◆", title: "On The Ledger", desc: "Joined the live contract — your first real signed transaction this run." },
    { id: "free", icon: "☉", title: "Free", desc: "Passive income covered expenses for the first time this run." },
    { id: "storm_survived", icon: "⛈", title: "Storm Survived", desc: "Weathered a real on-chain Storm roll and kept playing." },
    { id: "insured", icon: "☂", title: "Insured Operator", desc: "Bought insurance — a real mitigation against the next Storm." },
    { id: "business", icon: "▣", title: "Business Owner", desc: "Opened your first Business tier asset on-chain." },
    { id: "round_5", icon: "▸", title: "Five Rounds In", desc: "Reached round 5 of 20." },
    { id: "round_10", icon: "▸▸", title: "Halfway", desc: "Reached round 10 of 20." },
    { id: "round_15", icon: "▸▸▸", title: "Final Stretch", desc: "Reached round 15 of 20." },
    { id: "finished", icon: "★", title: "Full Run", desc: "Completed all 20 rounds without going bankrupt." },
  ];

  let unlocked = new Set();
  let pubKey = null;
  let prev = null;
  let pendingRollTag = null;

  function storageKey() { return ACHV_KEY_PREFIX + (pubKey || "anon"); }
  function persist() {
    try { window.localStorage.setItem(storageKey(), JSON.stringify([...unlocked])); } catch (e) { /* best-effort */ }
  }

  // Fresh wallet = fresh game on this contract, so progression resets
  // per public key rather than following "whoever last used this tab".
  function load(pk) {
    pubKey = pk;
    unlocked = new Set();
    prev = null;
    pendingRollTag = null;
    try {
      const raw = window.localStorage.getItem(storageKey());
      if (raw) JSON.parse(raw).forEach((id) => unlocked.add(id));
    } catch (e) { /* best-effort */ }
    renderShelf();
  }

  function renderShelf() {
    const shelf = document.getElementById("achvShelf");
    if (!shelf) return;
    const pct = Math.round((unlocked.size / DEFS.length) * 100);
    const progress = `<div class="achv-progress">`
      + `<span class="achv-progress-label">${unlocked.size}/${DEFS.length} milestones</span>`
      + `<span class="achv-progress-bar"><span style="width:${pct}%"></span></span>`
      + `</div>`;
    const badges = DEFS.map((d) => {
      const on = unlocked.has(d.id);
      return `<span class="achv-badge${on ? " achv-badge--unlocked" : ""}" title="${d.desc}">`
        + `<span class="achv-icon" aria-hidden="true">${d.icon}</span>`
        + `<span class="achv-dot" aria-hidden="true"></span>${d.title}</span>`;
    }).join("");
    shelf.innerHTML = progress + `<div class="achv-badges">${badges}</div>`;
  }

  function toast(cls, tag, title, desc) {
    const wrap = document.getElementById("achvToasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = `achv-toast ${cls}`;
    el.innerHTML = `<span class="achv-toast-tag">${tag}</span>`
      + `<span class="achv-toast-body">`
      + `<span class="achv-toast-title">${title}</span>`
      + `<span class="achv-toast-desc">${desc}</span>`
      + `</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("achv-toast--leaving");
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  function unlockAndAnnounce(id) {
    if (unlocked.has(id)) return;
    const def = DEFS.find((d) => d.id === id);
    if (!def) return;
    unlocked.add(id);
    persist();
    renderShelf();
    toast("achv-toast--unlock", "ACHIEVEMENT UNLOCKED", def.title, def.desc);
    ChainSFX.play("achievement");
  }

  function flashStorm(lostAsset) {
    ChainSFX.play("storm");
    const card = document.getElementById("stellarCard");
    if (!card) return;
    const cls = lostAsset ? "storm-flash--loss" : "storm-flash";
    card.classList.remove("storm-flash", "storm-flash--loss");
    void card.offsetWidth; // restart the animation if triggered twice in a row
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 950);
  }

  function flashCashDelta(delta) {
    if (!delta) return;
    let cashTile = null;
    document.querySelectorAll("#statusGrid .tile").forEach((t) => {
      if (t.querySelector(".label")?.textContent === "Cash") cashTile = t;
    });
    if (!cashTile) return;
    const badge = document.createElement("span");
    badge.className = `cash-delta${delta < 0 ? " cash-delta--down" : ""}`;
    badge.textContent = `${delta > 0 ? "+" : ""}${delta}`;
    cashTile.appendChild(badge);
    setTimeout(() => badge.remove(), 1600);
  }

  function announceJoin() {
    unlockAndAnnounce("joined");
  }

  // Records the tag of a just-confirmed roll_and_pay() so the following
  // sync() call (triggered by the refreshState() that always follows a
  // roll) knows whether it's looking at a post-Storm state.
  function noteRoll(tag) {
    pendingRollTag = tag;
  }

  function sync(state) {
    const p = prev;
    if (p) flashCashDelta(state.cash - p.cash);

    if (pendingRollTag === "Storm") {
      const assetsBefore = p ? p.stalls + p.businesses : state.stalls + state.businesses;
      const assetsAfter = state.stalls + state.businesses;
      flashStorm(assetsAfter < assetsBefore);
      if (!state.bankrupt) unlockAndAnnounce("storm_survived");
    }
    pendingRollTag = null;

    if (state.free_round && (!p || !p.free_round)) unlockAndAnnounce("free");
    if (state.insured && (!p || !p.insured)) unlockAndAnnounce("insured");
    if (state.businesses > 0) unlockAndAnnounce("business");
    if (state.round >= 5) unlockAndAnnounce("round_5");
    if (state.round >= 10) unlockAndAnnounce("round_10");
    if (state.round >= 15) unlockAndAnnounce("round_15");

    if (state.game_over) {
      if (state.bankrupt) {
        toast("achv-toast--outcome-loss", "GAME OVER", "Bankrupt",
          `Ranked last at round ${state.bankrupt_round || state.round}. Same honest call the kids' build makes — a loss doesn't get softened here either.`);
        ChainSFX.play("bankrupt");
      } else {
        unlockAndAnnounce("finished");
        toast("achv-toast--outcome-win", "RUN COMPLETE", `Final score ${state.final_score}`,
          `Cash ${fmtNum(state.cash)} · ${state.stalls} stalls · ${state.businesses} businesses after 20 real on-chain rounds.`);
        ChainSFX.play("complete");
      }
    }

    prev = state;
  }

  return { load, sync, noteRoll, announceJoin };
})();

function logLine(html, kind = "info") {
  const div = document.createElement("div");
  div.className = `log-item log-item--${kind}`;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  div.innerHTML = `<span class="log-time">${time}</span><span class="log-body">${html}</span>`;
  txLog.prepend(div);
}

function explorerLink(hash) {
  return `<a class="tx-link" href="https://stellar.expert/explorer/testnet/tx/${hash}" target="_blank">${hash.slice(0, 10)}…</a>`;
}

function renderWalletInfo(kp) {
  walletInfo.innerHTML = `
    <div class="key-row">
      <span class="key-label">Public</span>
      <span class="num key-value">${kp.publicKey()}</span>
      <button type="button" class="copy-btn" data-copy="${kp.publicKey()}">copy</button>
    </div>
    <div class="key-row key-row--secret">
      <span class="key-label">Secret</span>
      <span class="num key-value">${kp.secret()}</span>
      <button type="button" class="copy-btn" data-copy="${kp.secret()}">copy</button>
    </div>
    <p class="key-warning">testnet only — we show this key on purpose, so you can see nothing is hidden; never do this with real funds on mainnet</p>
    <p class="key-hint">Saved in this browser, so reloading the page won't lose your run. <button type="button" class="copy-btn" id="btnForgetKey">forget this account</button></p>`;
  walletInfo.querySelectorAll(".copy-btn[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const orig = b.textContent;
        b.textContent = "copied";
        setTimeout(() => { b.textContent = orig; }, 1200);
      } catch (e) { /* clipboard unavailable — not fatal */ }
    });
  });
  $("btnForgetKey").addEventListener("click", forgetAccount);
}

function forgetAccount() {
  clearSecretKey();
  keypair = null;
  client = null;
  walletInfo.innerHTML = "";
  $("setupPanel").style.display = "";
  $("gamePanel").hidden = true;
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("step--done"));
  $("btnGenerate").disabled = false;
  $("btnFund").disabled = true;
  $("btnFund").textContent = "Get funded";
  $("btnJoin").disabled = true;
  $("btnJoin").textContent = "Enter the game";
  logLine("Forgot this account — generate a new identity to start over.", "info");
}

$("btnGenerate").addEventListener("click", () => {
  keypair = StellarSdk.Keypair.random();
  saveSecretKey(keypair.secret());
  ChainSFX.play("keygen");
  renderWalletInfo(keypair);
  $("btnGenerate").closest(".step").classList.add("step--done");
  $("btnFund").disabled = false;
});

// Resumes a saved identity on page load so a refresh or a closed tab
// doesn't strand the player with no way back into their own run — the
// chain is the only source of truth on join state, so this asks it
// directly rather than guessing from anything cached client-side.
async function tryRestoreSession() {
  const secret = loadSecretKey();
  if (!secret) return;
  try {
    keypair = StellarSdk.Keypair.fromSecret(secret);
  } catch (e) {
    clearSecretKey(); // corrupted value -- don't get permanently stuck on it
    return;
  }
  renderWalletInfo(keypair);
  $("btnGenerate").disabled = true;
  $("btnGenerate").closest(".step").classList.add("step--done");
  logLine(`Restored your saved identity from this browser.`, "info");
  try {
    client = await makeClient();
    Progression.load(keypair.publicKey()); // restores this wallet's own achievement shelf, not a fresh one
    await refreshState(); // throws if not funded yet, or funded but never joined
    $("btnFund").closest(".step").classList.add("step--done");
    $("btnJoin").closest(".step").classList.add("step--done");
    $("setupPanel").style.display = "none";
    $("gamePanel").hidden = false;
  } catch (e) {
    const msg = friendlyError(e.message || "");
    if (msg === "You haven't joined yet.") {
      $("btnFund").textContent = "Funded ✓";
      $("btnFund").disabled = true;
      $("btnFund").closest(".step").classList.add("step--done");
      $("btnJoin").disabled = false;
    } else {
      $("btnFund").disabled = false;
      logLine(`This saved identity isn't funded yet — click "Get funded" to continue. (${msg})`, "error");
    }
  }
}

$("btnFund").addEventListener("click", async () => {
  $("btnFund").disabled = true;
  $("btnFund").textContent = "Funding…";
  try {
    const resp = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(keypair.publicKey())}`);
    if (!resp.ok) throw new Error(`Friendbot HTTP ${resp.status}`);
    $("btnFund").textContent = "Funded ✓";
    $("btnFund").closest(".step").classList.add("step--done");
    ChainSFX.play("funded");
    $("btnJoin").disabled = false;
  } catch (e) {
    $("btnFund").textContent = "Get funded (retry)";
    $("btnFund").disabled = false;
    logLine(`<strong>Friendbot failed:</strong> ${e.message}`, "error");
    ChainSFX.play("error");
  }
});

async function makeClient() {
  return await StellarSdk.contract.Client.from({
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: keypair.publicKey(),
    signTransaction: StellarSdk.contract.basicNodeSigner(keypair, NETWORK_PASSPHRASE).signTransaction,
  });
}

async function call(methodName, args) {
  const tx = await client[methodName](args);
  const sent = await tx.signAndSend();
  return sent;
}

async function refreshState() {
  const tx = await client.get_state({ player: keypair.publicKey() });
  const state = tx.result.value; // get_state returns Result<Player, Error> -> {value: Player} on success
  statusGrid.innerHTML = `
    <div class="tile tile--round">
      <span class="label">Round</span>
      <span class="value">${state.round}<span class="value-unit">/20</span></span>
      <div class="tile-bar"><span style="width:${Math.max(0, Math.min(100, Math.round((state.round / 20) * 100)))}%"></span></div>
    </div>
    <div class="tile"><span class="label">Cash</span><span class="value">${fmtNum(state.cash)}</span></div>
    <div class="tile"><span class="label">Stalls</span><span class="value">${state.stalls}</span></div>
    <div class="tile"><span class="label">Businesses</span><span class="value">${state.businesses}</span></div>
    <div class="tile ${state.loans > 0 ? "tile--alert" : ""}"><span class="label">Loans</span><span class="value">${state.loans}</span></div>
    <div class="tile"><span class="label">Insured</span><span class="value ${state.insured ? "value--good" : "value--muted"}">${state.insured ? "Yes" : "No"}</span></div>`;
  renderActions(state);
  renderOperatorBadge(state);
  Progression.sync(state); // additive: reacts to this already-unwrapped state, doesn't change it
  return state;
}

// Real per-persona rates, mirroring lib.rs's own constants exactly (see
// PERSONAS above for the human-readable version of the same numbers) —
// driven by state.persona (the chain's own answer), not the client's
// local selection, so this can never show a rate that doesn't match what
// take_action will actually do.
function personaRates(personaTag) {
  const isBuilder = personaTag === "Builder";
  return {
    stallCost: isBuilder ? 6 : 8,
    businessCost: isBuilder ? 18 : 24,
    hustleLabel: personaTag === "Hustler" ? "+5" : personaTag === "Gambler" ? "+0 or +6" : "+3",
  };
}

function renderActions(state) {
  actionRow.innerHTML = "";
  if (state.game_over) {
    actionRow.innerHTML = `<div class="game-over"><p><strong>Game over.</strong> Final score: ${state.final_score}, final cash: ${state.bankrupt ? "—" : state.cash}${state.bankrupt ? " (bankrupt)" : ""}</p></div>`;
    return;
  }
  const rates = personaRates(state.persona?.tag);
  const actionCost = { stall: rates.stallCost, business: rates.businessCost };
  const buttons = [];
  if (state.awaiting_roll) {
    buttons.push(["Roll the Storm die 🎲", "roll"]);
  } else {
    if (state.actions_left > 0) {
      buttons.push([`Buy Stall (${rates.stallCost} → +1/rd)`, "stall"]);
      buttons.push([`Buy Business (${rates.businessCost} → +4/rd)`, "business"]);
      buttons.push([`Side Hustle (${rates.hustleLabel})`, "hustle"]);
    }
    buttons.push(["Take loan", "loan"]);
    buttons.push(["Repay loan", "repay"]);
    buttons.push(["Buy insurance", "insure"]);
  }
  for (const [label, action] of buttons) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.classList.add("action-btn");
    if (action === "roll") btn.classList.add("roll-btn");
    if (!state.awaiting_roll && (action === "stall" || action === "business" || action === "hustle")) btn.classList.add("primary", "buy-btn");
    if (action === "loan" || action === "repay" || action === "insure") btn.classList.add("fin-btn");
    const cost = actionCost[action];
    if (cost !== undefined && state.cash < cost) {
      btn.disabled = true;
      btn.title = `Need ${cost} cash — you have ${state.cash}. This action would be rejected by the contract.`;
    }
    btn.addEventListener("click", () => handleAction(action));
    actionRow.appendChild(btn);
  }
}

// Maps the contract's #[contracterror] codes (lib.rs Error enum) to plain
// text, since a rejected simulation surfaces as a raw HostError diagnostic
// dump otherwise — informative to a Rust dev, noise to a player.
const CONTRACT_ERROR_MESSAGES = {
  1: "You've already joined this game.",
  2: "You haven't joined yet.",
  3: "This game is already over.",
  4: "You're bankrupt — this game is over.",
  5: "Roll the Storm die first this round.",
  6: "You already rolled this round.",
  7: "No actions left this round.",
  8: "Not enough cash for that.",
  9: "You've hit the max number of loans.",
  10: "You don't have a loan to repay.",
  11: "You're already insured.",
};

function friendlyError(message) {
  const m = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  if (m && CONTRACT_ERROR_MESSAGES[m[1]]) return CONTRACT_ERROR_MESSAGES[m[1]];
  return message;
}

async function handleAction(action) {
  actionRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const player = keypair.publicKey();
    let sent, label, kind;
    if (action === "roll") {
      sent = await call("roll_and_pay", { player });
      label = `Rolled: <strong>${sent.result.value.tag}</strong>`; // Result<EventRoll, Error> -> {value: {tag}}
      kind = "action";
      Progression.noteRoll(sent.result.value.tag); // reads the same unwrapped tag, doesn't re-unwrap anything
    } else if (action === "stall" || action === "business" || action === "hustle") {
      const actionEnum = action === "stall" ? { tag: "BuyStall", values: void 0 }
        : action === "business" ? { tag: "BuyBusiness", values: void 0 }
        : { tag: "SideHustle", values: void 0 };
      sent = await call("take_action", { player, action: actionEnum });
      label = `Action: <strong>${action}</strong>`;
      kind = "action";
    } else if (action === "loan") {
      sent = await call("take_loan", { player });
      label = "Took a loan";
      kind = "fin";
    } else if (action === "repay") {
      sent = await call("repay_loan", { player });
      label = "Repaid a loan";
      kind = "fin";
    } else if (action === "insure") {
      sent = await call("buy_insurance", { player });
      label = "Bought insurance";
      kind = "fin";
    }
    logLine(`${label} — ${explorerLink(sent.sendTransactionResponse?.hash ?? sent.getTransactionResponse?.txHash ?? "")}`, kind);
    ChainSFX.play("txConfirm");
  } catch (e) {
    logLine(`Error: ${friendlyError(e.message)}`, "error");
    ChainSFX.play("error");
  }
  await refreshState();
}

$("btnJoin").addEventListener("click", async () => {
  $("btnJoin").disabled = true;
  $("btnJoin").textContent = "Entering…";
  try {
    Progression.load(keypair.publicKey()); // reset the achievement shelf for this disposable wallet
    const profile = saveOperatorProfile(keypair.publicKey()); // cosmetic name/avatar, client-only
    client = await makeClient();
    const sent = await call("join", { player: keypair.publicKey(), persona: { tag: selectedPersona, values: void 0 } });
    logLine(`Joined as <strong>${profile.name}</strong> (${selectedPersona}) — ${explorerLink(sent.sendTransactionResponse?.hash ?? "")}`, "join");
    ChainSFX.play("joined");
    Progression.announceJoin(); // fires only after the real join tx above has confirmed
    $("btnJoin").closest(".step").classList.add("step--done");
    $("setupPanel").style.display = "none";
    $("gamePanel").hidden = false;
    await refreshState();
  } catch (e) {
    $("btnJoin").disabled = false;
    $("btnJoin").textContent = "Enter the game (retry)";
    logLine(`Join failed: ${e.message}`, "error");
    ChainSFX.play("error");
  }
});

// ---- leaderboard (reads the separate indexer/API service; never touches the chain) ----
// Deployed backend (Railway), see storm-money-backend's README.
const LEADERBOARD_API = "https://backend-production-fb315.up.railway.app";

function fmtScore(row) {
  if (row.status === "bankrupt") {
    return `<span class="lb-score lb-score--bankrupt">bankrupt, rd ${row.bankrupt_round ?? "?"}</span>`;
  }
  return `<span class="lb-score">${row.final_score}</span>`;
}

function renderLeaderboard(rows) {
  const list = $("lbList");
  if (!rows.length) {
    list.innerHTML = '<div class="lb-empty">No finished games yet — play a full run to the end (or a bankruptcy) to appear here.</div>';
    return;
  }
  list.innerHTML = rows
    .map((row, i) => {
      const shortPlayer = row.player.length > 12 ? `${row.player.slice(0, 6)}…${row.player.slice(-4)}` : row.player;
      return `<div class="lb-row${i === 0 ? " lb-row--top" : ""}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-player" title="${row.player}">${shortPlayer}</span>
        ${fmtScore(row)}
        <span class="lb-status">${row.status}</span>
      </div>`;
    })
    .join("");
}

function renderLbStats(stats) {
  const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
  const num = (x) => (x === null || x === undefined ? "—" : x);
  $("lbStats").innerHTML = `
    <div class="tile"><span class="label">Joined</span><span class="value">${num(stats.joins_total)}</span></div>
    <div class="tile"><span class="label">Completion rate</span><span class="value">${pct(stats.completion_rate)}</span></div>
    <div class="tile"><span class="label">Finished</span><span class="value">${stats.games_total}</span></div>
    <div class="tile"><span class="label">In progress</span><span class="value">${stats.games_in_progress}</span></div>
    <div class="tile"><span class="label">Bankrupt rate</span><span class="value">${pct(stats.bankrupt_rate)}</span></div>
    <div class="tile"><span class="label">Free rate</span><span class="value">${pct(stats.free_rate)}</span></div>
    <div class="tile"><span class="label">Median score</span><span class="value">${num(stats.median_score)}</span></div>
  `;
}

async function refreshLeaderboard() {
  const pill = $("lbPill");
  const dot = $("lbDot");
  const btn = $("btnLbRefresh");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = "Refreshing…";
  try {
    const [lbRes, statsRes] = await Promise.all([
      fetch(`${LEADERBOARD_API}/leaderboard`),
      fetch(`${LEADERBOARD_API}/stats`),
    ]);
    if (!lbRes.ok || !statsRes.ok) throw new Error(`HTTP ${lbRes.status}/${statsRes.status}`);
    const lb = await lbRes.json();
    const stats = await statsRes.json();
    renderLeaderboard(lb.leaderboard);
    renderLbStats(stats);
    pill.textContent = "live · local backend";
    pill.className = "pill pill--live";
    dot.className = "dot dot--live";
  } catch (e) {
    pill.textContent = "backend offline";
    pill.className = "pill pill--offline";
    dot.className = "dot dot--archive";
    $("lbList").innerHTML = `<div class="lb-empty">Can't reach the leaderboard backend at ${LEADERBOARD_API}. Start it with
      <code>cd backend && npm run start</code> (needs Postgres + <code>npm run migrate</code> first —
      see that directory's README) and refresh.</div>`;
    $("lbStats").innerHTML = "";
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

$("btnLbRefresh").addEventListener("click", () => void refreshLeaderboard());
void refreshLeaderboard();
void tryRestoreSession();
