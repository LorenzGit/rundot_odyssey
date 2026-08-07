# RUN SDK notes (distilled)

Condensed facts from the RUN SDK v5.23.0 documentation that the system templates rely on. **If the host game has local SDK docs, prefer `rundot/docs/` (legacy installs: `.rundot/docs/`) as the source of truth** because the SDK evolves.

## Import & initialization

```js
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

await RundotGameAPI.initializeAsync();   // once, at boot, before any other SDK call
```

The SDK initializes on import and `initializeAsync()` resolves when the host handshake completes. Gate *all* host RPCs behind it.

**Every SDK method can reject, and an unhandled promise rejection crashes the game.** Always `try/catch` (or `.catch()`) around SDK calls. In local dev there is no host, so the SDK uses mocks; treat unexpected `null`/failure as "unknown," never as an error state shown to the player.

### Local mock contract (SDK 5.23+)

The playground mocks are deterministic, not a blanket set of no-ops:

- Ads report `capabilities.ads: true` and ready state `true`; showing a rewarded ad opens the mock overlay and resolves `true` when it completes.
- IAP starts with 100 hard currency, returns the mock currency icon, supports spending and store top-ups, and exposes mock subscription state/data. The mock subscription catalog contains a weekly `CORE` row and `isUserSubscribed(tier)` resolves `true`; a template configured for another tier may therefore have active status without a matching price row.
- Stats store submitted absolute values in memory. `submit()` resolves `{grants: []}`, `getValue()` returns the stored number or `null`, and `getAllValues()` returns the stored map.
- Environment reports the browser locale from `navigator.language` (falling back to `en-US`) and enables ads, purchases, and subscriptions.

Other surfaces may still no-op or return empty/null values. Test the deterministic behavior above directly, keep production failure handling in place, and do not use a mock-mode failure expectation as verification.

RPC and transport failures reject: structured failures are `RundotApiError` instances with `code` and `message`, while `RATE_LIMITED` failures are `RateLimitedError` instances with `retryAfterMs`. Catch these errors instead of inspecting the resolved value. A few methods model expected failures in their own result type — for example, `iap.spendCurrency()` can resolve `{ success: false, error?: string }` — but those method-specific results do not replace `try/catch` for RPC failures.

**Host-provided dependency:** the SDK leaves firebase out of its own dependencies and marks `firebase/*` external, because only playground mode imports it — so the host game declares it. Put it in **`devDependencies`** (e.g. `^12.16.0`): it is needed at build time, never reaches the production bundle (the dynamic import is tree-shaken), and `devDependencies` is what the SDK's own Vite plugin tells you to run when it detects the dep missing (`npm install --save-dev firebase@^12.7.0`). Without it, `vite build` fails with "Rollup failed to resolve import firebase/app".

**TypeScript typings (pinned 5.23.0, re-checked against published 5.24.0):** the SDK ships full `.d.ts` types, and every surface the templates use (`iap`, `ads`, `stats`, `notifications`, `analytics`, `lifecycles`, `appStorage`, `preloader`, plus the top-level time methods) is properly typed on `RundotGameAPI`. Never cast around a "missing" member: a member absent from the type is almost certainly absent at runtime too, so the cast trades a compile error for a silent runtime failure (see the Time note below for the canonical trap). The one real gap is that the `/api` entry doesn't re-export named result types — extract them from the method signatures instead, e.g. `type SpendCurrencyResult = Awaited<ReturnType<typeof RundotGameAPI.iap.spendCurrency>>` (`systems/iap-shop/iapShop.ts` shows the pattern).

## Lifecycles (`RundotGameAPI.lifecycles`)

Six hooks, each returning `{ unsubscribe() }`; callbacks take no payload:

| Hook | When | What templates do |
|---|---|---|
| `onPause` / `onResume` | overlay/host UI covers the game | pause the game loop (keep rAF alive, skip update/render, reset the `dt` clock on resume) |
| `onSleep` / `onAwake` | app backgrounded / restored | **flush the save on `onSleep`** — this is the primary durability guarantee |
| `onBackButton` | Android hardware back | optional; unregistered = host performs default quit |
| `onQuit` | terminal shutdown | flush the save, but **never rely on `onQuit` firing** (hard kill skips it) |

**Gotcha:** don't fire fresh RPCs (notification scheduling, analytics) from `onSleep`/`onQuit` — a hard close tears down the JS runtime before the RPC reaches the host. Schedule reminders while the app is alive (boot, resume, end-of-session screens).

## Storage (`RundotGameAPI.appStorage` and friends)

Four scopes: `deviceCache` (per-device, cross-game), **`appStorage` (per-title, cloud-synced — use this for save data)**, `ownerStorage` (per-player across one creator's titles), `sharedStorage` (cross-app by namespace).

All buckets: `getItem(key)` → `Promise<string|null>`, `setItem(key, value)`, `removeItem`, `clear`, `length`, `key(i)`. Cloud buckets add `getAllItems` (keys), `getAllData` (key→value map), `setMultipleItems([{key,value}])`, `removeMultipleItems([keys])`.

- Values are **strings** — `JSON.stringify` on write, parse on read.
- Keys: non-empty, ≤256 UTF-8 bytes, no `.`, must not start with `__`.
- Limits: **128 items/bucket, ~977 KiB hard per value (256 KiB comfortable), 10 MiB/bucket, 400 items/batch call.**
- Cloud sync is transparent, last-write-wins. No merge/conflict API.
- Error codes to know: `INVALID_ARGUMENT`, `PROFILE_REQUIRED`, `QUOTA_EXCEEDED`, `RATE_LIMITED`.
- Browser storage (`localStorage`, IndexedDB, cookies) is **unavailable in the production game iframe** — never use it for real persistence.
- Doc guidance: prefer a few medium values grouped by lifecycle over one giant blob or hundreds of tiny keys. A single save blob is fine while comfortably under 256 KiB.

## Time (top-level on `RundotGameAPI`)

```js
const info = await RundotGameAPI.requestTimeAsync();
// { serverTime, localTime, timezoneOffset, formattedTime, locale }
```

`serverTime` (epoch ms) is the trusted clock. Doc best practice: **cache the response and extrapolate locally** (`serverBase + (Date.now() - sampleTime)`) rather than spamming the endpoint — `shared/serverTime.js` implements exactly this. `getFutureTimeAsync({days, timeOfDay, timezone})` returns a trusted future epoch (useful for fixed-timezone daily resets, e.g. midnight PT).

Note: the time methods are **top-level only** — there is no `time` namespace on the public API object (`RundotGameAPI.time` is `undefined` at runtime, so `RundotGameAPI.time.requestTimeAsync()` throws). Verified against SDK 5.24.0: the typings declare only the top-level form; a `time` namespace exists solely on the SDK's internal `Host`, which games never see.

## IAP / hard currency (`RundotGameAPI.iap`)

Two models exist; know which you're using:

- **Low-level RunBucks model (what our shop template uses):** client-defined catalog, `iap.spendCurrency(productId, amount, options?)` → `Promise<{success, error?}>`, ownership persisted in the game's own save. `options.description` shows in the host confirm dialog. The only stable `error` value is `'USER_CANCELLED'` — never branch on other error strings. `spendCurrency` auto-opens a top-up flow if the player is short. No receipt/transaction ID is returned — keep your own analytics audit trail.
- **High-level server-config Shop (`RundotGameAPI.shop.getCatalog()` / `shop.purchase(itemId, idempotencyKey)`) + Entitlements (`RundotGameAPI.entitlements.*`):** server-authoritative catalog and ownership, order objects with status history, idempotency keys. More setup, stronger guarantees. Our template documents when to prefer it.

Also: `iap.getHardCurrencyBalance()` → `Promise<number>`; `iap.openStore()` → `Promise<{purchased, newBalance}>` (`newBalance` is authoritative); `iap.getCurrencyIcon()` → `{base64Data}` (**raw base64, not a URL** — prefix with `data:image/png;base64,`); `iap.hasUserMadePurchase()` → boolean.

Subscriptions: `iap.isUserSubscribed(tier)` (tier hierarchy — higher tiers satisfy lower checks), `iap.getSubscriptions(tier?)` (live prices: `{currencyCode, interval, price, description}`), `iap.purchaseSubscription(tier, interval)` with lowercase `'weekly'|'monthly'|'annual'`. Check `system.getEnvironment().capabilities.subscriptions` before showing sub UI (false on e.g. Steam).

## Notifications (`RundotGameAPI.notifications`)

`isLocalNotificationsEnabled()`, `setLocalNotificationsEnabled(true)`, `scheduleAsync(title, body, delaySeconds, customId)`, `cancelNotification(customId)`. Best practices: dedupe with meaningful custom IDs (cancel-first, then schedule), cancel when the task is done, small payloads, try/catch everything, and schedule while alive (see lifecycle gotcha above).

## Stats (`RundotGameAPI.stats`, BETA)

Schemaless per-user `(statId → number)` store: `submit(statId, value)` (**absolute value, last-write-wins — not a delta**; may return collectible `grants`), `getValue(statId)`, `getAllValues()`. Synchronous submits coalesce into one batched RPC. Main purpose: triggering server-side collectible grants and feeding leaderboards. Local accumulators remain the source of truth; mirror totals with `submit(statId, total)` on flush if you want SDK-side features.

## Environment & deployment

- `system.getEnvironment()` → `{ platform, platformVersion, capabilities }` — gate ads UI on `capabilities.ads`, subscription UI on `capabilities.subscriptions`.
- Vite config needs `base: './'` (games are served from a subdirectory); build output `dist/`; `game.config.prod.json` carries the `gameId`.
- **Thumbnail**: `public/thumbnail.jpg`, **exactly 512×512**, JPG. `rundot deploy` uploads it automatically — and fails on wrong dimensions or an unreplaced default/template thumbnail. Always replace placeholder thumbnails with real game art before deploying.
- **Native preloader** (`RundotGameAPI.preloader`): `showLoadScreen()` / `hideLoadScreen()` / `setLoaderProgress(0..1)` / `setLoaderText(text)`. `usesPreloader` in `game.config.*.json` controls whether the host shows its loader automatically at launch. The `starter/` template sets it `false` and renders its own loading screen; either approach works, but pick one — both at once double-covers the screen.
- Analytics surface (`trackFunnelStep` / `recordCustomEvent` style) is separate from stats and storage.
