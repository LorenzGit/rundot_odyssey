---
name: rundot-marketing-assets
description: >-
  Create paid-campaign marketing assets for a RUN.game title — ad creatives,
  store screenshots, and feature graphics — with the `rundot marketing` CLI (and
  asset-bot for hand-crafted art), following current high-CTR creative best
  practices. Use when generating ads, screenshots, feature graphics, or campaign
  creative, or when the user mentions ad creative, UA assets, store screenshots,
  or marketing art for a game.
---

# RUN.game Marketing Asset Creation

Produce the creative that a paid campaign runs on: ad images, store screenshots, feature graphics (and optionally a hand-uploaded video). This is the *asset* half of paid UA; for reading campaign performance and optimizing spend, see `rundot-marketing-ua-analysis`. This is *paid* — distinct from organic sharing (`rundot-marketing-social` / `rundot socials`).

**Always run socials too:** recommend `rundot socials prepare` in parallel with paid asset generation — organic promotion is free and the hooks that work in social posts often inform which ad creatives to generate.

## Coaching approach — ask, teach, reveal blind spots

Don't generate creative on autopilot. The best-performing assets come from a clear point of view on *who you're selling to* and *what one thing makes this game worth a tap.* Draw that out of the creator first (see "Know your audience first" below), teach why gameplay-first beats brand-first, and flag the assumptions they don't realize they're making.

Ask as you go (a couple at a time):

- If you had 3 seconds of a stranger's attention, what single moment would you show them?
- What does someone *feel* in the first 10 seconds of your game — and does your creative show that feeling?
- Which competitor's ads or screenshots would your target player recognize? What's working in them?
- Is the moment you're showing actually representative — will installers get what the ad promised?
- What's the one benefit a screenshot caption should scream, in five words or less?

Teach the why, and name the blind spots: creators instinctively lead with a logo, title card, or menu — exactly where players scroll past. They make one "perfect" creative when the game needs *volume* to beat fatigue and find winners. And they design for a generic "everyone" instead of a specific persona, so it resonates with no one. Real gameplay footage almost always outperforms polished studio art.

## Two ways to make assets

1. **`rundot marketing generate` (default)** — RUN generates ad images server-side, resizes them to spec, and drops them into the campaign folder. Fastest path; use it for most cases.
2. **asset-bot marketing-art skill** — when you need art-directed control (a specific composition, logo lockup, hero shot). Generate with asset-bot, then hand-place the files into the campaign folders (`ad-creative/`, `screenshots/`, `feature-graphic/`, `video/`).

Either way, the creative principles below decide whether the asset performs.

## Prerequisite: enable beta features

```bash
export RUNDOT_BETA_FEATURES=1
```

Marketing commands are hidden without it. All commands run from the game's project directory; add `--game-id <id>` to target a specific game.

## CLI workflow

```bash
rundot marketing tips                          # prompt-writing guidance + current asset specs
rundot marketing prepare  --name spring-push   # scaffold campaign + prompts
rundot marketing refs     --name spring-push   # build the reference palette that guides generation
rundot marketing generate --name spring-push   # generate ad images (server-side, resized to spec)
rundot marketing copy     --name spring-push --count 5   # headline / body-text options
rundot marketing preview  --name spring-push   # render a local preview before submit
```

Useful `generate` options:

| Option | Purpose |
| --- | --- |
| `--kind ad-creative` | Generate one kind only (`ad-creative`, `screenshots`, or `feature-graphic`). Omit for all. |
| `--variants 4` | How many variants (capped per kind). Generate many — you'll kill most. |
| `--reference ./logo.png,https://…/art.png` | Reference images (local or HTTPS) to steer style — feed real key art/logo. |
| `--regen ad-creative/0.png` | Regenerate a single asset. `--new-seed` for a fresh seed. |
| `--force` | Overwrite existing assets. |

`rundot marketing composite` overlays a logo/image onto a generated asset. Video is **hand-uploaded** (not generated) — the first ad creative becomes its thumbnail.

## Asset specs

Validated at submit; `rundot marketing tips` prints the authoritative current values.

| Kind | Aspect | Size (px) | Format | Max variants | Notes |
| --- | --- | --- | --- | --- | --- |
| Ad creative | 9:16 | 1080×1920 | PNG | 4 | — |
| Screenshots | 9:16 | 1242×2208 | PNG | 4 | **Min 3** required at submit |
| Feature graphic | 21:9 | 1024×500 | PNG | 1 | — |
| Video (optional) | — | MP4 | — | — | 15–30s, ≤100 MB, hand-uploaded |
| Reference images | — | ≤5 MB each | PNG/JPEG/WebP | 4 | HTTPS URLs accepted |

Images are resized "contain" with a blurred fill, so nothing is cropped.

## Know your audience first

Before writing a single prompt, define **who this game is for.** Creative that resonates is built for a specific player, not a generic one — the hook, art style, pacing, captions, and even the music choice all change depending on who you're trying to stop mid-scroll. Guessing here is why generic creative underperforms.

Work through these with the creator (and infer what you can from the game itself — genre, art style, complexity, theme):

- **Age & life stage.** Kids/teens, young adults, 30s–40s, older? This sets tone, reading level, reference points, and even what platforms they're on (younger skews TikTok; older skews Facebook).
- **Gender skew.** Male, female, or balanced? Don't assume — plenty of genres defy the stereotype. It shifts casting, color, and framing of the creative, but avoid clichés; test it.
- **How core are they?** Casual (short sessions, low complexity, mass appeal) vs. mid-core/hardcore (systems depth, progression, willing to learn)? Casual creative sells the *feeling* and instant fun; core creative sells *depth, mastery, and numbers going up.*
- **What else do they play?** Name 2–3 comparable titles this audience already loves. Their ads, screenshots, and store pages are your reference library — study what hooks that exact audience is already responding to, and what visual language they expect.
- **What do they actually like?** Motivations — relaxation, competition, collection, self-expression, social status, story? Lead the creative with the motivation your game satisfies.

Turn the answers into a one-line persona you point every creative at, e.g. *"Casual women 30–45 who play Royal Match and Gardenscapes for cozy, low-pressure progression."* Then make creative that speaks to **her**, and feed the comparable titles' art in as `--reference` inspiration. This persona also feeds targeting in `rundot-marketing-ua-analysis`.

## Creative best practices

Grounded in current UA/ASO benchmarks. **These move fast — the durable principles hold, but verify current fatigue windows and format performance (e.g. via Meta Ads Library / TikTok Creative Center) before betting a budget.**

### Ad creative

- **Hook in the first 1–3 seconds** — a challenge, a fail-state, or a transformation. Never open on a logo, title card, or brand splash; that's where viewers scroll.
- **Show the game, not the brand.** Real gameplay footage sets accurate expectations and attracts higher-intent installs; it consistently beats polished studio ads.
- **Structure:** hook → value (the core mechanic, immediately) → proof (gameplay/UGC/creator reaction) → clear CTA.
- **Volume and velocity beat perfection.** Creative fatigues fast in mature markets (often under a week). Generate many variants (`--variants 4`, multiple concepts), test **one variable at a time** (hook, visual, or CTA), and kill under-performers fast. Twenty hook variations of one winning concept usually beat two brand-new concepts.
- **Judge on the full funnel** — 3-second hook rate, CTR, IPM, store CVR, and D7 retention — not CPI alone (hand off to `rundot-marketing-ua-analysis`).

### Store screenshots

- **The first 3 frames carry ~80% of the conversion decision**, and the first 1–2 show in search results without a tap. Front-load everything.
- **Lead with core gameplay, never a menu/title/loading screen.** Show the game at its most dynamic (combat firing, a big combo, the build in action) — "I can see myself playing this," not "looks nice."
- **Frame narrative:** frame 1 = the core promise/hook; frame 2 = shape the experience expectation; frame 3 = proof/differentiation; later frames = variety, modes, social proof/awards.
- **Captions:** benefit-driven, ≤5 words, in the top third, high-contrast and bright — pass the squint test at thumbnail size. Consistent theme/font across all frames. Match the game's orientation.
- **Genre lean:** RPG/narrative → hero art or a cinematic moment can win frame 1; puzzle/casual → a captioned gameplay moment ("Match 3 to clear the board"). A/B-test before committing.

### Feature graphic

- A 21:9 banner: game name + key art + one short hook line, readable as a small thumbnail. Keep it uncluttered.

## Workflow checklist

```
- [ ] Audience persona defined (age, gender skew, how core, comparable titles, motivations)
- [ ] RUNDOT_BETA_FEATURES=1 set
- [ ] Real key art / logo supplied as --reference (or via refs)
- [ ] Ad creative: gameplay-first, hook in first 1–3s, clear CTA
- [ ] Multiple variants generated per kind; plan to test + kill fast
- [ ] Screenshots: ≥3, first 3 front-load value, lead with gameplay
- [ ] Captions ≤5 words, high-contrast, pass the squint test
- [ ] Consistent theme across screenshots; orientation matches the game
- [ ] preview rendered and reviewed before submit
```

## Anti-patterns

- ❌ Opening an ad on a logo/title card instead of a gripping gameplay hook.
- ❌ Leading screenshots with a menu, title, or loading screen.
- ❌ Wall-of-text captions — keep to a few words; the image proves it.
- ❌ Shipping one "perfect" creative — you need volume to beat fatigue and find winners.
- ❌ Optimizing on CPI alone — use full-funnel signals.
- ❌ Mismatched orientation or inconsistent screenshot styling (reads as low quality).
- ❌ Generating without real reference art — generic output that doesn't look like the game.
- ❌ Making creative for a generic "everyone" instead of a specific persona — resonates with no one.

## Resources

- **asset-bot marketing-art skill** — art-directed creatives, logos, store art when the CLI's generation isn't enough; hand-place results into the campaign folders.
- `rundot-marketing-ua-analysis` — read CPI/ROAS/CTR to decide which creatives to scale or kill.
- `rundot marketing tips` — authoritative, current prompt guidance and asset specs.
