# Dark Souls 3 Cheat Sheet

To view the cheat sheet [click here](http://zkjellberg.github.io/dark-souls-3-cheat-sheet/).

This checklist was created by adopting the source code from the [Dark Souls 2 Cheat Sheet](https://github.com/smcnabb/dark-souls-2-cheat-sheet/tree/gh-pages) created by [Stephen McNabb](https://github.com/smcnabb).

The walkthrough is thanks to [DeathGodGarra's NPC Side Quests Guide V2](https://www.gamefaqs.com/boards/168566-dark-souls-iii/73599466).

## Project structure

The site is a static, no-build page (works on GitHub Pages) with **no external
dependencies** — Bootstrap 5, Bootstrap Icons, and everything else are vendored
under `vendor/`. There is no jQuery.

| Path | Purpose |
|--- |--- |
| `index.html` | Page shell (nav, filter toolbar, tabs, modals, options) |
| `data/checklist.json` | **All checklist content** — this is what contributors edit |
| `js/render.js` | Renders `data/checklist.json` into the page |
| `js/main.js` | App logic (progress, profiles, filters, search, themes) |
| `css/main.css` | Custom styles |
| `vendor/` | Self-hosted Bootstrap 5 + Bootstrap Icons |
| `tools/extract-content.mjs` | One-off script that generated the JSON from the old HTML |

To run locally, serve the folder over HTTP (the page fetches the JSON), e.g.
`python -m http.server` and open <http://localhost:8000>. Opening `index.html`
directly from disk will not load the checklist because browsers block `fetch`
on `file://`.

## Contribution Guide

If you are interested in contributing to this guide, I welcome Pull Requests.

Checklist entries now live in [`data/checklist.json`](data/checklist.json)
instead of being hand-written HTML. Here is a sample item:

```json
{ "id": "playthrough_13_20", "cls": "f_gem f_misc", "html": "Continue left until you can enter a room with a Large Soul of a Nameless Soldier and a Raw Gem" }
```

The **id** is a unique ID used to store the user's progress. For example,
***playthrough_13_20*** is the 20th task in zone 13. New ids must be used in
ascending order, but you can place the new entries anywhere within a zone. The
**html** field may contain links and other inline markup.

The **cls** field is used for the filtering system. This task provides the user
with a gem and a consumable, so we use **f_gem** and **f_misc**. The full list of
filter classes is:

| Class   | Description |
|---      |--- |
| f_boss  | Boss fights |
| f_miss  | Content that can be permanently missed |
| f_npc   | NPC side quests |
| f_estus | Estus Shards |
| f_bone  | Undead Bone Shards |
| f_tome  | Sorcery Scrolls, Pyromancy Tomes, and Divine Tomes |
| f_coal  | Coals |
| f_ash   | Umbral Ashes |
| f_gest  | Gestures |
| f_sorc  | Sorceries |
| f_pyro  | Pyromancies |
| f_mirac | Miracles |
| f_ring  | Rings |
| f_weap  | Weapons, Spell Tools, and Shields |
| f_arm   | Armor Sets or individual pieces |
| f_tit   | Titanite |
| f_gem   | Gems |
| f_cov   | Covenants |
| f_misc  | *any other items* |

If none of these filter classes match, use **"cls": "f_none"**.

In addition to the filter classes, there is a second type of classes used to control the visibility of entries based on which playthrough the user is on:

| Class  | Description |
|---     |--- |
| h_ng+  | items hidden on NG+ and beyond, e.g., Ashen Estus Flask |
| s_ng+  | items shown on NG+ and beyond, e.g., +1 rings |
| s_ng++ | items shown on NG++ and beyond, e.g., +2 rings |
