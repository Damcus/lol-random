'use strict';

/* ============================================================
   Shared random-pick generator engine.
   createGenerator(config) builds one self-contained instance
   (League of Legends or VALORANT) that renders itself into
   config.mount. Each instance keeps its own state, so multiple
   generators can live on the same page without interfering.
   ============================================================ */

const HISTORY_LIMIT = 30;
const STAGGER_MS = 420; // extra spin time per additional card
const COUNTS = [1, 2, 3, 4, 5];
const SPEEDS = [
  { id: 'slow',    label: 'Slow',    duration: 5200 },
  { id: 'normal',  label: 'Normal',  duration: 3200 },
  { id: 'fast',    label: 'Fast',    duration: 1400 },
  { id: 'instant', label: 'Instant', duration: 0 },
];

/* ---------- generic helpers ---------- */

function rcgShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rcgRandom = arr => arr[Math.floor(Math.random() * arr.length)];

async function rcgFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

/* ---------- sound (WebAudio, shared, no files needed) ---------- */

let audioCtx = null;
let lastTickAt = 0;

function audioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function blip(freq, startIn, dur, type, vol) {
  const ac = audioContext();
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

function playTick(on) {
  if (!on) return;
  const now = performance.now();
  if (now - lastTickAt < 45) return; // throttle when several cards spin at once
  lastTickAt = now;
  try { blip(620 + Math.random() * 140, 0, 0.045, 'square', 0.025); } catch (e) {}
}

function playDing(on) {
  if (!on) return;
  try { blip(880, 0, 0.18, 'triangle', 0.06); } catch (e) {}
}

function playFanfare(on) {
  if (!on) return;
  try {
    blip(523.25, 0,    0.16, 'triangle', 0.07); // C5
    blip(659.25, 0.09, 0.16, 'triangle', 0.07); // E5
    blip(783.99, 0.18, 0.34, 'triangle', 0.08); // G5
  } catch (e) {}
}

/* ============================================================
   The factory
   ============================================================ */

function createGenerator(config) {
  const SETTINGS_KEY = 'rcg-' + config.key;

  const state = {
    filters: {}, // { filterId: Set(optionIds) }
    count: 1,
    speed: 'normal',
    unique: true,
    sound: true,
  };
  config.filters.forEach(f => { state.filters[f.id] = new Set(f.options.map(o => o.id)); });

  let root, loaderEl, loaderTextEl, spinBtn, statusEl, resultsEl, historyEl;
  let items = [];
  let cyclePool = []; // preloaded subset whose icons flicker during the spin
  let rolled = new Set();
  let history = [];
  let spinning = false;

  const $ = sel => root.querySelector(sel);
  const iconUrl = it => config.iconUrl(it);
  const artUrl = it => config.artUrl(it);

  const api = {
    fetchJson: rcgFetchJson,
    shuffle: rcgShuffle,
    setNote: text => { const el = $('.gen-footer-note'); if (el) el.textContent = text; },
  };

  /* ---------- markup ---------- */

  function buildShell() {
    const group = f => `
        <div class="control-group">
          <h2>${f.label}</h2>
          <div class="chips" data-filter="${f.id}"></div>
        </div>`;
    const fullGroups = config.filters.filter(f => f.row !== 'grid').map(group).join('');
    const gridGroups = config.filters.filter(f => f.row === 'grid').map(group).join('');

    return `
  <div class="gen-loader">
    <div class="hex-spinner"></div>
    <p class="gen-loader-text">${config.loadingText}</p>
  </div>

  <div class="gen-header">
    <p class="eyebrow">${config.eyebrow}</p>
    <h1>${config.title}</h1>
    <p class="tagline">${config.tagline}</p>
  </div>

  <div class="gen-main">
    <section class="panel controls" aria-label="Generator settings">
      ${fullGroups}
      <div class="control-grid">
        ${gridGroups}
        <div class="control-group">
          <h2>${config.nounTitle} per spin</h2>
          <div class="chips seg" data-seg="count"></div>
        </div>
        <div class="control-group">
          <h2>Spin speed</h2>
          <div class="chips seg" data-seg="speed"></div>
        </div>
      </div>

      <div class="toggles">
        <label class="toggle">
          <input type="checkbox" class="unique-toggle">
          No repeats until every ${config.noun} has been rolled
        </label>
        <label class="toggle">
          <input type="checkbox" class="sound-toggle">
          Sound effects
        </label>
      </div>
    </section>

    <div class="spin-zone">
      <button class="spin-btn" disabled>${config.spinLabel || 'Spin'}</button>
      <p class="status-msg" aria-live="polite"></p>
    </div>

    <section class="results" aria-label="Result"></section>

    <section class="panel history-panel" aria-label="Roll history">
      <div class="history-head">
        <h2>History</h2>
        <button class="clear-history ghost-btn">Clear</button>
      </div>
      <div class="history">
        <p class="history-empty">Nothing rolled yet &mdash; hit ${config.spinLabel || 'Spin'}.</p>
      </div>
    </section>
  </div>

  <div class="gen-footer">${config.footerHtml}</div>`;
  }

  /* ---------- controls ---------- */

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
  function buildFilterGroup(container, options, set) {
    const allIds = options.map(o => o.id);
    const allChip = makeChip(
      'All',
      () => set.size === allIds.length,
      () => { set.clear(); allIds.forEach(id => set.add(id)); }
    );
    allChip.classList.add('all');
    container.appendChild(allChip);

    options.forEach(o => container.appendChild(makeChip(
      o.label,
      () => set.size === 1 && set.has(o.id),
      () => { set.clear(); set.add(o.id); }
    )));
  }

  function buildControls() {
    config.filters.forEach(f => {
      buildFilterGroup(root.querySelector(`.chips[data-filter="${f.id}"]`), f.options, state.filters[f.id]);
    });

    const countSeg = root.querySelector('.chips[data-seg="count"]');
    COUNTS.forEach(n => countSeg.appendChild(makeChip(String(n), () => state.count === n, () => { state.count = n; })));

    const speedSeg = root.querySelector('.chips[data-seg="speed"]');
    SPEEDS.forEach(s => speedSeg.appendChild(makeChip(s.label, () => state.speed === s.id, () => { state.speed = s.id; })));

    const uniqueToggle = $('.unique-toggle');
    uniqueToggle.checked = state.unique;
    uniqueToggle.addEventListener('change', () => { state.unique = uniqueToggle.checked; saveSettings(); });

    const soundToggle = $('.sound-toggle');
    soundToggle.checked = state.sound;
    soundToggle.addEventListener('change', () => { state.sound = soundToggle.checked; saveSettings(); });

    spinBtn.addEventListener('click', onSpin);
    $('.clear-history').addEventListener('click', () => {
      history = [];
      rolled.clear();
      renderHistory();
      setStatus('History cleared.');
    });
  }

  /* ---------- settings persistence ---------- */

  function saveSettings() {
    try {
      const filters = {};
      config.filters.forEach(f => { filters[f.id] = [...state.filters[f.id]]; });
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        filters, count: state.count, speed: state.speed, unique: state.unique, sound: state.sound,
      }));
    } catch (e) {}
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (!s) return;
      if (s.filters) config.filters.forEach(f => {
        const allIds = f.options.map(o => o.id);
        const saved = Array.isArray(s.filters[f.id]) ? s.filters[f.id].filter(id => allIds.includes(id)) : null;
        // single-select model: exactly one saved value means that one, anything else means "All"
        state.filters[f.id] = (saved && saved.length === 1) ? new Set(saved) : new Set(allIds);
      });
      if (COUNTS.includes(s.count)) state.count = s.count;
      if (SPEEDS.some(x => x.id === s.speed)) state.speed = s.speed;
      if (typeof s.unique === 'boolean') state.unique = s.unique;
      if (typeof s.sound === 'boolean') state.sound = s.sound;
    } catch (e) {}
  }

  /* ---------- spin flow ---------- */

  function setStatus(msg) { statusEl.textContent = msg; }

  function flashInvalid(msg) {
    setStatus(msg);
    spinBtn.classList.remove('shake');
    void spinBtn.offsetWidth; // restart the animation
    spinBtn.classList.add('shake');
  }

  function matches(it) {
    return config.filters.every(f => {
      const sel = state.filters[f.id];
      const vals = it.filters[f.id] || [];
      return vals.some(v => sel.has(v));
    });
  }

  function onSpin() {
    if (spinning || !items.length) return;

    const filtered = items.filter(matches);
    if (!filtered.length) {
      flashInvalid(`No ${config.nounPlural} match this combination — try different filters.`);
      return;
    }

    let pool = filtered;
    let note = '';
    if (state.unique) {
      pool = filtered.filter(it => !rolled.has(it.id));
      if (pool.length < Math.min(state.count, filtered.length)) {
        rolled.clear();
        pool = filtered;
        note = `Every matching ${config.noun} has been rolled — starting the pool over. `;
      }
    }

    const count = Math.min(state.count, pool.length);
    if (count < state.count) note += `Only ${pool.length} ${pool.length === 1 ? config.noun : config.nounPlural} match your filters. `;

    const picks = rcgShuffle([...pool]).slice(0, count);
    picks.forEach(it => rolled.add(it.id));
    runSpin(picks, note);
  }

  function runSpin(picks, note) {
    spinning = true;
    spinBtn.disabled = true;
    setStatus('');

    // warm the cache for the final reveals while the reels are still spinning
    picks.forEach(it => {
      new Image().src = artUrl(it);
      new Image().src = iconUrl(it);
    });

    const baseDuration = SPEEDS.find(s => s.id === state.speed).duration;
    resultsEl.innerHTML = '';
    resultsEl.dataset.count = String(picks.length);

    let finished = 0;
    picks.forEach((pick, i) => {
      const card = makeSpinCard();
      resultsEl.appendChild(card);
      const duration = baseDuration === 0 ? 0 : baseDuration + i * STAGGER_MS;
      spinCard(card, duration, () => {
        revealCard(card, pick);
        if (duration > 0) playDing(state.sound);
        if (++finished === picks.length) finishSpin(picks, note);
      });
    });
  }

  function makeSpinCard() {
    const card = document.createElement('article');
    card.className = 'card';
    const seed = rcgRandom(cyclePool);
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
      const it = rcgRandom(cyclePool);
      img.src = iconUrl(it);
      nameEl.textContent = it.name;
      playTick(state.sound);
      // ticks start rapid and slow down as the reel comes to rest
      setTimeout(step, 55 + 400 * p * p * p);
    })();
  }

  function revealCard(card, it) {
    const bg = config.artBackground ? ` style="background:${config.artBackground(it)}"` : '';
    card.innerHTML = `
      <div class="card-art"${bg}>
        <img src="${artUrl(it)}" alt="${it.name}">
      </div>
      <div class="card-info">${config.cardInfoHtml(it)}</div>`;
    card.classList.add('revealed');
  }

  function finishSpin(picks, note) {
    spinning = false;
    spinBtn.disabled = false;
    playFanfare(state.sound);
    history = [...picks, ...history].slice(0, HISTORY_LIMIT);
    renderHistory();
    setStatus(note + 'You got: ' + picks.map(it => it.name).join(', '));
  }

  /* ---------- history ---------- */

  function renderHistory() {
    historyEl.innerHTML = '';
    if (!history.length) {
      historyEl.innerHTML = `<p class="history-empty">Nothing rolled yet &mdash; hit ${config.spinLabel || 'Spin'}.</p>`;
      return;
    }
    history.forEach(it => {
      const img = document.createElement('img');
      img.src = iconUrl(it);
      img.alt = it.name;
      img.title = it.name;
      historyEl.appendChild(img);
    });
  }

  /* ---------- boot ---------- */

  function showLoadError() {
    loaderTextEl.innerHTML = config.errorText;
    const retry = document.createElement('button');
    retry.className = 'chip retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      retry.remove();
      loaderTextEl.innerHTML = config.loadingText;
      loaderEl.classList.remove('hidden');
      loadData();
    });
    loaderEl.appendChild(retry);
  }

  async function loadData() {
    try {
      items = await config.loadData(api);
    } catch (e) {
      showLoadError();
      return;
    }
    if (!items.length) { showLoadError(); return; }

    // preload a pool of icons so the reel animation never flickers on empty images
    cyclePool = rcgShuffle([...items]).slice(0, 28);
    cyclePool.forEach(it => { new Image().src = iconUrl(it); });

    spinBtn.disabled = false;
    loaderEl.classList.add('hidden');
  }

  function start() {
    root = config.mount || document.getElementById(config.mountId);
    if (!root) return;
    root.classList.add('rcg', config.themeClass);
    root.innerHTML = buildShell();
    loaderEl = $('.gen-loader');
    loaderTextEl = $('.gen-loader-text');
    spinBtn = $('.spin-btn');
    statusEl = $('.status-msg');
    resultsEl = $('.results');
    historyEl = $('.history');
    loadSettings();
    buildControls();
    loadData();
  }

  return { start };
}
