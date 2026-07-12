# Contributing

Thanks for helping improve the Dark Souls 3 Cheat Sheet! This is a static site
with no build step — the browser loads the checklist data directly.

## Editor setup

The editor config is checked into the repo, so you get the same setup as everyone
else with no manual configuration:

- **VS Code** — opening the project prompts you to install the recommended
  extensions ([`.vscode/extensions.json`](.vscode/extensions.json)): Prettier,
  EditorConfig, and Code Spell Checker. Formatting on save and the game-term
  spell-check word list ([`cspell.json`](cspell.json)) then apply automatically.
- **Other editors** — the same rules are enforced without an editor: run
  `npm run format` for Prettier, and the pre-commit hook formats and validates
  staged files anyway. EditorConfig ([`.editorconfig`](.editorconfig)) is
  supported by most editors natively or via a plugin.

## Editing checklist content

All checklist entries live in [`data/checklist.json`](data/checklist.json).
Each item looks like:

```json
{ "id": "playthrough_13_20", "cls": "f_gem f_misc", "html": "Continue left ..." }
```

- **`id`** — unique, of the form `<key>_<zone>_<n>` (e.g. `playthrough_13_20`).
  Use the next unused number in ascending order.
- **`cls`** — space-separated filter/journey classes. The full list of filter
  classes and the NG+ visibility classes is documented in the
  [README](README.md#contributing).
- **`html`** — the entry text; inline HTML such as `<a href="...">` is allowed.
- **`item`** _(optional)_ — a cross-tab link key. Entries in different tabs that
  represent the **same real item** (e.g. a weapon in the Playthrough and in the
  Weapons/Shields list) share the same key and mirror their checked state. Use a
  kebab-case slug, with a `+N` suffix for upgrade tiers (e.g. `"uchigatana"`,
  `"ring-of-favor+1"`). A key may be an array when one entry grants several
  items (`"item": ["claymore", "club"]`). A key must resolve to **at most one
  entry per tab**; `npm run validate` enforces this and warns about keys used in
  only one tab (which link nothing). Leave `item` off for standalone entries —
  stackables (e.g. Homeward Bone) and Misc/Crow trades deliberately have none.

`data/checklist.json` references a JSON Schema
([`data/checklist.schema.json`](data/checklist.schema.json)), so editors like
VS Code will flag mistakes as you type.

## Before opening a pull request

```
npm install          # once
npm run validate     # data/checklist.json is well-formed & ids are unique
npm test             # Playwright end-to-end tests
npm run format       # apply Prettier formatting
```

CI runs `validate` and `test` on every pull request, so please make sure they
pass locally first. New behaviour should come with a test in `tests/`.

## Running the site locally

The page fetches `data/checklist.json`, so it must be served over HTTP:

```
npm run serve        # then open the printed URL
```

Opening `index.html` from disk will not load the checklist (`fetch` is blocked
on `file://`).

## Repository setup (maintainers)

The default branch is currently `gh-pages`, which means development happens on
the same branch that GitHub Pages deploys. A cleaner setup is to develop on
`main` and configure **Settings → Pages → Build and deployment** to publish from
`main` (root). That separates "what's deployed" from "where you work" and avoids
committing straight to the live branch. This is a one-time GitHub settings
change; the site files themselves do not need to move.
