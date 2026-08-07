// CSV-driven localization for RUN games.
//
// The CSV format is byte-compatible with the studio's Unity localization
// sheets: header `KEY,English[,PortugueseBR,...]`, PascalCase keys grouped
// by prefix (Button*/Menu*/Dialog*/Tutorial_*...), `[bracket]` placeholder
// tokens, literal `\n` escapes inside cells, RFC-4180 quoting (cells quoted
// only when they contain a comma/quote/newline, `""` for embedded quotes).
// Adding a language = adding a column.
//
// The property that matters most: **strings are available at first paint.**
// The CSV ships inside the JS bundle (Vite `?raw` import) and is parsed
// synchronously inside createL10n() — no fetch, no async gap. Create the
// instance at module scope of your config file and every import-time
// consumer already has working default-language strings.
//
// Fallback semantics:
//   selected column value → first column (English) when the cell is empty
//   → visible "[[key]]" marker when the key is missing entirely
//   (deliberately ugly on screen so untranslated call sites are
//   impossible to miss).
//
// The ONLY SDK touchpoint is the optional detectLanguageAsync() helper.
// Without it, the module uses the English default plus the saved override
// restored at boot. Everything else is pure string machinery that behaves
// identically in mock / local dev.
//
// API naming: PascalCase methods (LoadCSV, Get, SelectLanguage, ...) preserve
// compatibility with the Unity-port surface. camelCase methods (setLanguage,
// restoreLanguage, onLanguageChange, detectLanguageAsync) are additions.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * Interpolation params for Get(): each `[token]` in the cell is replaced by
 * `String(params.token)` — pre-format numbers yourself at the call site.
 */
export type L10nParams = Record<string, unknown>;

/**
 * Injected persistence for the player's language override — wire to the
 * host's save system (browser storage does NOT work in the production RUN
 * iframe). `get` runs at restoreLanguage() time (after the save loads),
 * never at import time. `set` runs on every setLanguage(). Both are
 * guarded — a throwing persist layer never blocks a language switch.
 */
export interface L10nPersist {
    get: () => string | null | undefined;
    set: (lang: string) => void;
}

export interface L10nConfig {
    /**
     * Raw CSV text. With Vite: `import CSV_RAW from '../Localization.csv?raw'`
     * — bundled and synchronous, which is what makes strings available at
     * first paint. Header row must be `KEY,<Language>[,<Language>...]`.
     */
    csvText: string;
    /**
     * Column selected at create time (before any saved choice is known).
     * Must match a header column; falls back to the first column if not.
     * Default 'English'.
     */
    defaultLanguage?: string;
    /** Saved-override persistence — see L10nPersist. Default null (no persistence). */
    persist?: L10nPersist | null;
    /**
     * Only used by the optional detectLanguageAsync(): lowercase BCP-47 tag
     * (full `'pt-br'` or primary `'pt'`) → CSV column name, e.g.
     * `{ pt: 'PortugueseBR', es: 'SpanishLA', en: 'English' }`.
     */
    localeMap?: Record<string, string>;
    /**
     * Console warnings for missing keys / unused params / unfilled tokens.
     * Flip on in dev builds only (or later via SetDebugWarnings). Default false.
     */
    debugWarnings?: boolean;
}

/** The object createL10n() returns. */
export interface L10n {
    /** Parse + merge a sheet; duplicate keys override (layering); `true` clears first. */
    LoadCSV(text: string, clearDictionary?: boolean): boolean;
    /** Silent column switch — no persist, no listeners (boot/internal use). */
    SelectLanguage(name: string): boolean;
    /** Active language name; `''` before any selection. Setting routes through SelectLanguage(). */
    language: string;
    /** Copy of the header's column names, e.g. ['English', 'PortugueseBR']. */
    readonly knownLanguages: string[];
    /** Translate; `[token]` interpolation; missing key → `'[[key]]'` (key escaped); empty cell → first column. */
    Get(key: string, params?: L10nParams): string;
    /** Whether `key` is present in the dictionary. */
    Exists(key: string): boolean;
    /** Translate in an explicit column, ignoring the selection (language picker labels). */
    GetForLanguage(key: string, languageName: string): string;
    /** Stamp `data-loc` / `data-loc-html` elements; safe to re-run; no-op outside a browser. */
    LocalizeDom(root?: ParentNode | null): void;
    /** Toggle dev warnings at runtime. */
    SetDebugWarnings(on: boolean): void;
    /** (addition) Select + persist + notify listeners; `false` for unknown names. */
    setLanguage(name: string): boolean;
    /** (addition) Boot-time apply of the persisted override; never errors. */
    restoreLanguage(): boolean;
    /** (addition, optional) SDK locale → localeMap → column name, or `null`; never throws. */
    detectLanguageAsync(): Promise<string | null>;
    /** (addition) Subscribe to switches; returns an unsubscribe function. */
    onLanguageChange(fn: (language: string) => void): () => void;
}

/**
 * RFC-4180 line splitter over the whole file: honours quoted cells (commas
 * and real newlines inside quotes, `""` escapes). Yields arrays of raw cell
 * strings. Equivalent of the Unity ByteReader.ReadCSV loop.
 */
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [],
        cell = "",
        inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else inQuotes = false;
            } else cell += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(cell);
            cell = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(cell);
            cell = "";
            rows.push(row);
            row = [];
        } else {
            cell += c;
        }
    }
    if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

/** Per-cell unescape: the sheets write newlines as a literal backslash-n. */
function unescapeCell(s: string): string {
    return s.indexOf("\\n") >= 0 ? s.split("\\n").join("\n") : s;
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * The missing-key marker. The key is HTML-escaped because it is the one part of
 * a Get() result that does NOT come from the CSV: LocalizeDom reads it from a
 * `data-loc-html` attribute and writes the result to innerHTML, so an unescaped
 * key reflects attacker-controlled markup straight into the DOM. Cell VALUES
 * stay raw — they may carry HTML by design (README, "CSV escaping rules").
 */
function missingKeyMarker(key: string): string {
    return "[[" + key.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]) + "]]";
}

export function createL10n(config: L10nConfig): L10n {
    const { csvText, defaultLanguage = "English", persist = null, localeMap = {}, debugWarnings = false } = config;

    // Column names from the header row, e.g. ['English', 'PortugueseBR'].
    let mLanguages: string[] = [];
    // key → array of per-language values (parallel to mLanguages).
    const mDictionary = new Map<string, string[]>();
    // Index of the selected language column; -1 until SelectLanguage succeeds.
    let mLanguageIndex = -1;
    // Currently selected language name.
    let mLanguage = "";
    // Missing-key / bad-interpolation console warnings (DEBUG only).
    let mWarn = !!debugWarnings;
    // Subscribers notified after every successful language change.
    const mListeners: Array<(language: string) => void> = [];

    function notifyChange(): void {
        for (const fn of mListeners.slice()) {
            try {
                fn(mLanguage);
            } catch (e) {
                /* one bad listener must not block the rest */
            }
        }
    }

    const L: L10n = {
        /**
         * Parse a Localization CSV and merge it into the dictionary. The
         * first row must start with "KEY" followed by language columns.
         * Duplicate keys OVERRIDE (that's the Unity framework's
         * Localization.csv → Localization.Game.csv layering; pass
         * clearDictionary=false to layer a second sheet on top).
         * @returns true when the sheet loaded
         */
        LoadCSV(text: string, clearDictionary?: boolean): boolean {
            if (!text) return false;
            const rows = parseCsv(text);
            if (!rows.length || rows[0].length < 2) return false;
            const header = rows[0];
            if (header[0].trim() !== "KEY") {
                console.error(
                    "Invalid localization CSV. The first value is expected to be 'KEY', followed by language columns. Instead found '" +
                        header[0] +
                        "'",
                );
                return false;
            }
            mLanguages = header.slice(1).map((s) => s.trim());
            if (clearDictionary) mDictionary.clear();
            for (let r = 1; r < rows.length; r++) {
                const cells = rows[r];
                if (cells.length < 2) continue; // blank / malformed line
                const key = cells[0];
                if (!key) continue;
                if (key.startsWith("___")) continue; // sentinel/comment rows (Unity font-atlas convention)
                mDictionary.set(key, cells.slice(1).map(unescapeCell));
            }
            return true;
        },

        /**
         * Select a language column by header name. Silent primitive — no
         * persistence, no listeners (boot code and the language getter use
         * it). Player-driven switches should call setLanguage() instead.
         * @returns true on success
         */
        SelectLanguage(name: string): boolean {
            const idx = mLanguages.indexOf(name);
            if (idx < 0) return false;
            mLanguageIndex = idx;
            mLanguage = name;
            return true;
        },

        /** Currently active language name (or '' before any selection). */
        get language(): string {
            return mLanguage;
        },
        set language(value: string) {
            if (value !== mLanguage) L.SelectLanguage(value);
        },

        /** Language column names from the CSV header, e.g. ['English']. */
        get knownLanguages(): string[] {
            return mLanguages.slice();
        },

        /**
         * Localize `key`. With `params`, each `[token]` in the value is
         * replaced by String(params.token). Missing keys return "[[key]]" —
         * deliberately ugly on screen so untranslated call sites are
         * impossible to miss. Empty cells fall back to the first column.
         */
        Get(key: string, params?: L10nParams): string {
            const vals = mDictionary.get(key);
            let s: string;
            if (vals && mLanguageIndex >= 0 && mLanguageIndex < vals.length && vals[mLanguageIndex] !== "") {
                s = vals[mLanguageIndex];
            } else if (vals && vals[0] !== undefined && vals[0] !== "") {
                s = vals[0]; // fall back to the first column (English)
            } else {
                if (mWarn) console.warn("Localization key not found: '" + key + "'");
                return missingKeyMarker(key);
            }
            if (params) {
                for (const p of Object.keys(params)) {
                    const token = "[" + p + "]";
                    if (mWarn && s.indexOf(token) < 0) {
                        console.warn("Localization: param '" + p + "' unused by key '" + key + "'");
                    }
                    s = s.split(token).join(String(params[p]));
                }
                if (mWarn && /\[[a-z_]+\]/.test(s)) {
                    console.warn("Localization: unfilled token in '" + key + "' → \"" + s + '"');
                }
            }
            return s;
        },

        /** Whether `key` is present in the dictionary. */
        Exists(key: string): boolean {
            return mDictionary.has(key);
        },

        /**
         * Localize `key` in an EXPLICIT language column, regardless of the
         * active selection. Used by the language picker, which shows each
         * language's own native name (the LanguageNativeName row) next to
         * every option — a menu of language names must not itself translate.
         */
        GetForLanguage(key: string, languageName: string): string {
            const idx = mLanguages.indexOf(languageName);
            const vals = mDictionary.get(key);
            if (idx < 0 || !vals) return missingKeyMarker(key);
            return vals[idx] !== undefined && vals[idx] !== "" ? vals[idx] : vals[0] || missingKeyMarker(key);
        },

        /**
         * The UILocalize analog: stamp localized text onto every element
         * carrying data-loc (textContent) or data-loc-html (innerHTML, with
         * newlines rendered as <br>). Run once at boot after the DOM exists;
         * safe to re-run (the onLanguageChange listener typically does).
         * No-op outside a browser (mocked smoke tests).
         */
        LocalizeDom(root?: ParentNode | null): void {
            if (typeof document === "undefined") return;
            const scope = root || document;
            scope.querySelectorAll("[data-loc]").forEach((el) => {
                el.textContent = L.Get(el.getAttribute("data-loc")!); // selector guarantees the attribute
            });
            scope.querySelectorAll("[data-loc-html]").forEach((el) => {
                el.innerHTML = L.Get(el.getAttribute("data-loc-html")!).split("\n").join("<br>");
            });
        },

        /** Missing-key / interpolation console warnings. Dev builds only. */
        SetDebugWarnings(on: boolean): void {
            mWarn = !!on;
        },

        // ── Template additions (not in the Unity port) ──────────────────

        /**
         * Player-driven language switch: select + persist (via the injected
         * config.persist.set) + notify onLanguageChange listeners. Returns
         * false for unknown names — the current selection is untouched.
         */
        setLanguage(name: string): boolean {
            if (name === mLanguage) return true;
            if (!L.SelectLanguage(name)) return false;
            if (persist && persist.set) {
                try {
                    persist.set(name);
                } catch (e) {
                    /* persistence must never block the switch */
                }
            }
            notifyChange();
            return true;
        },

        /**
         * Boot-time restore of the saved override (config.persist.get).
         * Call after the host's save has loaded, BEFORE the first render /
         * LocalizeDom pass, so the whole boot paints in the player's chosen
         * language. An invalid or missing saved value keeps the default
         * selected at create time — never an error. Notifies listeners when
         * a change actually happened.
         * @returns true when a saved language was applied
         */
        restoreLanguage(): boolean {
            let saved: string | null | undefined = null;
            try {
                saved = persist && persist.get ? persist.get() : null;
            } catch (e) {
                saved = null;
            }
            if (!saved || saved === mLanguage) return false;
            if (!L.SelectLanguage(saved)) return false;
            notifyChange();
            return true;
        },

        /**
         * OPTIONAL first-boot detection.
         * Resolves the player's locale from the SDK and maps it through
         * config.localeMap (full lowercase tag first, then the primary
         * subtag). SDK 5.23+ mock mode supplies the browser locale. Returns a
         * known column name, or null when the locale is unavailable or
         * unmapped. Never throws; does NOT
         * change the selection — pair with setLanguage():
         *   if (!savedLang) { const d = await L.detectLanguageAsync(); if (d) L.setLanguage(d); }
         * Call after RundotGameAPI.initializeAsync().
         */
        async detectLanguageAsync(): Promise<string | null> {
            let locale: string | null = null;
            try {
                const env = await RundotGameAPI.system.getEnvironment();
                locale = (env && env.browserInfo && env.browserInfo.language) || null;
            } catch (e) {
                locale = null;
            }
            if (!locale) {
                try {
                    const info = await RundotGameAPI.requestTimeAsync();
                    locale = (info && info.locale) || null; // e.g. 'pt-BR'
                } catch (e) {
                    locale = null;
                }
            }
            if (!locale || typeof locale !== "string") return null;
            const tag = locale.toLowerCase(); // 'pt-BR' → 'pt-br'
            const primary = tag.split("-")[0]; // 'pt'
            const name = localeMap[tag] !== undefined ? localeMap[tag] : localeMap[primary];
            return name && mLanguages.indexOf(name) >= 0 ? name : null;
        },

        /**
         * Subscribe to language changes (setLanguage / restoreLanguage).
         * The listener receives the new language name. Register one that
         * re-stamps everything language-dependent: LocalizeDom(), re-stamped
         * data-driven content, JS-owned labels (see README "Quick
         * integration" step 5). @returns unsubscribe
         */
        onLanguageChange(fn: (language: string) => void): () => void {
            mListeners.push(fn);
            return () => {
                const i = mListeners.indexOf(fn);
                if (i >= 0) mListeners.splice(i, 1);
            };
        },
    };

    // Eager load + select at create time — synchronous, so an instance
    // created at module scope has strings ready before anything paints.
    L.LoadCSV(csvText, true);
    if (!L.SelectLanguage(defaultLanguage) && mLanguages.length) {
        L.SelectLanguage(mLanguages[0]);
    }

    return L;
}
