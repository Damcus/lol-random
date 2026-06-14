'use strict';

/* VALORANT config for the shared generator engine.
   Agent data & images come from the community valorant-api.com
   (CORS-enabled, refreshes itself with each patch). */

const VAL_API = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true';

const VAL_ROLES = [
  { id: 'Duelist',    label: 'Duelist' },
  { id: 'Initiator',  label: 'Initiator' },
  { id: 'Controller', label: 'Controller' },
  { id: 'Sentinel',   label: 'Sentinel' },
];

const VAL_CONFIG = {
  key: 'val',
  mountId: 'val-generator',
  themeClass: 't-val',

  eyebrow: 'VALORANT',
  title: 'Random Agent Generator',
  tagline: 'Lock in whatever fate hands you.',
  noun: 'agent',
  nounPlural: 'agents',
  nounTitle: 'Agents',
  spinLabel: 'Spin',

  loadingText: 'Loading agents&hellip;',
  errorText: 'Could not reach the VALORANT agent data (valorant-api.com).<br>Check your internet connection and try again.',
  footerHtml:
    '<p>Fan project &mdash; not affiliated with or endorsed by Riot Games.</p>' +
    '<p>Agent data &amp; images &copy; Riot Games, served via <span class="gen-footer-note">valorant-api.com</span>.</p>',

  filters: [
    { id: 'roles', label: 'Roles', row: 'full', options: VAL_ROLES },
  ],

  iconUrl: it => it.icon,
  artUrl: it => it.art,

  // each agent ships its own two-stop gradient — use it behind the portrait
  artBackground: it => (it.colors && it.colors.length >= 2)
    ? `radial-gradient(circle at 50% 32%, ${it.colors[0]}, ${it.colors[it.colors.length - 1]})`
    : 'var(--card-art-bg)',

  async loadData(api) {
    const res = await api.fetchJson(VAL_API);
    return res.data.map(a => {
      const role = a.role ? a.role.displayName : 'Unknown';
      const colors = (a.backgroundGradientColors || []).map(h => '#' + h.slice(0, 6));
      return {
        id: a.uuid,
        name: a.displayName,
        role,
        desc: a.description,
        icon: a.displayIcon,
        art: a.fullPortrait || a.displayIcon,
        colors,
        filters: { roles: [role] },
      };
    });
  },

  cardInfoHtml: it => `
    <h3>${it.name}</h3>
    <p class="card-title">${it.role}</p>
    <span class="card-roles">${it.role}</span>
    <p class="card-desc">${it.desc || ''}</p>`,
};
