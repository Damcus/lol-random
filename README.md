# Random LoL Champion Generator

A static website that picks a random League of Legends champion for you, slot-machine style.

## Features

- **Spin speed** — Slow / Normal / Fast / Instant reel animation
- **Role filter** — All, or exactly one of Top / Jungle / Mid / ADC / Support (derived from real per-position play rates)
- **Class filter** — All, or one of Assassin / Fighter / Mage / Marksman / Support / Tank
- **Difficulty filter** — All, or Easy / Medium / Hard (based on Riot's 1–10 rating)
- **1–5 champions per spin** — roll a whole team at once
- **No-repeats mode** — won't roll the same champion twice until the whole pool has been used
- **Sound effects** — WebAudio ticks and a fanfare, with a mute toggle
- **Roll history** — the last 30 results as icons
- Settings are remembered between visits (localStorage)

## Running it

Just open `index.html` in a browser — no build step or server needed.
An internet connection is required: champion names, portraits, and splash art are fetched live
from [Riot's Data Dragon CDN](https://developer.riotgames.com/docs/lol#data-dragon),
so the champion list stays up to date automatically when new champions release.

Optionally serve it locally:

```
npx serve .
```

## Using it in WordPress

The whole app renders itself into a single `<div id="lol-generator"></div>`, and all CSS is
scoped so it won't fight with a theme. `build-wordpress.ps1` packages two ready-made options
into the `wordpress\` folder:

**Option A — Custom HTML block (quickest)**

1. Open `wordpress\custom-html-block.html` in a text editor and copy the whole file (Ctrl+A, Ctrl+C).
2. In the WordPress editor, add a **Custom HTML** block to your page and paste everything into it.
3. Preview / publish. Done.

You must be logged in as an **Administrator**, otherwise WordPress strips `<script>` tags.
Note: wordpress.com free/personal plans block JavaScript entirely — you need self-hosted
WordPress (or the wordpress.com Business plan).

**Option B — Plugin with a shortcode (cleanest)**

1. WordPress admin → **Plugins → Add New → Upload Plugin**.
2. Choose `wordpress\lol-champion-generator.zip`, click **Install Now**, then **Activate**.
3. Put the shortcode `[lol_champion_generator]` on any page or post.

After changing the source files or regenerating roles, rerun:

```
.\build-wordpress.ps1
```

and re-paste the snippet (Option A) or re-upload the zip (Option B).

## Updating role data

Lane/role assignments live in `roles.js`, generated from per-position play-rate data
(Riot Data Dragon + [Meraki Analytics](https://merakianalytics.com/) — that feed doesn't
allow browser CORS, so it's baked into a local file instead of fetched at runtime).
To refresh it after new patches or champion releases, run:

```
.\generate-roles.ps1
```

Champions missing from `roles.js` automatically count as every role, so the site
keeps working even when the file is out of date.

## Disclaimer

Fan project — not affiliated with or endorsed by Riot Games.
Champion data and images © Riot Games.
