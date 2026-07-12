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
- **Cross-tab sync** — check an item once (a weapon, ring, spell, …) and it's ticked everywhere it appears, across the Playthrough and the collection tabs.
- **Filters** by category (bosses, missables, rings, …), by caster build (sorcery / pyromancy / miracle), and by journey (NG / NG+ / NG++).
- **Build highlighting** — tint everything tied to a sorcery, pyromancy, or miracle build (catalysts, rings, trainers, spells) across all tabs, with blended colors for steps shared by several builds.
- **Per-section search** with match highlighting, collapsible sections (with expand/collapse all), and a "hide completed" mode.
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
**html** field may contain links and other inline markup. An optional **item**
field links the same real item across tabs — see
[Linking the same item](#linking-the-same-item-across-tabs) below.

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

There are also three **build classes** that mark everything connected to a
caster build — its catalysts (staves, pyromancy flames, talismans and sacred
chimes), build-related rings, trainer/merchant steps, and spells:

| Class         | Description                                   |
| ------------- | --------------------------------------------- |
| f_sorc_build  | Part of a Sorcery (Intelligence) caster build |
| f_pyro_build  | Part of a Pyromancy (Int/Faith) caster build  |
| f_mirac_build | Part of a Miracle (Faith) caster build        |

They power the Builds group in the filter panel and the
Sorcery/Pyromancy/Miracle highlight buttons shown on the checklist tabs. Unlike
the regular filter classes, build classes are **exclusionary**: hiding a build
hides an entry tagged with it even when the entry also carries an otherwise
visible category (recruiting Orbeck is both "an NPC" and "part of the sorcery
build"). An entry may carry several build classes when it serves more than one
school (e.g. the Crystal Chime casts both sorceries and miracles).

Filtering only ever hides entries in the Playthrough walkthrough. The
collection tabs (Achievements, Weapons/Shields, …) are 100% completion lists,
so their entries always stay visible and counted; the build classes they carry
only drive highlighting.

In addition to the filter classes, there is a second type of classes used to control the visibility of entries based on which playthrough the user is on:

| Class  | Description                                             |
| ------ | ------------------------------------------------------- |
| h_ng+  | items hidden on NG+ and beyond, e.g., Ashen Estus Flask |
| s_ng+  | items shown on NG+ and beyond, e.g., +1 rings           |
| s_ng++ | items shown on NG++ and beyond, e.g., +2 rings          |

### Linking the same item across tabs

Many items appear in more than one tab — a weapon shows up in the Playthrough
walkthrough and again in the Weapons/Shields list. Give both entries the same
optional **`item`** key and the app mirrors their checked state (tick it in one
place and it ticks in the other):

```json
{ "id": "weapons_1_69", "item": "uchigatana", "html": "<a href=\"...\">Uchigatana</a>" }
```

- Use a kebab-case slug, adding a `+N` suffix for upgrade tiers
  (e.g. `"ring-of-favor+1"`).
- Use an array when one entry grants several items:
  `"item": ["claymore", "club"]`.
- A key must resolve to **at most one entry per tab** — `npm run validate`
  enforces this and warns about keys used in only one tab (which link nothing).
- Leave `item` off for standalone entries; stackables (e.g. Homeward Bone) and
  Misc/Crow trades deliberately have none.

## Acknowledgments

- Built on the [Dark Souls 3 Cheat Sheet](https://github.com/ZKjellberg/dark-souls-3-cheat-sheet)
  by [Zachary Kjellberg](https://github.com/ZKjellberg), which this repository was
  originally forked from.
- Original source code adapted from the [Dark Souls 2 Cheat Sheet](https://github.com/smcnabb/dark-souls-2-cheat-sheet/tree/gh-pages)
  by [Stephen McNabb](https://github.com/smcnabb).
- Walkthrough based on [DeathGodGarra's NPC Side Quests Guide V2](https://www.gamefaqs.com/boards/168566-dark-souls-iii/73599466).
