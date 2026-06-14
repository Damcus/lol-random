# Random Champion & Agent Generator — LoL + VALORANT

A static website that picks a random **League of Legends** champion or **VALORANT** agent for you,
slot-machine style. Two games, two themes, one tab switcher.

## Features

- **Two games** — tab between a League of Legends champion roller and a VALORANT agent roller,
  each in its own theme (Hextech gold for LoL, the red/teal Valorant look for VALORANT)
- **Spin speed** — Slow / Normal / Fast / Instant reel animation
- **Filters** (single-select with an "All" option):
  - LoL: Role (Top / Jungle / Mid / ADC / Support), Class, and Difficulty
  - VALORANT: Role (Duelist / Initiator / Controller / Sentinel)
- **1–5 per spin** — roll a whole team at once
- **No-repeats mode** — won't roll the same pick again until the whole filtered pool has been used
- **Sound effects** — WebAudio ticks and a fanfare, with a mute toggle
- **Roll history** — the last 30 results as icons
- Settings are remembered per game between visits (localStorage)

## Running it

Just open `index.html` in a browser — no build step or server needed. An internet connection is
required: data and images are fetched live, so both rosters stay up to date automatically as new
champions/agents release.

- League of Legends data & art: [Riot's Data Dragon CDN](https://developer.riotgames.com/docs/lol#data-dragon)
- VALORANT data & art: [valorant-api.com](https://valorant-api.com/) (community, CORS-enabled)

Optionally serve it locally:

```
npx serve .
```

## How the code is organized

The two generators share one engine, so there's no duplicated spin/filter/history logic:

| File           | Role |
|----------------|------|
| `engine.js`    | `createGenerator(config)` — all game-agnostic logic (spin, filters, sound, history, settings) |
| `lol.js`       | League of Legends config (Data Dragon loader, filters, card layout) |
| `valorant.js`  | VALORANT config (valorant-api.com loader, filters, card layout) |
| `roles.js`     | Generated LoL champion → lane/role map (see below) |
| `app.js`       | Tab switcher; lazily starts each generator the first time its tab is opened |
| `style.css`    | Shared structure under `.rcg`, with per-game themes `.rcg.t-lol` / `.rcg.t-val` |
| `index.html`   | Tab bar + the two mount points (`#lol-generator`, `#val-generator`) |

To add a third game, write one more config file and add a tab — no engine changes needed.

## Using it in WordPress

Each generator renders into a `<div>` and all CSS is scoped so it won't fight with a theme.
`build-wordpress.ps1` packages two ready-made options into the `wordpress\` folder:

**Option A — Custom HTML block (quickest)**

1. Open `wordpress\custom-html-block.html` in a text editor and copy the whole file (Ctrl+A, Ctrl+C).
2. In the WordPress editor, add a **Custom HTML** block to your page and paste everything into it.
3. Preview / publish. Done.

You must be logged in as an **Administrator**, otherwise WordPress strips `<script>` tags.
Note: wordpress.com free/personal plans block JavaScript entirely — that's why a pasted snippet shows
up as raw text there. You need self-hosted WordPress (or the wordpress.com Business plan). For a free
host that just works, drop the `deploy\` folder onto [Netlify Drop](https://app.netlify.com/drop).

**Option B — Plugin with a shortcode (cleanest)**

1. WordPress admin → **Plugins → Add New → Upload Plugin**.
2. Choose `wordpress\lol-champion-generator.zip`, click **Install Now**, then **Activate**.
3. Put the shortcode `[champion_agent_generator]` on any page or post.

After changing the source files or regenerating roles, rerun:

```
.\build-wordpress.ps1
```

and re-paste the snippet (Option A) or re-upload the zip (Option B).

## Updating LoL role data

Lane/role assignments live in `roles.js`, generated from per-position play-rate data
(Riot Data Dragon + [Meraki Analytics](https://merakianalytics.com/) — that feed doesn't
allow browser CORS, so it's baked into a local file instead of fetched at runtime).
To refresh it after new patches or champion releases, run:

```
.\generate-roles.ps1
```

Champions missing from `roles.js` automatically count as every role, so the site
keeps working even when the file is out of date. (VALORANT roles come straight from the
API, so they need no generation step.)

## Disclaimer

Fan project — not affiliated with or endorsed by Riot Games.
Champion/agent data and images © Riot Games.
