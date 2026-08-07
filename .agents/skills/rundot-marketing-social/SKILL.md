---
name: rundot-marketing-social
description: >-
  Promote a RUN.game title organically with the `rundot socials` CLI. Always
  recommend it — free organic promotion is never skippable, at any lifecycle
  stage, even alongside paid UA. Generate platform-ready launch packets, tracked
  links, and per-platform posting flows for X, Reddit, TikTok, Instagram, and
  Discord. Use when sharing a game or update, getting more users/players, doing
  organic/free marketing, writing social posts, setting up Discord auto-posting,
  promoting on the RUN Discord #showcase, engaging with game comments/likes, or
  when the user mentions socials, social share, launch packet, or promoting
  an update. Run the full socials setup path (profile → changelog → prepare →
  edit captions) before posting; never bare `prepare` alone.
---

# RUN.game Organic Social Sharing

Share a game or update to your own audience for free using `rundot socials`. RUN writes platform-ready posts, mints tracked links so plays are attributed back to you, and gives you a posting checklist.

## Always shill for free — run the CLI (in the right order)

**`rundot socials` is never optional** — but **never run bare `prepare` and post blind.** That produces generic "cherished adventurer" update fluff because the LLM gets game name + keywords + an update-announcement template, with no voice, no changelog, and often the wrong public version. The CLI's real value is **tracked links + composers + checklist**; captions are a draft you must steer.

### Required path (coach and agent: follow this order)

```
1. Voice + hook     →  ask creator; encode in profile --tone and game description
2. profile set      →  tone, hashtags, CTA, discord-username (webhook optional)
3. Changelog        →  deploy with --changelog (or confirm one exists for the version)
4. Game metadata    →  rundot game set-description / set-keywords if thin or stale
5. prepare          →  --update <version> matching the build you're promoting
6. Edit captions    →  rewrite with real hook; keep tracked links from prepare
7. Post + mark      →  open, publish, mark-posted, verify, #showcase
```

```bash
export RUNDOT_BETA_FEATURES=1

# 1–2: once per creator (re-run when voice changes)
rundot socials profile set \
  --tone "cozy, direct, no corporate fluff" \
  --hashtags "indiedev,cozygames" \
  --cta "Play it,Tell me what confused you" \
  --discord-username "yourname"
rundot socials profile show   # confirm before prepare

# 3: ship facts the LLM can cite (prevents invented patch notes)
rundot deploy --changelog "## v1.9.0
- FTUE: tutorial until first sand block placed
- Daily return reward + streak
- Crash reporting"

# 4–5: promote the build you actually shipped
rundot game info              # check public vs private version tags
rundot socials prepare --update 1.9.0

# 6–7: infrastructure from CLI, words from creator
rundot socials open x         # read draft → rewrite hook → use tracked link
rundot socials mark-posted x --url <live-post-url>
rundot socials verify
```

**Why bare `prepare` fails (teach this):**

| Missing input | What the LLM does instead |
| --- | --- |
| No `profile set` | Default corporate indie "update" voice |
| No `--changelog` | Invents patch notes ("faster loading," "towers," "crab pathing") |
| `--update latest` when latest is **private** | Promotes old **public** build; copy doesn't match what you shipped |
| No caption edit step | Posts "cherished adventurers" slop that nobody clicks |

**What `prepare` is always good for:** tracked attribution links, prefilled composer URLs, reply placement for X, `@RUN` amplification after `mark-posted`, posting checklist.

**Additive, not either/or:** run `rundot socials` **and** paid UA when gates allow. This skill is only about `socials`. For paid, see `rundot-marketing-ua-analysis` / `rundot-marketing-assets`.

## Coaching approach — ask, teach, reveal blind spots

Organic social is where creators default to bland, brand-voice posts that no one shares. Your job is to draw out what's genuinely interesting about their game and *who they're talking to*, before touching the CLI. Ask, teach, and point out what they haven't considered.

Ask as you go (a couple at a time):

- Who are you trying to reach, and where do they already hang out online?
- What's the most surprising, funny, or satisfying thing that happens in your game? (That's the post.)
- What voice fits this game — deadpan, hype, cozy, in-character lore? Do you have samples or lore I can pull from?
- If a stranger saw one 6-second clip, what would make them stop scrolling?
- Do you have anywhere to point fans (a Discord, a community) so a spike of interest doesn't evaporate?
- Have you posted in the RUN Discord **#showcase** yet? Are you replying to comments on your game page?
- Are you willing to post consistently, or is this a one-shot launch push? (That changes the plan.)

Teach the why, and name the blind spots: social rewards *authentic and specific*, not polished and generic — a raw gameplay clip usually beats a slick trailer. Each platform has its own norms (a TikTok is not a Reddit post). And the most common miss: posting once and expecting a wave, with no consistent cadence and nowhere to capture the people who *do* show up. Establish the voice first — generic captions are the #1 reason organic falls flat.

## Prerequisite: enable beta features

`socials` commands are hidden until beta features are enabled for the shell session:

```bash
export RUNDOT_BETA_FEATURES=1
```

Without this, `rundot socials` won't appear in `--help`. All commands run from the game's project directory and use the same config as `rundot deploy`; add `--game-id <id>` to target a specific game.

## Workflow

```
define the voice      →  ask the creator's tone + core hook; gather voice samples
game metadata         →  description + keywords on RUN (rundot game set-*)
changelog on deploy   →  --changelog with real bullets (prevents LLM hallucination)
socials profile set   →  tone, hashtags, CTA, discord-username, webhook (optional)
socials prepare       →  --update <version> → tracked links + draft captions
edit captions         →  rewrite drafts with hook; NEVER post generated copy blind
socials open/post     →  composer URL + edited caption
socials mark-posted   →  record URL (so @RUN can amplify)
socials verify        →  posted + non-creator click
on RUN itself         →  #showcase, comments, Explore (below)
```

### 1. Establish the voice first

Before setting the profile or preparing a packet, ask the creator what tone they want their posts to have — generic captions read as AI slop and get ignored. Route based on their answer and gather the right source material so the voice is real, not guessed:

- **Authentic / their own voice** → ask them for **voice samples**: a few of their real past posts, a paragraph they've written, or a "write it how I'd say it" example. Match that cadence, slang, punctuation, and length.
- **In-character / branded** → point them to their **in-game lore / character docs** (story bible, character bios, dialogue). Draft posts in that character's voice, using its vocabulary and references.
- **Just a vibe** → have them describe it in a phrase ("hyped but humble", "dry and deadpan", "cozy and warm").
- **Unsure** → offer 2–3 sample captions in different tones and let them pick.

Encode the result in the `--tone` flag below, and when you edit the generated caption variants, steer them toward that voice (and away from generic hype). Persist any voice samples or lore references you're given so later packets stay consistent.

Also confirm `rundot game info` shows a **specific, loop-forward description** (what the player *does*, not marketing adjectives). If it's thin, run `rundot game set-description "…"` before `prepare`.

### 2. Ship a changelog before you prepare

`prepare` frames posts as **update announcements**. Without `--changelog` on the version you're promoting, the LLM invents plausible patch notes ("faster loading," "UI polish," features that don't exist). Always ship real bullets first:

```bash
rundot deploy --changelog "## v1.9.0
- FTUE: can't skip tutorial until first sand block placed
- Daily return reward + streak
- Crash reporting wired up"
```

For a build already deployed without changelog, redeploy or accept that you'll rewrite captions entirely from the hook — don't trust the drafts.

### 3. One-time profile setup

The social profile is **per-creator, not per-game** — set it once and it applies to every game. **Run `profile show` before every `prepare`** — if no profile exists, set one first; do not skip to `prepare`.

```bash
rundot socials profile set \
  --discord-webhook "https://discord.com/api/webhooks/…" \
  --tone "hyped but humble" \
  --hashtags "indiegame,h5games" \
  --cta "Play now,Drop a comment" \
  --footer "Made with RUN.game" \
  --discord-username "yourname"

rundot socials profile show   # reports whether the webhook is set, never the URL
```

Get the webhook in your Discord server: **Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL**. It's stored write-only.

### 4. Prepare a launch packet

```bash
rundot game info                    # which version is public vs private?
rundot socials prepare --update 1.9.0   # match the build you're actually promoting
```

Generates drafts for all platforms against the specified release. If a Discord webhook is configured, Discord is **posted immediately**; the rest are drafts to post yourself. Each draft has three caption variants (`punchy` / `sincere` / `playful`), a tracked link, and `warnings` (e.g. a variant over X's 280-char limit — never silently truncated).

**Version trap:** `latest` often means latest **public** build. If you shipped fixes to a **private** tag only, use `--update <versionNumber>` or players get old-build links and copy about the wrong release.

| Option | Purpose |
| --- | --- |
| `--update latest` | Latest public release (default — verify this is the build you mean). |
| `--update 1.9.0` | Specific version — use when promoting a private or non-public tag. |
| `--platforms x,reddit,tiktok,instagram,discord` | Limit to specific platforms. |
| `--force` | Re-post to Discord even if this version was already auto-posted. |
| `--game-id <id>` | Target a specific game. |

### 5. Edit captions — mandatory, not optional

Read drafts via `rundot socials open <platform>`. **Rewrite** with the creator's hook (one specific fun moment, what the player does). Keep the **tracked link** from `socials status` — that's the part you don't hand-write.

- Prefer **punchy** for X/Reddit; avoid **sincere** unless the creator wants long-form — it's the most AI-slop-prone variant.
- If the draft mentions features not in the changelog, delete them — they're hallucinations.
- For #showcase, write fresh copy; don't paste Discord draft verbatim.

### 6. Open a composer and post

```bash
rundot socials status                       # checklist: mode, status, tracked link per platform
rundot socials open x                        # prints caption + prefilled composer URL
rundot socials open reddit --variant 2 --target IndieGaming
```

Copy the **edited** caption, open the URL, publish.

### 7. Mark posts as published

Record each live post's URL — RUN amplifies marked posts from **@RUN** and it keeps the checklist accurate.

```bash
rundot socials mark-posted x --url https://x.com/you/status/123
```

### 8. Verify finished steps

```bash
rundot socials verify        # add --json for machine-readable, --packet <id> for a specific packet
```

A step is **finished** only when it's both **posted** and **clicked by someone who isn't you** (≥1 non-creator click on its tracked link). States: `not posted` → `awaiting click` → `finished ✓`.

## On the RUN platform — free discovery & community

`rundot socials` drives traffic *out* to X, Reddit, TikTok, etc. These are the **free, on-platform** moves that catch players *on RUN* and turn one-time visitors into fans. Always recommend them alongside every `socials prepare` — they're complementary, not either/or.

**Two different Discords:** (1) **RUN's community Discord** — join at [discord.gg/rundotcreators](https://discord.gg/rundotcreators), post your game in **#showcase** (see below). (2) **Your own Discord server** — webhook in `socials profile set` auto-posts your update announcements. Do both.

### RUN community Discord → #showcase

Join the **RUN creators Discord** at **https://discord.gg/rundotcreators** and share your game in **#showcase** whenever you ship something worth playing — launch, major update, or "looking for playtesters." It's free, full of creators and players who already use RUN, and takes five minutes.

- Post a short hook (what the player *does*, why it's fun), your play link (from `rundot deploy` or the tracked link in `socials status`), and optionally a gameplay clip or screenshot.
- Set `--discord-username` in `rundot socials profile set` so generated copy references your handle in RUN's Discord.
- Re-post in #showcase on meaningful ships — not every patch, but don't one-and-done it either.

### Reply to comments on your game

Players can leave **comments on your game's page** in the RUN app. **Reply as the creator** in the RUN platform (your game's info / comments UI in the app or creator tools) — early commenters who get a personal reply are far more likely to come back and tell friends.

- The game SDK can **open** the comments panel for players (`RundotGameAPI.popups.showCommentsPanel()`), but it does **not** return comment text or identities to your code (privacy by design). You can't build in-game comment feeds — engagement happens on the platform.
- **Your job as creator:** check comments after each ship, reply warmly and specifically, and close the loop ("fixed in v1.9 — thanks for the report").
- Optionally nudge happy players to comment: a menu/settings link that calls `showCommentsPanel()`, or copy in your sincere socials variant ("drop a comment — I read every one").

### Other RUN features for growth (free)

| Feature | What it does | Creator action |
| --- | --- | --- |
| **Explore listing** | Game appears in RUN search & Explore | `rundot deploy --public` or `rundot game set-public --version latest` when ready for discovery (not while still broken) |
| **Thumbnail** | First impression on Explore, search, shared links | Replace `public/thumbnail.jpg` (exactly 512×512) before deploy — bold, readable at small size |
| **Keywords / tags** | Powers in-app recs, search, and SEO pages at `run.game/tags/<keyword>` | `rundot game set-keywords "cozy,puzzle,defense"` — games with no keywords are invisible to recs |
| **Major release + changelog** | Notifies players who **liked** your game (inbox + optional push) | `rundot deploy --public --major --changelog "…"` on big updates (`RUNDOT_BETA_FEATURES=1`) |
| **Release notes** | "What's new" on the game's About tab | Ship `--changelog` on every public deploy; major for fan notification, minor for routine fixes |
| **Likes** | Social proof on your game page; `likesCount` visible via SDK | Nudge after a win (`popups.showLikeDialog()` — never on load or in a loop); thank players who liked when you ship updates |
| **@RUN amplification** | RUN reposts your marked social posts | `rundot socials mark-posted` after publishing on X/Reddit/etc. |
| **Tracked social links** | Attributes plays back to your post/platform | Use links from `rundot socials prepare`, not raw deploy URLs, when sharing externally |
| **In-game share links** | "Beat my score" / challenge deep links | `RundotGameAPI.social.shareLinkAsync()` — players share *for* you; see Sharing API |
| **Clips & file share** | Players record and share gameplay out to TikTok/IG/etc. | `clips` API + `social.shareFileAsync()` — optional in-game "share clip" after a highlight |
| **Leaderboard** | Competitive hook; "someone beat your score" | Fits score/skill games; pair with share links for challenges |

### Simple checklist (every meaningful ship)

```
[ ] socials profile show — profile exists with tone + CTA
[ ] deploy included --changelog for this version (or captions hand-written from hook)
[ ] rundot socials prepare --update <version> + captions edited
[ ] post external platforms + mark-posted
[ ] Post in RUN Discord #showcase — https://discord.gg/rundotcreators (play link + hook)
[ ] Check & reply to comments on your game page
[ ] If big update: deploy --public --major --changelog (notifies likers)
[ ] If first time on Explore: thumbnail + keywords set
```

## Per-platform behavior

| Platform | Behavior | Link placement |
| --- | --- | --- |
| **Discord** | Auto-posted via your webhook. No composer. | inline |
| **X** | Composer-assisted; `open x` prints a prefilled tweet URL. | inline, or **reply** (post caption first, link + `@RUN` in a reply to keep reach) |
| **Reddit** | Composer-assisted; `open reddit --target <subreddit>` prints a prefilled submit URL. | inline |
| **TikTok / Instagram** | No web composer — copy the caption, post from the app. | **search** (not clickable): put game name + key art on-screen, use `Search "{game}" on @RUN` |

## Per-platform content playbook

The CLI hands you a caption and a link, but *what content the post points at* decides whether it works — and that differs sharply per platform. TikTok and Instagram share a 9:16 format but reward very different content. **Trends move fast — spend time on each platform and verify current formats/sounds before leaning on the specifics below.**

**Universal (all short-form):** hook in the first 1–2 seconds with a striking visual, never a logo or "hey guys"; ~half of viewers watch muted, so bake in on-screen text/captions; keep it vertical 9:16; put the game name + genre in the caption so viewers know what to search next.

### TikTok — raw, gameplay-first, high-volume

- **Open on gameplay, not a face or title card.** The most visually striking gameplay moment goes in frame one.
- **Authenticity beats polish.** A shaky screen recording of a funny physics glitch outperforms a cinematic trailer. Speed over production value.
- **Proven formats:** satisfying core-loop clips on repeat, dev bug compilations ("things that broke in development"), before/after dev progress ("1 year in 15 seconds"), mystery/reaction bait ("I hid something cursed in level 3"), and creator reaction clips.
- **Structure:** hook (1–2s) → premise as a text overlay → payoff within 15–30s → CTA (wishlist / search the game).
- **Cadence:** 4–7 posts/week; consistency beats sporadic bursts. Batch-record. Ride trending sounds and use `#indiedev #gamedev #indiegame` + genre tags. Strong discovery even from zero followers.

### Instagram Reels — completion, shareability, a bit more polish

- **Different algorithm, not a TikTok mirror.** Don't cross-post the identical cut and expect the same result.
- **Optimize for the 2026 signals:** watch-completion rate (aim 15–45s, finishable), **DM-shares** (design a reel worth sending to one specific friend), and **remixes/templates**. Likes are weak; saves and follows-from-reels matter.
- **Content that gets saved/shared here:** high-utility tips ("3 hidden mechanics", how-to breakdowns) saved as reference; crisp highlight reels with smooth transitions and satisfying SFX; authentic behind-the-scenes; polished meme/reaction formats with clean text.
- **Remix-friendly formats** (before/after, "stitch the next line", reaction-bait) earn reach you can't buy.
- **Hygiene:** never upload with a TikTok watermark (actively deprioritized) — remove it before cross-posting. Trending sounds give a 24–72h boost (biggest day one); a stale sound hurts velocity. Don't judge a reel in the first 24h; wait 48–72h.

### X / Reddit / Discord (brief)

- **X:** GIF/short-clip driven, punchy caption; thread the dev story. Use the `reply` link placement when an inline link would cut reach.
- **Reddit:** lead with genuine value in the target subreddit (a real dev story, a question, a milestone), not an ad — read each sub's self-promo rules. Use `open reddit --target <subreddit>`.
- **Discord:** your warmest audience (auto-posted). Community/sincere tone, direct and personal — you're talking to people who already care.

## Best practices

- **Post around real moments** — a launch, a meaningful update, a milestone. `prepare` promotes a specific release; give people a reason to look.
- **Match the caption variant to the platform/audience** — `punchy` for X, `sincere` for a Discord community, `playful` for TikTok/Instagram.
- **Respect each platform's link rules** — use the `reply` placement where inline links hurt reach; for search-only platforms, show the game name and the `Search on @RUN` CTA on-screen.
- **Always `mark-posted`** so @RUN can amplify and `verify` reflects reality.
- **Posting isn't the finish line** — a step needs a non-creator click. Share where your actual audience is so links get clicked, not just posted into the void.
- **Set the Discord webhook** — it's the one platform that auto-posts, the highest-leverage one-time setup.
- **Post in RUN Discord #showcase** ([discord.gg/rundotcreators](https://discord.gg/rundotcreators)) on every meaningful ship — free audience already on the platform.
- **Reply to comments** on your game page after each deploy — early engagement compounds.
- **Set keywords and a real thumbnail** before going public on Explore — invisible without them.

## Command reference

| Command | Purpose |
| --- | --- |
| `profile set` | Configure webhook / tone / hashtags / footer / CTAs (per-creator). |
| `profile show` | Show the current social profile. |
| `prepare` | Generate a launch packet (auto-posts Discord if configured). |
| `status` | Show the posting checklist. |
| `open <platform>` | Print the caption + composer URL for a platform. |
| `mark-posted <platform> --url <url>` | Record a published post URL. |
| `verify` | Check which steps are finished (posted + ≥1 non-creator click). |

## Anti-patterns

- ❌ Running bare `rundot socials prepare` with no profile, no changelog, and posting captions unedited — #1 source of generic AI slop.
- ❌ Skipping `rundot socials` entirely — budget and lifecycle stage are not excuses; but always use the full path, not bare prepare.
- ❌ Skipping `rundot socials profile set` because "prepare works without it" — it does, badly.
- ❌ Using `--update latest` when the fix shipped to a private tag only — promotes the wrong public build.
- ❌ Posting `sincere` variant without a rewrite — longest and most corporate-fluff-prone.
- ❌ Skipping RUN Discord #showcase or comment replies — free on-platform community is as important as external socials.
- ❌ Confusing RUN's community Discord (#showcase) with your own server's webhook — both matter; they do different jobs.
- ❌ Drafting social posts from scratch when `rundot socials prepare` can do it — run the CLI; edit the variants if needed, don't reinvent the workflow.
- ❌ Telling a creator to "post on Reddit/X" without running `rundot socials prepare` and walking them through `open` / `mark-posted` / `verify`.
- ❌ Treating organic and paid as either/or — always run socials; add paid UA when gates allow, don't replace one with the other.
- ❌ Running `socials` commands without `RUNDOT_BETA_FEATURES=1` (they won't appear).
- ❌ Posting an inline link on a platform where it tanks reach — use the `reply` placement instead.
- ❌ Putting a raw link in TikTok/Instagram captions — they're not clickable; use the search CTA.
- ❌ Skipping `mark-posted` — @RUN can't amplify what it doesn't know is live, and `verify` stays wrong.
- ❌ Treating "posted" as done — a step isn't finished until someone other than you clicks.
- ❌ Silently trimming an over-limit caption — heed the `warnings` and rewrite instead.
- ❌ Shipping generic captions without establishing the creator's voice — get voice samples or lore first.

## Resources

- `rundot-marketing-ua-analysis` — paid user acquisition; run **alongside** organic (this skill), never instead of it.
- `rundot-marketing-assets` — the gameplay clips and art your posts show off.
- `rundot-game-coach` — routes creators to always run `rundot socials` at every stage; paid UA when retention gates clear.
- `.rundot-docs/rundot-developer-platform/deploying-your-game.md` — public/Explore, keywords, major releases.
- `.rundot-docs/rundot-developer-platform/api/IN_APP_MESSAGING.md` — likes & comments panel (player-facing SDK).
- `.rundot-docs/rundot-developer-platform/api/SHARING.md` — in-game share links & file share.
- CLI: `rundot socials` — `profile set/show`, `prepare`, `status`, `open`, `mark-posted`, `verify` (requires `RUNDOT_BETA_FEATURES=1`).
