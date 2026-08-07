---
name: rundot-marketing
description: Create and run paid ad campaigns for your RUN game with the rundot marketing CLI — prepare creative, write copy, preview, and submit. Use when a creator wants to market their game, make ad creative, or launch/track a paid campaign.
---

# Market your RUN game

Generate creative and run paid ad campaigns for **your own RUN game** through the
`rundot marketing` CLI. Meta submissions can spend after flight; Unity submissions
end paused and require Unity creative approval plus human flighting.

## Before you start

- **Beta feature:** every `marketing` subcommand is gated behind
  `RUNDOT_BETA_FEATURES=1`. If the commands aren't visible, this isn't enabled
  for you yet — stop and tell the creator rather than guessing.
- **Logged in:** `prepare` / `generate` / `submit` hit prod, so run `rundot login` first.
- These commands manage campaigns for the game configured in the current
  directory (the one `rundot init` set up).

## Lifecycle

```
prepare → refs → fill the prompt briefs → generate → review/--regen → preview → submit → status / stats
```

1. **`rundot marketing prepare --name <name>`** — scaffolds the campaign folder,
   pulls the game's name/description/keywords/thumbnail into `campaign.json`, and
   prints the creative format summary (dimensions, counts, byte caps). Optionally
   set `--platforms` and `--campaign-type` here (see below).
2. **`rundot marketing refs --name <name>`** — assembles a labeled reference
   palette and prints paste-ready `--reference <path>:<label>` lines (it also
   scans your repo's own art). Pick the most recognizable cast.
3. **Fill the briefs** — each kind's prompt in `campaign.json` has a single
   `[[AGENT: …]]` line; replace it with concrete creative direction (name the
   characters, pose, camera, lighting, palette). `generate` refuses any prompt
   that still contains the `[[AGENT:` sentinel.
4. **`rundot marketing generate --name <name>`** — generates one numbered image +
   sidecar per ad creative. For Unity, it also generates the required single 15-second
   portrait MP4 from `prompts.video`. Default image model is fast/cheap; pass
   `--model gemini-3-pro-image-preview` when quality matters. Use `--regen` /
   `--new-seed` / `--reference` to iterate (previous versions are kept in
   `.history/`). Run `rundot marketing tips` for the full creative best-practices guide.
5. **`rundot marketing preview --name <name>`** — opens a **local, offline**
   browser preview of the exact images + copy that `submit` will ship (no network,
   no auth). Always preview before submitting.
6. **`rundot marketing submit --name <name>`** — uploads assets and creates the
   provider campaign. Meta may spend after flight; Unity creates a paused install
   campaign and waits for Unity creative moderation. It prints a pre-flight summary
   + irreversibility note first.
7. **`rundot marketing status --name <name>`** / **`stats --name <name>`** — track
   flight status/budgets and performance (spend, installs, CPI, ROAS).

## Spend safety — this is the creator's money

`submit` is not the Unity spend step: Unity remains paused until a human flights an
approved pack. Before and after submit, these are the levers:

- **Set the budget deliberately** at submit time (`prepare --budget <USD> --days <n>`
  — one campaign-wide total over a fixed window), and adjust a running campaign
  with `rundot marketing budget --name <name> --budget <USD>`.
- **Pause / resume** a running campaign: `rundot marketing pause --name <name>`
  and `rundot marketing resume --name <name>`.
- **Stop it for good:** `rundot marketing cancel --name <name>` permanently
  cancels the campaign (and stops spend).
- **See everything:** `rundot marketing list` shows every campaign with status,
  spend, installs, and ROAS; `status` / `stats` drill into one.

Never `submit` without confirming the creator understands a real budget will be
spent. If they're unsure, stop at `preview` and confirm the plan first.

## Ad copy is campaign-level (author once)

Meta folds every image into one Dynamic Creative feed and applies a single
**headline × primary-text** set across it. So author copy **once** in
`campaign.json`:

- `"headlines"` (≤ 40 chars) and `"primaryTexts"` (≤ 125 chars), up to 5 options
  each. Numbered sidecars carry prompt/seed/refs only — putting copy there does nothing.
- `generate` seeds defaults from the game name/description; edit them before submit.
- `submit` resolves copy `campaign.json` → first sidecar (back-compat) → defaults,
  then replicates the resolved set onto every creative. `preview` resolves the
  same way, so preview always matches what ships. `submit` fails only if the
  *resolved* copy is a placeholder, too long, or has too many options.

## Platforms, dimensions, and campaign type — different axes

- **`--platforms web,ios,android`** (set at `prepare`) selects which Meta **ad
  legs** run. It does **not** change creative dimensions. Omit to run Android only;
  web and iOS are explicit selections. The web-only `run` network defaults to web
  when `--platforms` is omitted.
- **Creative dimensions** (WxH, counts, byte caps) are identical across
  platforms — see the summary `prepare` prints, or `rundot marketing tips`.
- **`--campaign-type traffic-install` (default) | `purchase` | `value`** sets what
  Meta optimizes toward. `purchase`/`value` only work once Meta is receiving live
  `Purchase` events for the game — otherwise delivery stalls; use the default if
  that signal isn't live.

For Google web Demand Gen campaigns, **`--google-bidding maximize-clicks` (default) |
`maximize-conversions`** selects the bidding mode. Maximize clicks works without a
Google Ads conversion action; maximize conversions requires conversion tracking in
the Google Ads account. The selected mode is persisted in `campaign.json` and is
included in submit telemetry.

For Unity, use `--network unity` with exactly one explicit mobile platform
(`--platforms ios` or `--platforms android`), `--target-cpi <usd>` ($0.01–$100),
one square image, and one MP4. `marketing generate` creates the MP4 after the
prepared video brief is filled. Submit creates a paused install campaign that waits
for creative approval before it can be launched. Use `status` to check readiness.

## Submit is irreversible

Campaigns are **never edited in place**. To revise a submitted campaign: stop it
with `rundot marketing cancel --name <name>`, then submit the revision under a
**new** `--name` (names are single-use, even after cancel). Iterating on *assets*
is free up until `submit` — use `--regen` and `preview` as much as you want first.
