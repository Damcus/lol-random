'use strict';

/* Wires the game tabs to the two generators. Each generator is only
   started the first time its tab is opened (so the page doesn't hit
   both APIs up front), and the page theme follows the active tab. */

(function () {
  const CONFIGS = {
    'lol-generator': typeof LOL_CONFIG !== 'undefined' ? LOL_CONFIG : null,
    'val-generator': typeof VAL_CONFIG !== 'undefined' ? VAL_CONFIG : null,
  };

  const tabs = Array.from(document.querySelectorAll('.rcg-tab'));
  const panels = {};
  tabs.forEach(t => { panels[t.dataset.target] = document.getElementById(t.dataset.target); });

  const started = {};

  function activate(targetId, theme) {
    Object.keys(panels).forEach(id => { if (panels[id]) panels[id].hidden = id !== targetId; });
    tabs.forEach(t => {
      const on = t.dataset.target === targetId;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (theme) document.body.dataset.theme = theme;

    if (!started[targetId] && CONFIGS[targetId] && panels[targetId]) {
      started[targetId] = true;
      createGenerator(Object.assign({ mount: panels[targetId] }, CONFIGS[targetId])).start();
    }
  }

  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.target, t.dataset.theme)));

  if (tabs.length) {
    activate(tabs[0].dataset.target, tabs[0].dataset.theme);
  } else {
    // no tab bar (e.g. a single-game embed): start whichever mount exists
    Object.keys(CONFIGS).forEach(id => {
      const el = document.getElementById(id);
      if (el && CONFIGS[id]) createGenerator(Object.assign({ mount: el }, CONFIGS[id])).start();
    });
  }
})();
