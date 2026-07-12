# Dark Souls 3 Cheat Sheet

A fast, installable checklist for a 100% Dark Souls 3 playthrough — bosses,
missables, rings, spells, weapons, and more — with your progress saved right in
the browser.

**▶ [Open the cheat sheet](https://ronaldokwan.github.io/dark-souls-3-cheat-sheet/)**

[![CI](https://github.com/ronaldokwan/dark-souls-3-cheat-sheet/actions/workflows/ci.yml/badge.svg)](https://github.com/ronaldokwan/dark-souls-3-cheat-sheet/actions/workflows/ci.yml)
![PWA](https://img.shields.io/badge/PWA-installable%20%26%20offline-5a0fc8)
![No dependencies](https://img.shields.io/badge/runtime%20deps-none-brightgreen)

## Features

- **Complete checklists** for the playthrough, achievements, weapons/shields, armor, and Crow trades — over 1,900 tracked items.
- **Progress saved** in your browser, with multiple **profiles** for different characters.
- **Filters** by category (bosses, missables, rings, …) and by journey (NG / NG+ / NG++).
- **Per-section search** with match highlighting, collapsible sections, and a "hide completed" mode.
- **Light / dark / auto** theme.
- **Import/export** your progress as a file or via the clipboard.
- **Installable and offline** — it's a Progressive Web App, so once loaded it works with no network connection.

## Project structure

The site is a static, no-build page (works on GitHub Pages) with **no external
dependencies** — Bootstrap 5, Bootstrap Icons, and everything else are vendored
under `assets/vendor/`. There is no jQuery. The browser loads the app as native
ES modules (no bundler). It is an installable PWA that works offline once loaded.

| Path                            | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `index.html`                    | Page shell (nav, filter toolbar, tabs, modals, options)    |
| `data/checklist.json`           | **All checklist content** — this is what contributors edit |
| `assets/js/render.js`           | Renders `data/checklist.json` into the page                |
| `assets/js/main.js`             | App logic (progress, filters, search, themes, wiring)      |
| `assets/js/profiles.js`         | Profile state model (persisted to localStorage)            |
| `assets/js/storage.js`          | localStorage wrapper + one-time legacy migration           |
| `assets/css/main.css`           | Custom styles                                              |
| `assets/vendor/`                | Self-hosted Bootstrap 5 + Bootstrap Icons                  |
| `assets/img/`                   | Icons and favicons                                         |
| `tools/validate.mjs`            | Validates `checklist.json` (run in CI)                     |
| `data/checklist.schema.json`    | JSON Schema for editor validation of the data              |
| `tests/`                        | Playwright end-to-end tests                                |
| `manifest.webmanifest`, `sw.js` | PWA manifest + service worker (offline / installable)      |
| `CONTRIBUTING.md`               | How to contribute                                          |

To run locally, serve the folder over HTTP (the page fetches the JSON), e.g.
`npm run serve` (or `python -m http.server`) and open the printed URL. Opening
`index.html` directly from disk will not load the checklist because browsers
block `fetch` on `file://`.

## Development

The site itself has no build step. The `package.json` is only dev tooling:

```bash
npm install                 # once — installs tooling and the git pre-commit hook
npm run validate            # check data/checklist.json is well-formed
npm test                    # run the Playwright end-to-end tests
npm run format              # format the source with Prettier
npm run serve               # preview locally at the printed URL
```

A pre-commit hook (husky + lint-staged) automatically formats staged files and
validates `data/checklist.json`, so bad data or unformatted code can't be
committed. CI (`.github/workflows/ci.yml`) runs formatting, validation, and the
Playwright tests on every push and pull request.

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full
workflow; the data format is summarized below.

Checklist entries live in [`data/checklist.json`](data/checklist.json) instead of
being hand-written HTML. Here is a sample item:

```json
{
  "id": "playthrough_13_20",
  "cls": "f_gem f_misc",
  "html": "Continue left until you can enter a room with a Large Soul of a Nameless Soldier and a Raw Gem"
}
```

The **id** is a unique ID used to store the user's progress. For example,
_**playthrough_13_20**_ is the 20th task in zone 13. New ids must be used in
ascending order, but you can place the new entries anywhere within a zone. The
**html** field may contain links and other inline markup.

The **cls** field is used for the filtering system. This task provides the user
with a gem and a consumable, so we use **f_gem** and **f_misc**. The full list of
filter classes is:

| Class   | Description                                        |
| ------- | -------------------------------------------------- |
| f_boss  | Boss fights                                        |
| f_miss  | Content that can be permanently missed             |
| f_npc   | NPC side quests                                    |
| f_estus | Estus Shards                                       |
| f_bone  | Undead Bone Shards                                 |
| f_tome  | Sorcery Scrolls, Pyromancy Tomes, and Divine Tomes |
| f_coal  | Coals                                              |
| f_ash   | Umbral Ashes                                       |
| f_gest  | Gestures                                           |
| f_sorc  | Sorceries                                          |
| f_pyro  | Pyromancies                                        |
| f_mirac | Miracles                                           |
| f_ring  | Rings                                              |
| f_weap  | Weapons, Spell Tools, and Shields                  |
| f_arm   | Armor Sets or individual pieces                    |
| f_tit   | Titanite                                           |
| f_gem   | Gems                                               |
| f_cov   | Covenants                                          |
| f_misc  | _any other items_                                  |

If none of these filter classes match, use **"cls": "f_none"**.

In addition to the filter classes, there is a second type of classes used to control the visibility of entries based on which playthrough the user is on:

| Class  | Description                                             |
| ------ | ------------------------------------------------------- |
| h_ng+  | items hidden on NG+ and beyond, e.g., Ashen Estus Flask |
| s_ng+  | items shown on NG+ and beyond, e.g., +1 rings           |
| s_ng++ | items shown on NG++ and beyond, e.g., +2 rings          |

## Acknowledgments

- Built on the [Dark Souls 3 Cheat Sheet](https://github.com/ZKjellberg/dark-souls-3-cheat-sheet)
  by [Zachary Kjellberg](https://github.com/ZKjellberg), which this repository was
  originally forked from.
- Original source code adapted from the [Dark Souls 2 Cheat Sheet](https://github.com/smcnabb/dark-souls-2-cheat-sheet/tree/gh-pages)
  by [Stephen McNabb](https://github.com/smcnabb).
- Walkthrough based on [DeathGodGarra's NPC Side Quests Guide V2](https://www.gamefaqs.com/boards/168566-dark-souls-iii/73599466).
