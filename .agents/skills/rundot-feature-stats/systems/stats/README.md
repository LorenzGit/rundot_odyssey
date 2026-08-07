# Stats System — lifetime counters & records screen

A registry-driven lifetime-stats system: a flat `{key: number}` map inside the save blob, mutated only through `add(key, val)` (with a dirty-flag handoff to the save system's debounced flush), plus formatting helpers (K/M abbreviation, H:MM:SS durations) and a reference stats-screen renderer. Optionally mirrors chosen counters to the SDK stats API for collectible grants and leaderboards.

**Depends on a save system** — but only through config (`getStore`/`onDirty`), never by import. If the host game has no save system, integrate `systems/save/` first.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `stats.ts` | yes (e.g. `src/helpers/stats.ts`) | counters, registry, formatting, SDK mirror — you should not need to edit it |
| `statsScreen.ts` | if the host UI is plain DOM | reference renderer (rows + section headers) |
| `stats.css` | if you copied `statsScreen.ts` | row styling, theme-neutral via CSS custom properties |
| `README.md` | no | this guide |

No dependencies beyond the RUN SDK (and the SDK is only touched by the optional mirror). TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Write the game's stats config (new file, e.g. `src/statsConfig.ts`)

```ts
import { createStats } from './helpers/stats';
import { saveSystem } from './saveConfig';

export const stats = createStats({
    // ADAPT: the registry is the schema AND the screen, in display order.
    // One entry per counter worth showing; see "Derive from the host game".
    registry: {
        enemiesKilled:  { label: 'Enemies Killed' },
        wavesCompleted: { label: 'Waves Completed' },
        coinsEarned:    { label: 'Total Coins Earned' },
        gamesPlayed:    { label: 'Games Played' },
        playTimeSec:    { label: 'Play Time', format: 'duration' },
        // Optional grouping: give entries a `section` to get headers.
        // highScore:   { label: 'High Score', section: 'Records' },
    },
    getStore: () => saveSystem.data?.stats, // ADAPT: wherever the save keeps stats (`.data` is null pre-load — adds drop silently)
    onDirty: saveSystem.markDirty,          // debounced path — never immediate save()
});
```

`format` per entry: `'number'` (default, `fmtNum` K/M abbreviation), `'duration'` (H:MM:SS via `fmtDuration`, for seconds accumulators), or a custom `(value: number) => string`.

### 2. Hook into the save schema (`src/saveConfig.ts`)

```ts
import { fillMissing } from './helpers/save';
import { stats } from './statsConfig';

export function defaultSave() {
    return {
        // ...existing fields...
        stats: stats.defaults(),   // every registry key, zeroed
    };
}

// In createSaveSystem({ validate }):
validate(s, def) {
    if (typeof s.stats !== 'object' || !s.stats) s.stats = def.stats;
    fillMissing(s.stats, def.stats);  // old saves gain newly added stats as 0
    // ...existing guards...
},
```

Adding a stat later = one registry entry; `defaults()` + `fillMissing` back-fill it into existing saves on next load, no migration needed. (The two config files reference each other only inside function bodies — `getStore` closure, `defaultSave` body — so the circular import is safe under ESM. If the host's tooling objects, move the registry into its own module.)

### 3. Instrument gameplay events

```ts
import { stats } from './statsConfig';

stats.add('enemiesKilled');          // val defaults to 1
stats.add('coinsEarned', reward);    // any positive amount
```

`add()` is the **only** mutation path — never write `save.stats.foo += 1` directly, or the dirty flag, gate, and hooks are silently skipped. Unregistered keys still count (they just don't render), and missing keys start at 0, so call sites never need existence checks.

### 4. Duration stats from the game loop

```ts
function update(dt: number) {        // dt in seconds
    stats.add('playTimeSec', dt);    // marks dirty; saveSystem.tick(dt) flushes ≤ every 5s
    saveSystem.tick(dt);
}
```

Because `onDirty` is wired to `markDirty` (not `save()`), per-frame adds cost nothing until the debounced flush.

### 5. Stats screen (DOM hosts)

```html
<!-- ADAPT: match the host's screen/navigation markup -->
<div id="screen-stats" class="game-screen hidden">
    <div class="screen-hdr">
        <button class="back-btn" data-back>&#9668; BACK</button>
        <span class="screen-title">STATS</span>
    </div>
    <div class="screen-body" id="stats-list"></div>
</div>
```

```ts
import { renderStatsList } from './helpers/statsScreen';

// Re-render every time the screen opens, so values are current:
renderStatsList(document.getElementById('stats-list'), stats);
```

Include `stats.css` in the host's stylesheet cascade. It is theme-neutral out of the box; set `--stats-fg`, `--stats-accent`, `--stats-divider`, `--stats-value-glow` on `:root` to match the host's palette (the CSS file's header comment includes an optional green-terminal example).

### 6. Optional: mirror totals to the SDK

Only if the game needs SDK-side features (collectible grant rules, leaderboard feeds):

```ts
export const stats = createStats({
    // ...as above...
    mirrorToSdk: ['enemiesKilled', 'wavesCompleted'],  // ADAPT: local keys double as SDK statIds
});

// At discrete alive moments — end of run, opening the stats screen.
// NEVER from onSleep/onQuit handlers (RPCs don't survive a hard close).
const grants = await stats.syncMirrors();   // never throws; [] in mock mode
for (const g of grants) { /* ADAPT: reveal UI for freshly granted cards, or ignore */ }
```

## Config reference

| Config | Required | Purpose |
|---|---|---|
| `registry` | yes | ordered map `key → {label, format?, section?}`; display order = insertion order |
| `getStore` | yes | `() =>` the live mutable stats map (`null` before the save loads → adds drop silently) |
| `onDirty` | recommended | called after every increment; wire to `saveSystem.markDirty` |
| `shouldTrack(key)` | no | return `false` to drop an increment (FTUE gating — see Patterns) |
| `onIncrement(key, value)` | no | post-increment hook with the new total (analytics — see Patterns); exceptions swallowed |
| `mirrorToSdk` | no | stat keys to push to `RundotGameAPI.stats` via `syncMirrors()` |

| API | Purpose |
|---|---|
| `add(key, val = 1)` | sole mutation entry point; tolerant of missing/unregistered keys |
| `get(key)` | current total (0 if missing) |
| `defaults()` | `{key: 0, ...}` for every registry key — merge into `defaultSave()` |
| `formattedEntries()` | `[{key, label, value, formatted, section}]` in registry order, for any renderer |
| `syncMirrors()` | submit absolute totals for `mirrorToSdk` keys; resolves with collectible grants |
| `fmtNum(n)` / `fmtDuration(sec)` | standalone exports — reuse anywhere the host shows big numbers or play time |

## Patterns

### Data-derived stat families

When counters follow a data table (per-enemy-type kills, per-weapon usage), generate both the registry entries and the keys from that table so new content auto-registers. For example, derive `kills<Type>` stats from the enemy-type table:

```ts
// ADAPT: derive from the host's own content table.
const registry: Record<string, RegistryEntry> = {   // RegistryEntry from './helpers/stats'
    enemiesKilled: { label: 'Enemies Killed' },
    // ...fixed stats...
};
for (const key of Object.keys(ENEMY_TYPES)) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    registry['kills' + cap] = { label: (ENEMY_TYPES[key].name || key) + 's Killed', section: 'Kills' };
}

// At the kill site, bump both the aggregate and the family member:
stats.add('enemiesKilled');
stats.add('kills' + cap);
```

Adding an enemy type then updates the schema, the screen, and the save back-fill with zero stats-system edits.

### Always-tracked vs gated stats

If the host suppresses most stat writes during FTUE, whitelist the stats that drive feature unlocks. Express that policy as the `shouldTrack` predicate:

```ts
// ADAPT: only if the host gates features on early progression; most games
// should omit shouldTrack entirely and track everything from minute one.
const ALWAYS_TRACKED = new Set(['gamesPlayed', 'playTimeSec']);
shouldTrack: (key: string) =>
    ALWAYS_TRACKED.has(key) || (saveSystem.data?.stats.gamesPlayed || 0) >= 3,
```

Keep the whitelist as a named set: every stat that gates an unlock or feeds pre-gate UI must be in it, or that feature silently sees zeros.

### Duration stats

Tick seconds accumulators from the loop (step 4) and give them `format: 'duration'`. The same pattern fits any continuous accumulator — distance traveled, idle time — with a custom formatter.

### Analytics side-effects

To fire an engagement funnel step for each of the first N games played, keep the coupling out of call sites via `onIncrement`:

```ts
// ADAPT: only if the host has analytics tied to stat milestones.
onIncrement(key: string, value: number) {
    if (key === 'gamesPlayed' && value <= 20) trackGamesPlayed(value);
},
```

It fires on *every* add — including per-frame duration ticks — so branch on key first and keep it cheap.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Which counters to register | scan gameplay code for the events players would brag about: kill/death/hit handlers, score and currency awards, wave/level completion, spawn/build/merge/upgrade actions, session starts (`gamesPlayed`), prestige/reset events. Start with 8–15; more is noise. |
| Data-derived families | look for content tables (enemy types, weapons, characters) whose members already have per-member events — generate `<verb><Type>` stats from the table (see Patterns) |
| Where the stats map lives | the save system's `defaultSave()` — add a `stats` field if absent. If the game already has ad-hoc counters in its save, move them under `stats` (their keys become registry keys; values carry over via `fillMissing`) |
| Where to tick `playTimeSec` | the host's main `update(dt)` loop; if there is no loop (turn-based), tick from turn boundaries or skip the stat |
| Whether to gate (`shouldTrack`) | only if the host visibly gates features on early progression (FTUE flags, unlock thresholds); default is no gate |
| What to mirror to the SDK | only stats referenced by `rundot/collectibles.config.json` grant rules or leaderboard configs, if the host has them; otherwise omit `mirrorToSdk` entirely |
| Screen markup/navigation | copy whatever pattern the host's other screens use, such as a `.game-screen` div with a header and back button toggled by a navigation helper |

## SDK notes

- **Local counters are the source of truth.** The save blob owns the numbers; the SDK mirror is a one-way projection for server-side features. Never read SDK values back into the save.
- `RundotGameAPI.stats.submit(statId, value)` stores the **absolute value, last-write-wins — not a delta**. That's why `syncMirrors()` submits `get(key)` totals: re-syncing is idempotent, and a missed sync self-heals on the next one. Submitting deltas would double-count.
- `submit()` may resolve with collectible `grants` (cards triggered by grant rules in `rundot/collectibles.config.json`). `syncMirrors()` collects and returns them; empty for most calls and safe to ignore.
- Synchronous submits coalesce into one batched RPC — `syncMirrors()` issues them all in the same tick to get that batching.
- **Every SDK call can reject, and an unhandled rejection crashes the game.** `syncMirrors()` try/catches each submit and never throws; keep that posture in any direct `stats.getValue`/`getAllValues` calls you add.
- The stats API is BETA and client-writable — don't treat mirrored stats as a security boundary (see the SDK's `STATS.md` trust-model notes).
- In SDK 5.23+ mock/local dev, submits update an in-memory map and resolve with no grants. `getValue(statId)` returns the submitted number (or `null` before the first submit), so the mirror is directly testable without a host.

## UI adaptation

- **Plain DOM host:** use `statsScreen.ts` + `stats.css` as-is (integration step 5).
- **React/other framework:** don't port the renderer — consume `stats.formattedEntries()` directly and map it to rows; it already carries `label`, `formatted`, and `section` in display order. Re-read it on screen mount (and after runs) rather than subscribing; stats only need to be current when the screen is visible.
- **Canvas-only host:** same — iterate `formattedEntries()` and draw label left / formatted value right per row, with a section line where `section` changes. `stats.css` documents the spacing rhythm (12px padding rows, hairline dividers).

## Verification checklist

1. Fresh save boots with every registry key present and 0 (`stats.defaults()` merged into `defaultSave()`).
2. Trigger a tracked event → stats screen shows the increment; reload → value persisted (debounced flush or lifecycle flush landed it).
3. `playTimeSec` climbs during play and renders `H:MM:SS`; values ≥1,000 render as `1.0K`-style.
4. Add a new registry entry → an existing save shows it at 0 after reload (back-fill), no migration written.
5. If `shouldTrack` is configured: pre-gate events don't count, whitelisted stats do, and post-gate everything counts.
6. If mirroring: after `syncMirrors()`, the returned grants are `[]` in mock mode and `await RundotGameAPI.stats.getValue(statId)` equals the local total; calling `syncMirrors()` twice preserves the same value. Repeat in the RUN host when validating real grant rules.
7. Rendering with an empty container id / before save load doesn't throw (null-safe renderer, `get()` reads 0).
