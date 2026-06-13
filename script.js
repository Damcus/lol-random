'use strict';

/* ============ config ============ */

const DD = 'https://ddragon.leagueoflegends.com';
const FALLBACK_VERSION = '15.24.1'; // used only if the version lookup fails
const SETTINGS_KEY = 'lol-random-settings';
const HISTORY_LIMIT = 30;
const STAGGER_MS = 420; // extra spin time per additional card

const CLASSES = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'];

const ROLES = [
  { id: 'top',     label: 'Top' },
  { id: 'jungle',  label: 'Jungle' },
  { id: 'mid',     label: 'Mid' },
  { id: 'adc',     label: 'ADC' },
  { id: 'support', label: 'Support' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.id, r.label]));
const ALL_ROLE_IDS = ROLES.map(r => r.id);

const DIFFS = [
  { id: 'easy',   label: 'Easy',   test: d => d <= 3 },
  { id: 'medium', label: 'Medium', test: d => d >= 4 && d <= 7 },
  { id: 'hard',   label: 'Hard',   test: d => d >= 8 },
];

const SPEEDS = [
  { id: 'slow',    label: 'Slow',    duration: 5200 },
  { id: 'normal',  label: 'Normal',  duration: 3200 },
  { id: 'fast',    label: 'Fast',    duration: 1400 },
  { id: 'instant', label: 'Instant', duration: 0 },
];

const COUNTS = [1, 2, 3, 4, 5];

/* ============ state ============ */

const state = {
  roles: new Set(ALL_ROLE_IDS),
  classes: new Set(CLASSES),
  diffs: new Set(DIFFS.map(d => d.id)),
  count: 1,
  speed: 'normal',
  unique: true,
  sound: true,
};

let version = FALLBACK_VERSION;
let champions = [];   // { id, name, title, tags, difficulty }
let cycleChamps = []; // preloaded subset whose icons flicker during the spin
let rolled = new Set();
let history = [];
let spinning = false;

/* ============ dom ============ */

// The widget renders itself into <div id="lol-generator"></div>, so the same
// files work standalone, in a WordPress Custom HTML block, or via the plugin.
const SHELL = `
  <div id="loader">
    <div class="hex-spinner"></div>
    <p id="loaderText">Summoning the Rift&hellip;</p>
  </div>

  <div class="gen-header">
    <p class="eyebrow">League of Legends</p>
    <h1>Random Champion Generator</h1>
    <p class="tagline">Can't decide? Let fate pick for you.</p>
  </div>

  <div class="gen-main">
    <section class="panel controls" aria-label="Generator settings">
      <div class="control-group">
        <h2>Roles</h2>
        <div class="chips" id="roleChips"></div>
      </div>

      <div class="control-group">
        <h2>Classes</h2>
        <div class="chips" id="classChips"></div>
      </div>

      <div class="control-grid">
        <div class="control-group">
          <h2>Difficulty</h2>
          <div class="chips" id="diffChips"></div>
        </div>
        <div class="control-group">
          <h2>Champions per spin</h2>
          <div class="chips seg" id="countSeg"></div>
        </div>
        <div class="control-group">
          <h2>Spin speed</h2>
          <div class="chips seg" id="speedSeg"></div>
        </div>
      </div>

      <div class="toggles">
        <label class="toggle">
          <input type="checkbox" id="uniqueToggle">
          No repeats until every champion has been rolled
        </label>
        <label class="toggle">
          <input type="checkbox" id="soundToggle">
          Sound effects
        </label>
      </div>
    </section>

    <div class="spin-zone">
      <button id="spinBtn" disabled>Spin</button>
      <p id="statusMsg" aria-live="polite"></p>
    </div>

    <section id="results" class="results" aria-label="Result"></section>

    <section class="panel history-panel" aria-label="Roll history">
      <div class="history-head">
        <h2>History</h2>
        <button id="clearHistoryBtn" class="ghost-btn">Clear</button>
      </div>
      <div id="history" class="history">
        <p class="history-empty">Nothing rolled yet &mdash; hit Spin.</p>
      </div>
    </section>
  </div>

  <div class="gen-footer">
    <p>Fan project &mdash; not affiliated with or endorsed by Riot Games.</p>
    <p>Champion data &amp; images &copy; Riot Games, served via <span id="verLabel">Data Dragon</span>. Role data via Meraki Analytics.</p>
  </div>`;

let root, loaderEl, loaderTextEl, spinBtn, statusEl, resultsEl, historyEl;
const $ = sel => root.querySelector(sel);

/* ============ helpers ============ */

const iconUrl = c => `${DD}/cdn/${version}/img/champion/${c.id}.png`;
const loadingArtUrl = c => `${DD}/cdn/img/champion/loading/${c.id}_0.jpg`;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const randomOf = arr => arr[Math.floor(Math.random() * arr.length)];

/* ============ sound (WebAudio, no files needed) ============ */

let audioCtx = null;
let lastTickAt = 0;

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function blip(freq, startIn, dur, type, vol) {
  const ac = ctx();
  const t = ac.currentTime + startIn;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function playTick() {
  if (!state.sound) return;
  const now = performance.now();
  if (now - lastTickAt < 45) return; // throttle when several cards spin at once
  lastTickAt = now;
  try { blip(620 + Math.random() * 140, 0, 0.045, 'square', 0.025); } catch (e) {}
}

function playDing() {
  if (!state.sound) return;
  try { blip(880, 0, 0.18, 'triangle', 0.06); } catch (e) {}
}

function playFanfare() {
  if (!state.sound) return;
  try {
    blip(523.25, 0,    0.16, 'triangle', 0.07); // C5
    blip(659.25, 0.09, 0.16, 'triangle', 0.07); // E5
    blip(783.99, 0.18, 0.34, 'triangle', 0.08); // G5
  } catch (e) {}
}

/* ============ settings persistence ============ */

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      roles: [...state.roles],
      classes: [...state.classes],
      diffs: [...state.diffs],
      count: state.count,
      speed: state.speed,
      unique: state.unique,
      sound: state.sound,
    }));
  } catch (e) {}
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!s) return;
    if (Array.isArray(s.roles)) state.roles = new Set(s.roles.filter(r => ALL_ROLE_IDS.includes(r)));
    if (Array.isArray(s.classes)) state.classes = new Set(s.classes.filter(c => CLASSES.includes(c)));
    if (Array.isArray(s.diffs)) state.diffs = new Set(s.diffs.filter(d => DIFFS.some(x => x.id === d)));
    // single-select model: anything other than exactly one stored value means "All"
    if (state.roles.size !== 1) state.roles = new Set(ALL_ROLE_IDS);
    if (state.classes.size !== 1) state.classes = new Set(CLASSES);
    if (state.diffs.size !== 1) state.diffs = new Set(DIFFS.map(x => x.id));
    if (COUNTS.includes(s.count)) state.count = s.count;
    if (SPEEDS.some(x => x.id === s.speed)) state.speed = s.speed;
    if (typeof s.unique === 'boolean') state.unique = s.unique;
    if (typeof s.sound === 'boolean') state.sound = s.sound;
  } catch (e) {}
}

/* ============ controls ============ */

function makeChip(label, isOn, onClick) {
  const btn = document.createElement('button');
  btn.className = 'chip' + (isOn() ? ' on' : '');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-pressed', String(isOn()));
  btn.addEventListener('click', () => {
    onClick();
    btn.parentElement.querySelectorAll('.chip').forEach(c => c.dispatchEvent(new Event('sync')));
    saveSettings();
  });
  btn.addEventListener('sync', () => {
    btn.classList.toggle('on', isOn());
    btn.setAttribute('aria-pressed', String(isOn()));
  });
  return btn;
}

// single-select group: "All" selects everything, any other chip selects just itself
function buildFilterGroup(containerSel, items, set, allIds) {
  const container = $(containerSel);
  const allChip = makeChip(
    'All',
    () => set.size === allIds.length,
    () => { set.clear(); allIds.forEach(id => set.add(id)); }
  );
  allChip.classList.add('all');
  container.appendChild(allChip);

  items.forEach(item => container.appendChild(makeChip(
    item.label,
    () => set.size === 1 && set.has(item.id),
    () => { set.clear(); set.add(item.id); }
  )));
}

function buildControls() {
  buildFilterGroup('#roleChips', ROLES, state.roles, ALL_ROLE_IDS);
  buildFilterGroup('#classChips', CLASSES.map(c => ({ id: c, label: c })), state.classes, CLASSES);
  buildFilterGroup('#diffChips', DIFFS, state.diffs, DIFFS.map(d => d.id));

  const countSeg = $('#countSeg');
  COUNTS.forEach(n => countSeg.appendChild(makeChip(
    String(n),
    () => state.count === n,
    () => { state.count = n; }
  )));

  const speedSeg = $('#speedSeg');
  SPEEDS.forEach(s => speedSeg.appendChild(makeChip(
    s.label,
    () => state.speed === s.id,
    () => { state.speed = s.id; }
  )));

  const uniqueToggle = $('#uniqueToggle');
  uniqueToggle.checked = state.unique;
  uniqueToggle.addEventListener('change', () => { state.unique = uniqueToggle.checked; saveSettings(); });

  const soundToggle = $('#soundToggle');
  soundToggle.checked = state.sound;
  soundToggle.addEventListener('change', () => { state.sound = soundToggle.checked; saveSettings(); });

  spinBtn.addEventListener('click', onSpin);
  $('#clearHistoryBtn').addEventListener('click', () => {
    history = [];
    rolled.clear();
    renderHistory();
    setStatus('History cleared.');
  });
}

/* ============ spin flow ============ */

function setStatus(msg) { statusEl.textContent = msg; }

function flashInvalid(msg) {
  setStatus(msg);
  spinBtn.classList.remove('shake');
  void spinBtn.offsetWidth; // restart the animation
  spinBtn.classList.add('shake');
}

function filteredChampions() {
  return champions.filter(c =>
    c.roles.some(r => state.roles.has(r)) &&
    c.tags.some(t => state.classes.has(t)) &&
    DIFFS.some(d => state.diffs.has(d.id) && d.test(c.difficulty))
  );
}

function onSpin() {
  if (spinning || !champions.length) return;

  const filtered = filteredChampions();
  if (!filtered.length) {
    flashInvalid('No champions match this filter combination — try a different role, class or difficulty.');
    return;
  }

  let pool = filtered;
  let note = '';
  if (state.unique) {
    pool = filtered.filter(c => !rolled.has(c.id));
    if (pool.length < Math.min(state.count, filtered.length)) {
      rolled.clear();
      pool = filtered;
      note = 'Every matching champion has been rolled — starting the pool over. ';
    }
  }

  const count = Math.min(state.count, pool.length);
  if (count < state.count) note += `Only ${pool.length} champion${pool.length === 1 ? '' : 's'} match your filters. `;

  const picks = shuffle([...pool]).slice(0, count);
  picks.forEach(c => rolled.add(c.id));
  runSpin(picks, note);
}

function runSpin(picks, note) {
  spinning = true;
  spinBtn.disabled = true;
  setStatus('');

  // warm the cache for the final reveals while the reels are still spinning
  picks.forEach(c => {
    new Image().src = loadingArtUrl(c);
    new Image().src = iconUrl(c);
  });

  const baseDuration = SPEEDS.find(s => s.id === state.speed).duration;
  resultsEl.innerHTML = '';
  resultsEl.dataset.count = String(picks.length);

  let finished = 0;
  picks.forEach((champ, i) => {
    const card = makeSpinCard();
    resultsEl.appendChild(card);
    const duration = baseDuration === 0 ? 0 : baseDuration + i * STAGGER_MS;
    spinCard(card, duration, () => {
      revealCard(card, champ);
      if (duration > 0) playDing();
      if (++finished === picks.length) finishSpin(picks, note);
    });
  });
}

function makeSpinCard() {
  const card = document.createElement('article');
  card.className = 'card';
  const seed = randomOf(cycleChamps);
  card.innerHTML = `
    <div class="card-art spin-stage">
      <img class="spin-icon" src="${iconUrl(seed)}" alt="">
      <p class="spin-name">${seed.name}</p>
    </div>`;
  return card;
}

function spinCard(card, duration, onDone) {
  if (duration <= 0) { onDone(); return; }
  const img = card.querySelector('.spin-icon');
  const nameEl = card.querySelector('.spin-name');
  const start = performance.now();

  (function step() {
    const p = (performance.now() - start) / duration;
    if (p >= 1) { onDone(); return; }
    const c = randomOf(cycleChamps);
    img.src = iconUrl(c);
    nameEl.textContent = c.name;
    playTick();
    // ticks start rapid and slow down as the reel comes to rest
    setTimeout(step, 55 + 400 * p * p * p);
  })();
}

function revealCard(card, c) {
  card.innerHTML = `
    <div class="card-art">
      <img src="${loadingArtUrl(c)}" alt="${c.name}">
    </div>
    <div class="card-info">
      <h3>${c.name}</h3>
      <p class="card-title">${c.title}</p>
      <span class="card-roles">${c.roles.length === ALL_ROLE_IDS.length ? 'Any role' : c.roles.map(r => ROLE_LABEL[r]).join(' &middot; ')}</span>
      <span class="card-tags">${c.tags.join(' &middot; ')}</span>
      <div class="card-diff" title="Difficulty ${c.difficulty}/10">
        <span>Difficulty</span>
        <span class="diff-bar"><i style="width:${c.difficulty * 10}%"></i></span>
      </div>
    </div>`;
  card.classList.add('revealed');
}

function finishSpin(picks, note) {
  spinning = false;
  spinBtn.disabled = false;
  playFanfare();
  history = [...picks, ...history].slice(0, HISTORY_LIMIT);
  renderHistory();
  setStatus(note + 'You got: ' + picks.map(c => c.name).join(', '));
}

/* ============ history ============ */

function renderHistory() {
  historyEl.innerHTML = '';
  if (!history.length) {
    historyEl.innerHTML = '<p class="history-empty">Nothing rolled yet &mdash; hit Spin.</p>';
    return;
  }
  history.forEach(c => {
    const img = document.createElement('img');
    img.src = iconUrl(c);
    img.alt = c.name;
    img.title = c.name;
    historyEl.appendChild(img);
  });
}

/* ============ boot ============ */

function showLoadError() {
  loaderTextEl.innerHTML =
    'Could not reach Riot’s Data Dragon servers.<br>Check your internet connection and try again.';
  const retry = document.createElement('button');
  retry.className = 'chip retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => location.reload());
  loaderEl.appendChild(retry);
}

async function init() {
  loadSettings();
  buildControls();

  try {
    const versions = await fetchJson(`${DD}/api/versions.json`);
    version = versions[0];
  } catch (e) { /* fall back to the pinned version */ }

  try {
    const data = await fetchJson(`${DD}/cdn/${version}/data/en_US/champion.json`);
    const roleMap = typeof CHAMPION_ROLES === 'object' && CHAMPION_ROLES ? CHAMPION_ROLES : {};
    champions = Object.values(data.data).map(c => ({
      id: c.id, // image key, e.g. "MonkeyKing"
      name: c.name, // display name, e.g. "Wukong"
      title: c.title,
      tags: c.tags,
      difficulty: c.info.difficulty,
      roles: roleMap[c.id] || ALL_ROLE_IDS, // champions newer than roles.js get every role
    }));
  } catch (e) {
    showLoadError();
    return;
  }

  // preload a pool of icons so the reel animation never flickers on empty images
  cycleChamps = shuffle([...champions]).slice(0, 28);
  cycleChamps.forEach(c => { new Image().src = iconUrl(c); });

  $('#verLabel').textContent = `Data Dragon ${version}`;
  spinBtn.disabled = false;
  loaderEl.classList.add('hidden');
}

function boot() {
  root = document.getElementById('lol-generator');
  if (!root) return;
  root.classList.add('lolgen');
  root.innerHTML = SHELL;
  loaderEl = $('#loader');
  loaderTextEl = $('#loaderText');
  spinBtn = $('#spinBtn');
  statusEl = $('#statusMsg');
  resultsEl = $('#results');
  historyEl = $('#history');
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
