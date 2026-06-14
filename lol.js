'use strict';

/* League of Legends config for the shared generator engine.
   Champion data & images come from Riot's Data Dragon CDN; role
   assignments come from the locally generated CHAMPION_ROLES (roles.js). */

const DD = 'https://ddragon.leagueoflegends.com';
const LOL_FALLBACK_VERSION = '15.24.1'; // used only if the version lookup fails

const LOL_CLASSES = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'];

const LOL_ROLES = [
  { id: 'top',     label: 'Top' },
  { id: 'jungle',  label: 'Jungle' },
  { id: 'mid',     label: 'Mid' },
  { id: 'adc',     label: 'ADC' },
  { id: 'support', label: 'Support' },
];
const LOL_ROLE_LABEL = Object.fromEntries(LOL_ROLES.map(r => [r.id, r.label]));
const LOL_ROLE_IDS = LOL_ROLES.map(r => r.id);

function lolDifficultyBucket(d) {
  return d <= 3 ? 'easy' : d <= 7 ? 'medium' : 'hard';
}

const LOL_CONFIG = {
  key: 'lol',
  mountId: 'lol-generator',
  themeClass: 't-lol',

  eyebrow: 'League of Legends',
  title: 'Random Champion Generator',
  tagline: "Can't decide? Let fate pick for you.",
  noun: 'champion',
  nounPlural: 'champions',
  nounTitle: 'Champions',
  spinLabel: 'Spin',

  loadingText: 'Summoning the Rift&hellip;',
  errorText: 'Could not reach Riot’s Data Dragon servers.<br>Check your internet connection and try again.',
  footerHtml:
    '<p>Fan project &mdash; not affiliated with or endorsed by Riot Games.</p>' +
    '<p>Champion data &amp; images &copy; Riot Games, served via <span class="gen-footer-note">Data Dragon</span>. Role data via Meraki Analytics.</p>',

  filters: [
    { id: 'roles', label: 'Roles', row: 'full', options: LOL_ROLES },
    { id: 'classes', label: 'Classes', row: 'full', options: LOL_CLASSES.map(c => ({ id: c, label: c })) },
    { id: 'difficulty', label: 'Difficulty', row: 'grid', options: [
      { id: 'easy', label: 'Easy' },
      { id: 'medium', label: 'Medium' },
      { id: 'hard', label: 'Hard' },
    ] },
  ],

  iconUrl: it => it.icon,
  artUrl: it => it.art,

  async loadData(api) {
    let version = LOL_FALLBACK_VERSION;
    try {
      const versions = await api.fetchJson(`${DD}/api/versions.json`);
      version = versions[0];
    } catch (e) { /* fall back to the pinned version */ }

    const data = await api.fetchJson(`${DD}/cdn/${version}/data/en_US/champion.json`);
    const roleMap = (typeof CHAMPION_ROLES === 'object' && CHAMPION_ROLES) ? CHAMPION_ROLES : {};
    api.setNote(`Data Dragon ${version}`);

    return Object.values(data.data).map(c => {
      const roles = roleMap[c.id] || LOL_ROLE_IDS; // champions newer than roles.js get every role
      return {
        id: c.id,       // image key, e.g. "MonkeyKing"
        name: c.name,   // display name, e.g. "Wukong"
        title: c.title,
        icon: `${DD}/cdn/${version}/img/champion/${c.id}.png`,
        art: `${DD}/cdn/img/champion/loading/${c.id}_0.jpg`,
        difficulty: c.info.difficulty,
        tags: c.tags,
        roles,
        filters: {
          roles,
          classes: c.tags,
          difficulty: [lolDifficultyBucket(c.info.difficulty)],
        },
      };
    });
  },

  cardInfoHtml: it => `
    <h3>${it.name}</h3>
    <p class="card-title">${it.title}</p>
    <span class="card-roles">${it.roles.length === LOL_ROLE_IDS.length ? 'Any role' : it.roles.map(r => LOL_ROLE_LABEL[r]).join(' &middot; ')}</span>
    <span class="card-tags">${it.tags.join(' &middot; ')}</span>
    <div class="card-diff" title="Difficulty ${it.difficulty}/10">
      <span>Difficulty</span>
      <span class="diff-bar"><i style="width:${it.difficulty * 10}%"></i></span>
    </div>`,
};
