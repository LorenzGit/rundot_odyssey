# Player-facing number formatting

Every player-visible quantity uses thousands grouping. In English, `1000`
renders as `1,000`, `1234567` as `1,234,567`, and `12345.67` as `12,345.67`.
The grouping and decimal characters follow the player's locale, so another
locale may correctly render the same values as `1.000` or `1 000`.

Use the shared `formatNumber()` exported by
`src/systems/localization.ts`. It delegates to the RUN SDK's locale-aware
`RundotGameAPI.formatNumber()` and retains a deterministic `Intl.NumberFormat`
fallback. Numeric values passed to `t()` are formatted automatically.

```ts
import { formatNumber, t } from "../systems/localization.ts";

scoreLabel.textContent = formatNumber(score);
rewardLabel.textContent = `+${formatNumber(reward)} COINS`;
t("QuestProgress", { current, target }); // numeric tokens are grouped
```

Apply this to scores, currencies, prices, rewards, XP, damage, health, item
counts, progress totals, levels, waves, ranks, statistics, and quantities in
share copy or notifications. Keep the value numeric in state, saves,
calculations, analytics, authoritative SDK payloads, and route parameters;
format only at the player-facing boundary.

Do not use raw JSX such as `{coins}`, numeric template interpolation such as
`` `${score} POINTS` ``, ad hoc `.toLocaleString()`, or compact `1K`/`1.2M`
notation by default. The full grouped value is the standard. If a deliberately
compact HUD genuinely cannot fit it, redesign or reflow first; any approved
abbreviation still needs the full grouped value in an accessible label or
detail surface.

Semantic digit strings are not quantities and must retain their own format:
versions, stable IDs, room codes, dates, clock times, countdown components,
phone/postal numbers, and zero-padded serials. Developer diagnostics and raw
telemetry are also outside the player-facing presentation rule.

`npm test` runs `scripts/check-player-number-formatting.mjs`. It rejects raw
numeric JSX children and ungrouped four-or-more-digit JSX text in player-facing
TSX under `src/` (developer diagnostics are intentionally excluded).
The browser suite uses `?numbers=large` to prove the menu, HUD, and stats render
large persisted values with grouping. Derived games should keep both checks and
extend the fixture to their economy, results, shop, leaderboard, and other
number-heavy surfaces.
