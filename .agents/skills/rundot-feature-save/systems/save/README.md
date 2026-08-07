# Save System — versioned, cloud-synced persistence

A single-blob JSON save persisted to `RundotGameAPI.appStorage` (per-title, cloud-synced), with schema versioning, ordered migrations, automatic back-fill of newly added fields, debounced writes during gameplay, lifecycle flush on background/quit, and JSON export/import for QA backups.

**This is the foundational system.** Stats, daily rewards, tutorials, and IAP ownership all persist as fields inside this save blob. If the host game has no save system, integrate this first.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `save.ts` | yes (e.g. `src/helpers/save.ts`) | all machinery — you should not need to edit it |
| `README.md` | no | this guide |

No dependencies beyond the RUN SDK. TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Write the game's save config (new file, e.g. `src/saveConfig.ts`)

The save shape is a single interface; `createSaveSystem` is generic over it, so `saveSystem.load()` / `.data` are fully typed everywhere downstream.

```ts
import { createSaveSystem, fillMissing } from './helpers/save';

// ADAPT: every field your game needs to persist, with its default.
// The interface + defaultSave() are the schema. Adding a field later = add it
// in both places; old saves get it automatically on next load (no migration).
export interface MySave {
    version: number;
    coins: number;
    gems: number;
    upgrades: string[];          // owned upgrade ids
    stats: {                     // see systems/stats (lives inside the save)
        gamesPlayed: number;
    };
    settings: {
        sfxVolume: number;       // numeric 0..1 (not booleans — sliders later)
        musicVolume: number;
        haptics: boolean;
    };
    // one-shot flags (tutorials seen, popups shown) also live here
}

export function defaultSave(): MySave {
    return {
        version: 1,
        coins: 0,
        gems: 0,
        upgrades: [],
        stats: {
            gamesPlayed: 0,
        },
        settings: {
            sfxVolume: 1,
            musicVolume: 0.5,
            haptics: true,
        },
    };
}

export const saveSystem = createSaveSystem<MySave>({
    key: 'my-game-save',         // ADAPT: '<game-name-kebab>-save'
    version: 1,                  // bump when the SHAPE changes (see playbook)
    defaultSave,
    migrations: {
        // ADAPT: empty until you ship a shape change. Examples in the playbook.
    },
    validate(s, def) {
        // ADAPT: nested-shape guards for anything beyond top-level fields.
        // `s` is typed LegacySave (unknown historical shape) on purpose —
        // these guards are what MAKE it a valid MySave.
        if (typeof s.stats !== 'object' || !s.stats) s.stats = def.stats;
        fillMissing(s.stats, def.stats);
        if (typeof s.settings !== 'object' || !s.settings) s.settings = def.settings;
        fillMissing(s.settings, def.settings);
        if (!Array.isArray(s.upgrades)) s.upgrades = [];
        if (!(s.coins >= 0)) s.coins = 0;   // also catches NaN/undefined
        if (!(s.gems >= 0)) s.gems = 0;
    },
});
```

### 2. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { saveSystem } from './saveConfig';

await RundotGameAPI.initializeAsync();     // must precede load()
game.save = await saveSystem.load();       // never throws; always a valid MySave
saveSystem.attachLifecycleFlush();         // onSleep/onQuit durability
saveSystem.exposeConsoleHelpers('myGameSave');  // optional QA backup/restore
```

`game.save` and `saveSystem.data` are the same object; expose it wherever the host keeps shared state. (`.data` is typed `MySave | null` — null only before `load()`; hold the object `load()` returns and you never need a null check.)

### 3. Game loop (only needed for high-frequency state)

```ts
function update(dt: number): void {  // dt in seconds
    game.save.stats.playTimeSec += dt;   // example continuous counter
    saveSystem.markDirty();
    saveSystem.tick(dt);                 // flushes at most every 5s
}
```

If the host game has no per-frame loop (turn-based, event-driven), skip `tick()` and just call `save()` on events.

### 4. Everywhere state changes

```ts
game.save.coins += reward;
saveSystem.save();              // fire-and-forget; call liberally (~cheap)
```

Rule of thumb: **immediate `save()` on every discrete event** (purchase, unlock, level end, settings change), `markDirty()` for per-frame counters.

## Migration playbook

- **Additive field** (new currency, new flag): add to the `MySave` interface and `defaultSave()`. Done — the back-fill loop fills it into old saves. No version bump required.
- **Nested additive field** (new key inside `stats`): add to the interface and `defaultSave()` *and* make sure `validate()` calls `fillMissing()` on that subtree.
- **Shape change** (rename, type change, restructure): bump `version` and add a migration. Migrations receive `LegacySave` (the old, untyped shape) — that's the correct type, since the incoming blob predates your current interface:

```ts
version: 2,
migrations: {
    // v1 stored ownedPets as a count; v2 stores an array of ids
    2(s, def) {
        if (typeof s.ownedPets === 'number') {
            s.ownedPets = DEFAULT_PET_IDS.slice(0, s.ownedPets);
        }
        if (!Array.isArray(s.ownedPets)) s.ownedPets = [];
    },
},
```

- **Derived back-fill** (new feature shouldn't retro-trigger for veterans): compute from existing progress inside the migration, e.g. mark unlock popups as already-seen for players past the unlock point.
- **Hard reset** (schema drifted beyond repair — rare escape hatch, loses player progress, avoid after launch): `2(s, def) { return def; }` — returning an object replaces the save.

Each migration runs exactly once per save (version-gated, stamped after). Keep old migrations forever; a player can return after any number of versions.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| `key` | kebab-case the game's name from `package.json`/`index.html` title + `-save` |
| What goes in `MySave`/`defaultSave()` | scan the host code for mutable progression state: currencies, inventories, unlocks, settings, one-shot UI flags, stat counters. Anything reset on refresh today that shouldn't be. |
| Where to call `load()` | the host's boot path, immediately after (or add) `await RundotGameAPI.initializeAsync()` |
| Where to call `tick(dt)` | the host's main update loop, if one exists |
| Existing persistence to replace | grep for `localStorage`/`appStorage` usage — browser storage doesn't work in the production RUN iframe; migrate any such state into this system |

## SDK notes & limits

- `appStorage` values are strings; the blob comfortably fits **256 KiB** (hard cap ~977 KiB). One blob is the right call until you approach that; past it, split by lifecycle (`settings` / `progress` / `inventory`) per SDK guidance.
- Key rules: ≤256 bytes, no `.`, no leading `__`.
- Cloud sync is transparent and **last-write-wins** across devices — there is no merge. Don't design multi-device simultaneous play around this.
- All storage calls in `save.ts` swallow errors by design: a storage failure must never crash the game.
- Very large numbers (idle-game currencies beyond 2^53) lose precision as raw JSON numbers — store those as strings and parse at the edges.
- `importJson` intentionally skips migration so the next boot exercises the real migration path against the imported backup.

## Verification checklist

1. Fresh profile boots with `defaultSave()` values (mock mode: clear storage or use a new key).
2. Change state → `save()` → reload → change persisted.
3. Hand-corrupt the stored value (console: `RundotGameAPI.appStorage.setItem(key, '{oops')`) → game still boots on defaults, no crash.
4. Add a field to `defaultSave()` → existing save gains it on next load.
5. Bump `version` with a logging migration → runs exactly once, not on subsequent loads.
6. `window.<name>.export()` prints valid JSON; `.import()` of an edited copy round-trips after reload.
