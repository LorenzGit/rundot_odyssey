# Localization — CSV-driven multi-language strings

A one-file localization system: all player-facing copy lives in a single `Localization.csv` (one key column + one column per language), bundled into the JS at build time via a Vite `?raw` import and parsed synchronously — **strings are available at first paint**, no fetch, no async gap. `L.Get('Key', {n: 5})` translates with `[bracket]` interpolation; missing keys render as a deliberately ugly `[[Key]]` marker; empty translated cells fall back to English; the player's language choice persists in the game save and is restored before the first render.

The CSV format is byte-compatible with the studio's Unity localization sheets, so existing translation pipelines can carry over. The PascalCase API (`L.Get`, `L.SelectLanguage`, ...) preserves compatibility with existing call sites; camelCase convenience methods are marked as additions.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `l10n.ts` | yes (e.g. `src/helpers/l10n.ts`) | all machinery — you should not need to edit it |
| `Localization.csv` | yes (repo root suggested) | starter sheet: ~15 example keys in 3 languages showing the format, interpolation, and escaping. Replace the rows with the host game's strings; keep the header shape. |
| `README.md` | no | this guide |

No dependencies beyond the RUN SDK (and only for the *optional* locale-detection helper — everything else is pure string machinery that runs identically in mock/local dev). TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Create the game's l10n instance (new file, e.g. `src/l10nConfig.ts`)

```ts
import CSV_RAW from '../Localization.csv?raw';   // Vite: bundled raw text, synchronous
import { createL10n } from './helpers/l10n';
import { saveSystem } from './saveConfig';       // ADAPT: however the host exposes its save

export const L = createL10n({
    csvText: CSV_RAW,
    defaultLanguage: 'English',      // ADAPT: must match a header column (first column recommended)
    persist: {
        // ADAPT: wire to the host's save system. get() runs at restoreLanguage()
        // time (after the save loads), never at import time — the lazy closure
        // is safe even though this module is created before the save exists.
        get: () => saveSystem.data && saveSystem.data.language,
        set: (lang) => { saveSystem.data.language = lang; saveSystem.save(); },
    },
    // ADAPT: only needed if you opt into detectLanguageAsync() (see step 2).
    localeMap: { en: 'English', pt: 'PortugueseBR', es: 'SpanishLA' },
    debugWarnings: false,            // ADAPT: gate on the host's DEBUG flag
});
export default L;
```

Creating the instance **at module scope** is what preserves the first-paint property: `createL10n` parses the bundled CSV synchronously, so every module that imports `L` — including ones that run before boot — already gets working default-language strings.

If the host game does not use Vite, anything that yields the CSV as a string before first render works (raw-import equivalent in its bundler, or an inline JS string module). Do **not** switch to a runtime `fetch` — that reintroduces an async gap where the first frame paints untranslated.

### 2. Boot wiring (restore BEFORE the first render)

```ts
await RundotGameAPI.initializeAsync();
game.save = await saveSystem.load();

// Restore the player's saved language BEFORE the static-DOM pass and the
// first menu render, so the whole boot paints in their chosen language.
// Invalid/missing saved value keeps the default selected at import time.
L.restoreLanguage();

// OPTIONAL first-boot detection instead of waiting for the player to pick:
if (!game.save.language) {
    const detected = await L.detectLanguageAsync();   // mock uses navigator.language
    if (detected) L.setLanguage(detected);            // also persists the choice
}

relocalizeGamedata();   // only if you localize data-driven content — see Patterns
L.LocalizeDom();        // stamp data-loc / data-loc-html elements

// Mid-session switches (settings picker): re-stamp everything
// language-dependent. Registered after the boot restore so it only
// fires for real switches.
L.onLanguageChange(() => {
    relocalizeGamedata();       // if applicable
    L.LocalizeDom();
    game.updateMenuLabels();    // ADAPT: re-render any JS-owned labels
});
```

### 3. Translate call sites

```ts
showToast(L.Get('ButtonClose'));                       // plain
game.banner(L.Get('BannerWave', {n: game.wave}));      // [n] interpolation
el.innerHTML = L.Get('GameOverScore', {score: s});     // values may carry HTML
```

Interpolation happens **inside `Get`** — one call per string, every `[token]` in the cell replaced by `String(params.token)`. With `debugWarnings` on, unused params and unfilled tokens log to the console (the silent failure mode of call-site `.replace()` chains, caught).

### 4. Static HTML text (`data-loc`)

```html
<button id="btn-start" data-loc="MenuStartGame"></button>
<p data-loc-html="DialogQuitBody"></p>   <!-- \n in the cell renders as <br> -->
```

`L.LocalizeDom()` stamps every `data-loc` (textContent) and `data-loc-html` (innerHTML) element. Run once at boot after the DOM exists; the `onLanguageChange` listener re-runs it on switches. Leave the elements' bodies empty in the HTML — the stamp is the single source of truth.

### 5. Settings language picker

A LANGUAGE row in settings shows the active language's native name; tapping it opens a picker with one option per CSV column. Selection applies immediately and the dialog stays open so languages can be compared quickly.

```ts
// The settings row's label — each language's OWN native name, from the
// LanguageNativeName row. A menu of language names must not itself translate.
languageBtn.textContent = L.GetForLanguage('LanguageNativeName', L.language);

function renderLanguageOptions(wrap: HTMLElement): void {
    wrap.innerHTML = '';
    for (const lang of L.knownLanguages) {
        const opt = document.createElement('button');
        opt.className = 'language-option' + (lang === L.language ? ' selected' : '');
        opt.textContent = (lang === L.language ? '► ' : '') + L.GetForLanguage('LanguageNativeName', lang);
        opt.addEventListener('click', () => {
            if (L.setLanguage(lang)) {          // selects + persists + fires onLanguageChange
                languageBtn.textContent = L.GetForLanguage('LanguageNativeName', lang);
                renderLanguageOptions(wrap);    // re-highlight; screens re-render via the listener
            }
        });
        wrap.appendChild(opt);
    }
}
```

Screens that render on open (shop, collections, ...) pick the new language up on their next render automatically — only *always-visible* text needs the `onLanguageChange` re-stamp.

### 6. Dynamic copy — the import-time-resolution trap

Module imports run **before** the save's language choice is restored, and the picker can switch languages mid-session. Any string resolved at import time is frozen in the default language. Use these three patterns:

```ts
// Notifications: resolve title/body at SCHEDULE time, not module-init consts.
await RundotGameAPI.notifications.scheduleAsync(
    L.Get('NotificationTitle'),
    L.Get('NotificationReEngagementBody'),
    delaySeconds, 're-engagement');

// Data tables (tutorials, tooltips): entries are GETTERS, rebuilt per access.
export const TUTORIALS = {
    get WELCOME() { return [{ text: L.Get('Tutorial_Welcome_0') }]; },
};
// Same pattern for the tutorial system's continueLabels config — pass getters
// (get mobile() { return L.Get('TapToContinue'); }); the system reads them
// lazily per render, so the hint tracks live language switches.

// Anything persisted with pre-rendered text, such as saved daily-quest
// descriptions: re-render those strings inside the onLanguageChange listener,
// before the save write, so the new text persists.
```

## Config reference

`createL10n(config)` — all parameters:

| Param | Default | Meaning |
|---|---|---|
| `csvText` | required | raw CSV text (`KEY,<Lang>[,<Lang>...]` header). Vite: `import X from './file.csv?raw'` |
| `defaultLanguage` | `'English'` | column selected at create time; unknown name falls back to the first column |
| `persist` | `null` | `{get, set}` for the saved language override. Wire to the host save — browser storage does not work in the production RUN iframe |
| `localeMap` | `{}` | lowercase BCP-47 tag (`'pt-br'` or primary `'pt'`) → column name; only used by `detectLanguageAsync()` |
| `debugWarnings` | `false` | console warnings for missing keys / unused params / unfilled tokens |

Returned object (`L`):

| Member | Purpose |
|---|---|
| `Get(key, params?)` | translate; `[token]` interpolation; missing key → `'[[key]]'` (key HTML-escaped — see escaping rules); empty cell → first column |
| `Exists(key)` | key present in the dictionary? (used by the gamedata-stamping pattern) |
| `GetForLanguage(key, lang)` | translate in an explicit column, ignoring the selection (language picker labels) |
| `LoadCSV(text, clearDictionary)` | parse + merge a sheet; duplicate keys override (layering); `true` clears first |
| `SelectLanguage(name)` | silent column switch — no persist, no listeners (boot/internal use) |
| `language` (get/set) | active language name; `''` before any selection |
| `knownLanguages` (get) | copy of the header's column names |
| `LocalizeDom(root?)` | stamp `data-loc` / `data-loc-html` elements; safe to re-run; no-op outside a browser |
| `SetDebugWarnings(on)` | toggle dev warnings at runtime |
| `setLanguage(name)` | *(addition)* select + persist + notify listeners; `false` for unknown names |
| `restoreLanguage()` | *(addition)* boot-time apply of the persisted override; never errors |
| `detectLanguageAsync()` | *(addition, optional)* SDK locale → `localeMap` → column name, or `null`; never throws |
| `onLanguageChange(fn)` | *(addition)* subscribe to switches; returns an unsubscribe function |

## Patterns

### Adding a language = adding a column

Add the language name to the header, then a cell per row. Empty cells are safe — they fall back to English at `Get` time, so a partially translated column ships fine. Also add: the column's own `LanguageNativeName` cell (the picker shows it), and a `localeMap` entry if you use detection. Then do a **visual overflow pass** because translated text often runs longer than English.

### Key naming (the source's conventions)

PascalCase, grouped by UI-surface prefix so the sheet reads like a site map: `Button*`, `Menu*`, `Hud*`, `Dialog*`, `Popup*`, `Toast*`, `Banner*`, `Settings*`, `GameOver*`, `Notification*`, `Tutorial_<Name>_<i>`, `Changelog_<version>_<i>`. Data-driven families use `<Kind><Field>_<id>`: `UnitName_gunner`, `RelicDesc_magnet`, `QuestDesc_3`. Rows whose key starts with `___` are skipped by the parser — usable as section comments.

### Interpolation

Placeholders are `[token]` (lowercase token names), filled by `Get(key, {token: value})`. Values are stringified with `String()` — pre-format numbers yourself (`n.toLocaleString()`, rounding) at the call site. Because translators see the token inline, word order can differ per language freely.

### CSV escaping rules (RFC 4180 + one convention)

- Cells containing a comma or a quote are wrapped in `"..."`; embedded quotes double: `"He said ""hi"""`.
- Line breaks inside a cell are written as a **literal `\n`** (two characters) and unescaped at load — the sheet stays one-row-per-key. `data-loc-html` renders them as `<br>`.
- HTML in cells is allowed and passes through (`<b>[score]</b>`) — only use such keys with `innerHTML`/`data-loc-html` sinks.
- A **missing** key is the one thing `Get()` does not take from the CSV, so its `[[key]]` marker is HTML-escaped: `LocalizeDom` reads keys from `data-loc-html` attributes and writes the result to `innerHTML`, and an unescaped key would reflect markup into the DOM. Cell values stay raw (previous rule). If you build a `data-loc-html` attribute from anything a player controls, escape it at that call site too — the marker is the only escaping this module does.
- **Never edit the CSV with PowerShell 5.1 `Get/Set-Content`** — it reads BOM-less UTF-8 as ANSI and can double-encode accents. Use node scripts or editor tools.

### Layering a second sheet

`LoadCSV(text, false)` merges with override-on-duplicate — the Unity framework's `Localization.csv` → `Localization.Game.csv` layering. Useful for splitting engine/framework strings from game strings, or for a debug-only override sheet.

### Translating data-driven content (gamedata.json names/descs)

Keep `gamedata.json` in the default language and **stamp localized values over it in place**, keyed by convention (`UnitName_<id>` etc.), falling back to the JSON value when no row exists. Untranslated entries then degrade gracefully and the data file remains the single source of truth for non-copy fields:

```ts
function locField(key: string, current: string): string {
    return L.Exists(key) ? L.Get(key) : current;
}
function localizeGamedata(d: typeof DATA): void {
    for (const [k, u] of Object.entries(d.units || {})) {   // ADAPT: per data family
        if (u.name !== undefined) u.name = locField('UnitName_' + k, u.name);
        if (u.desc !== undefined) u.desc = locField('UnitDesc_' + k, u.desc);
    }
}
localizeGamedata(DATA);                                     // at data-module load
export function relocalizeGamedata(): void { localizeGamedata(DATA); }  // on language change
```

Safe to re-run: every field with a CSV row is fully replaced from the row's current-language value each pass. Call `relocalizeGamedata()` from the `onLanguageChange` listener (and after the boot restore).

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Which strings to externalize | scan the host's UI code for player-visible literals: `textContent`/`innerHTML` assignments, button/menu labels in `index.html`, toast/dialog/banner copy, notification title+body, tutorial text, game-over screens. Skip console/debug-only strings. |
| Key names | apply the prefix conventions above to where each string appears (a settings toggle → `Settings*`, a toast → `Toast*`) |
| Languages | whatever the host already targets; if nothing indicates a market, ship **English-only** (one column) — the format makes adding columns cheap later |
| `defaultLanguage` | the language the host's code is written in (its literals become the first column) |
| `persist` wiring | the host's save system (integrate `systems/save/` first if there is none); field name `language`, additive — no save-version bump needed |
| Where `restoreLanguage()` goes | the host's boot path, after the save load, before the first render/`LocalizeDom` |
| `localeMap` | primary subtags of the chosen columns (`en`/`pt`/`es`...); only if you enable detection |
| Data-driven content | if the host has a gamedata/config JSON with `name`/`desc` fields, add the `locField` stamp per family |
| Settings picker | add a LANGUAGE row to the host's existing settings surface; skip the picker entirely for a single-language ship (the CSV is still worth it — it centralizes copy) |

## SDK notes

- **The core localization path uses no SDK API.** Language = English default (selected at import time) + the saved `save.language` override restored at boot. This is why the whole system works identically in mock/local dev.
- `detectLanguageAsync()` (template addition, opt-in) reads, in order: `RundotGameAPI.system.getEnvironment().browserInfo.language` (the SDK docs' recommended localization source, e.g. `'en-US'`), then `RundotGameAPI.requestTimeAsync().locale` (the player's resolved locale). SDK 5.23+ mock mode supplies `navigator.language` (or `en-US`), so local detection returns a known language when `localeMap` maps that tag; unavailable or unmapped locales return `null`. Both calls are try/catch'd and never surface an error. Call it after `initializeAsync()`.
- Persist the language in the **game save** (`appStorage` via the save system) — `localStorage` is unavailable in the production RUN iframe.
- Vite specifics: `import CSV_RAW from '../Localization.csv?raw'` needs no plugin — `?raw` is built into Vite and inlines the file as a string in the bundle. It works with `base: './'` and any file location; keeping `Localization.csv` at the repo root makes it easy for translators and scripts to find.
- Locale-aware *formatting* (dates, numbers) is a separate SDK surface — `RundotGameAPI.formatTime` / `formatNumber` apply the player's locale automatically; don't hand-format those into translated strings.

## UI adaptation

- **Plain-DOM hosts**: use `data-loc`/`data-loc-html` for static text + `L.Get` for JS-built text, exactly as above.
- **Canvas-rendered hosts**: there is no DOM to stamp — skip `LocalizeDom` entirely; every draw call goes through `L.Get`, and the `onLanguageChange` listener just marks the scene dirty.
- **React/framework hosts**: skip `LocalizeDom`; call `L.Get` in render functions and subscribe a re-render to `onLanguageChange` (e.g. a `useSyncExternalStore`/state bump). The first-paint property still holds — the instance is ready at module scope.
- Budget for text growth: fixed-height buttons that wrap to two lines beat auto-height reflow.

## Verification checklist

1. Local dev (mock mode) boots painting default-language strings on the first frame — no `[[...]]` markers, no flash of empty text.
2. With the browser locale represented in `localeMap`, `detectLanguageAsync()` resolves the mapped language in local dev; remove that mapping and it resolves `null` without throwing.
3. `L.Get('NoSuchKey')` renders `[[NoSuchKey]]` on screen (and warns in console with `debugWarnings`).
4. An interpolated key fills its `[token]`s; with `debugWarnings` on, a wrong param name and an unfilled token both warn.
5. CSV escaping round-trips: a quoted cell containing a comma and `""`-escaped quotes renders verbatim; a `\n` cell renders as a real line break (`<br>` via `data-loc-html`). The starter sheet's `ToastReward`, `DialogQuoteDemo`, and `DialogQuitBody` rows exercise all three.
6. Blank a translated cell → that key falls back to the English column in that language, everything else stays translated.
7. Switch language in the settings picker → static DOM, JS-owned labels, and data-driven names re-render immediately; the picker's option labels stay in each language's own native name.
8. Reload after switching → the game boots in the chosen language (persisted via the save, restored before first paint).
9. Schedule a reminder after switching languages → the notification arrives in the new language (schedule-time resolution).
