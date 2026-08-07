---
name: grok-image-video
description: "Generate and edit images and short videos with Grok Build Imagine tools (image_gen, image_edit, image_to_video, reference_to_video). Use for Grok/xAI image or video requests, text-to-image, image edit/restyle, image-to-video, multi-reference video, concept art, motion tests, or when the user runs /grok-image-video or asks for grok_image_video. Not for Codex CLI or rundot generate image."
---

# Grok Imagine image and video

Use **this Grok session’s built-in Imagine tools** only. Do **not** shell out to
Codex CLI, OpenAI gpt-image, or `rundot generate image` unless the user
explicitly switches generator.

There is **no pure text-to-video**. Text-to-video means: generate a first-frame
image, then animate it.

## When to use which generator

| Goal | Use |
|------|-----|
| Fast concept art, marketing frames, motion tests in Grok | **This skill** |
| Game sprites/UI needing alpha, size flags, RUN credit estimate | `rundot generate image` + `rundot-visual-assets` |
| OpenAI / ChatGPT gpt-image output | `codex-image-gen` |
| Soft-shadow cutouts after opaque gen | `bg-removal-softshadows` |

Prefer this skill when the user asks for Grok, Imagine, image-to-video, or
short clips without naming Codex or RUN generation.

## Tools

| Situation | Tool |
|-----------|------|
| New image from text | `image_gen` |
| Edit, restyle, iterate, or likeness from a source | `image_edit` |
| Animate one source image (default video path) | `image_to_video` |
| Video from 2–7 reference images (only if needed) | `reference_to_video` |

Rule of thumb: **no source → `image_gen`; source present → `image_edit`;
motion → stage frame 1 first, then `image_to_video`.**

Verify tools are available before calling them. If a video tool is missing,
stop and say pure/image-to-video is unavailable in this session.

### `image_gen`

- Inputs: `prompt` (required); `aspect_ratio` (`1:1`, `16:9`, `9:16`, `4:3`,
  `3:4`, `3:2`, `2:3`, `auto`, etc.).
- Multiple variants = multiple calls with distinct prompts (no `n`/`count`).
- Not for named real people from text alone.

### `image_edit`

- Inputs: `prompt` (required); `image` (one or more paths, attachment tokens,
  or data URLs); optional `aspect_ratio` for multi-image edits.
- Single-image edits keep the source aspect ratio.
- Prefer one clean reference over many weak ones.

### `image_to_video`

- Inputs: `image` (required); optional `prompt`; `duration` **6 or 10**
  (prefer 6); `resolution_name` `480p` (default) or `720p`.
- Source image is frame 1. Stage that frame with `image_gen` / `image_edit`.
- Aspect ratio comes from the source image, not a separate video crop.

### `reference_to_video`

- Inputs: `prompt` (required); `images` (2–7); `aspect_ratio` (required);
  optional `duration` 6/10; optional `resolution_name`.
- Prefer composing references with multi-image `image_edit` first, then
  `image_to_video`, unless the user asks for multi-reference video directly.

## Workflows

### Text → image

1. Craft a 2–5 sentence prompt: subject → pose/action → setting → style →
   composition → lighting/mood → key details. Positive description only.
2. Set `aspect_ratio` for the use case (`9:16` phone/story, `16:9` banner or
   video frame, `1:1` avatar/icon).
3. Call `image_gen`. Report the saved session-relative path (e.g. `images/1.jpg`).
4. Read the image back and inspect for defects before calling it done.

### Image edit / iterate

1. Use the previous output path or user attachment as `image`.
2. Prompt only the change; restate what must stay fixed (identity, palette,
   layout).
3. Call `image_edit`. Verify against the source.

### Text → video (practical text-to-video)

1. Plan the clip as **one shot** (or several short shots). Prefer more 6s shots
   over one long take.
2. Generate an animation-friendly first frame (`image_gen` or reference-seeded
   `image_edit`). Avoid busy geometry if the subject must move.
3. Call `image_to_video` with a short present-tense motion prompt: one clear
   subject, one simple motion or camera move (push-in, orbit, parallax, wind).
4. For multi-shot sequences: extract the last frame of shot N (ffmpeg) as the
   seed for shot N+1 when continuity matters; assemble with
   `ffmpeg -f concat ... -c copy` (same resolution/frame rate; no re-encode).

### Consistency across shots

There is no persistent character memory. For any recurring subject:

1. Generate one **canonical reference** image first.
2. Derive every reappearance with `image_edit` (or seed video from that
   reference)—never a fresh independent `image_gen` of “the same” character.
3. Restate fixed traits in every prompt; verify each result against the reference.

## Prompt craft (images)

- Own the prompt: use the user’s wording when they give a detailed prompt;
  otherwise write natural prose, not keyword tags.
- Front-load the subject; one coherent scene per image.
- Match aspect ratio to delivery surface before generating.

## Prompt craft (video)

- One short, vivid moment in present tense + clear camera/subject motion.
- Minimal action; interest comes from composition and a strong first frame.
- Complex frames: keep the subject fixed and move only the camera, or simplify
  the base image before animating.

## Safety and policy

- Named real people: **reference-first** via `image_edit` (and video from that
  image). Never pure text likeness. No non-consensual, sexualized, or
  minor-involving likenesses.
- Ground real-world facts (identity, brand, place, “current/latest”) with web
  search before prompting; put verified names/details in the prompt.
- On moderation/safety block: stop; do not retry rephrased evasions. Offer a
  different direction.

## Accuracy limits

Image models garble exact text, numbers, charts, labeled diagrams, and
multi-panel grids. When discrete accuracy matters, build with code (HTML/CSS)
instead of generating. Do not ship unreadable UI text or fake data as final art.

## Game-asset caveats (this template)

- Imagine output is **not** a drop-in RUN sprite pipeline: expect opaque RGB;
  alpha cutouts need a separate step (`bg-removal-softshadows`, rundot removal,
  or equivalent).
- Production game art still needs the visual brief, aspect-ratio policy, and
  quality bar from `rundot-game-quality` / `rundot-visual-assets` /
  `docs/visual-assets.md`.
- Do not treat concept motion tests as shipped gameplay assets without review
  at in-game scale, crop-safe regions, and file budget.

## Verify (blocking)

1. Confirm the returned file path exists and is readable.
2. For images: open/read the file; check composition, identity, style, and
   defects (mangled text, extra limbs, style drift).
3. For video: confirm duration intent (6/10s), that frame 1 matches the staged
   image, and that motion is the single intended action—not warping chaos.
4. Report tools used, prompts, aspect/duration/resolution, and output paths
   (session-relative links for user-facing replies).

## Failure modes

- User asked “text to video” → explain there is no pure T2V; run text→image→video.
- Video tool missing → do not fake a clip; report unavailability.
- Style/identity drift on “same character” → stop regenerating from text; lock a
  reference and use `image_edit`.
- Warped animation on a busy frame → simplify source or camera-only motion.
- User wanted RUN credits / alpha sprites / Codex model → redirect to the
  matching skill; do not force Imagine as a substitute without saying so.

### Video fails with “ZDR / output.upload_url” (common; often a false flag)

**Error:**
`Zero Data Retention teams must provide output.upload_url for video generation.`

**What the API claims:** Under real ZDR, xAI will not host the MP4. Images can
still return inline/base64 (`image_gen` often works). Video needs a
customer-owned `output.upload_url`. Built-in `image_to_video` /
`reference_to_video` do **not** accept that field, so the call 400s.

**What users often see instead:** Console **Team Settings → ZDR is off**, yet
Grok Build still returns this error. Multiple reports (2026-07) describe the
same mismatch: OAuth / SuperGrok sessions mapped to a **different internal
team** (or a ZDR-like path) than the Console team they inspect. Local Grok
logs may show `upload_reason: "zdr_team"` even when the Console UI shows ZDR
inactive.

**This is not a project skill bug** and usually **cannot be fixed by editing
this repo**. There is no `config.toml` switch for it.

**What to try (user-side, in order):**

1. **Most common fix in Grok Build:** `/privacy` → **Opt in** (coding data
   retention/sharing). Observed 2026-07: Console ZDR can show **off** while
   privacy **opt-out** still makes the client report `upload_reason: "zdr_team"`
   and video 400s. After opt-in, logs switch to `uploads_enabled: true` /
   `upload_reason: "proxy"` and `image_to_video` succeeds. Auth field:
   `coding_data_retention_opt_out` becomes `false` when opt-in.
2. Confirm the row is not locked as **ZDR** / **Admin Managed** (true team ZDR).
3. Full re-auth: `grok logout` then `grok login` if the flag looks stale.
4. If you are team admin and Console really has ZDR on: disable it, then retry.
5. If Console ZDR is off, privacy is opt-in, and video still fails: treat as
   product bug / wrong-team mapping — report to xAI; API + presigned
   `output.upload_url` remains the only self-serve ZDR-compliant path.

When this error hits: check `/privacy` first and retest once after opt-in.
Do not invent `upload_url` parameters on the built-in tools.
