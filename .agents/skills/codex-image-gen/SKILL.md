---
name: codex-image-gen
description: "Generate AI images through the local OpenAI Codex CLI (gpt-image) instead of the RUN generator: which codex binary works, the exact exec command, output locations, quota cost, no-alpha limitation, and verification. Use for ChatGPT/OpenAI image requests or when rundot generation is unavailable or unsuitable."
---

# Codex CLI image generation

Generate images with OpenAI's image model via a locally installed Codex CLI.
Requires the user to have Codex installed and signed in with a ChatGPT
account; there is no RUN credit path here. Last verified 2026-07-19 on macOS.

## When to use which generator

- Prefer `rundot generate image` for game sprites and UI that need transparency,
  palette/size flags, or upfront credit pricing (`rundot generate estimate`).
- Use this Codex path when the user asks for OpenAI/gpt-image output, when RUN
  credits or models are unsuitable, or for painterly one-off art where an
  opaque background is fine.
- Codex output observed: 1536×1024 **RGB PNG, no alpha channel**. Sprite use
  requires a separate background-removal step (rundot SDK `removeBackground`,
  or local `rembg` in a venv).

## Which binary (critical, this is the usual failure)

An npm-global `codex` on PATH is often stale, and the API rejects its
configured default model with
`invalid_request_error: The '<model>' model requires a newer version of Codex`.
When that happens, prefer the CLI bundled with the ChatGPT desktop app:

- macOS: `/Applications/ChatGPT.app/Contents/Resources/codex`
- Otherwise, locate it inside the app's install directory.

- Check with `<binary> --version`; health-check with `codex doctor`. Observed
  working at 0.145.0-alpha.18 while the PATH binary at 0.142.5 failed.
- Permanent fix is a global change and the user's call:
  `codex update` or `npm update -g @openai/codex`.
- A cosmetic `failed to load models cache` error on the old CLI is not the
  blocker; the API rejection above is.

## Auth and cost

- Uses the ChatGPT account session stored as `auth.json` in the Codex home
  directory (`$CODEX_HOME`, default the Codex dotfolder in `$HOME`); no
  `OPENAI_API_KEY` needed. Never read, print, or copy `auth.json`.
- Spends the user's ChatGPT quota (one test image used ~23.6k tokens plus one
  image generation). There is **no dry-run/estimate flag** — say so, and get
  explicit approval before each generation or batch.

## Command

Run non-interactively, with a writable sandbox and an absolute output path:

```bash
<codex-binary> exec \
  --sandbox workspace-write --skip-git-repo-check \
  "Use your image generation tool to generate an image: <subject, style,
  composition, constraints>. Save or copy the resulting image file to
  <absolute-path>.png and then reply with the absolute file path and its file size."
```

- The `cwd` must exist **before** launching (background task runners `cd` into
  it before the command runs — `mkdir -p` inside the command is too late).
- The image tool writes to `generated_images/<session-id>/` inside the Codex
  home directory first; instructing the agent to copy to the target path works
  reliably.
- Expect ~1–3 minutes for the agent loop plus generation; budget 600 s.
- Size/aspect/background cannot be set by flags — they are prose to the agent,
  so expect tool defaults unless it exposes controls.

## Verify (blocking, same bar as rundot output)

- Confirm the file exists; run `file <path>` for dimensions and color type
  (`RGB` = opaque, `RGBA` = transparency).
- Read the image back and inspect at full resolution for defects: mangled
  text, duplicated elements, broken grids, style drift. Zoom into suspicious
  regions before declaring it good.
- Record binary version, prompt, output path, and token cost in the reply.

## Failure modes seen

- `cd: <cwd>: No such file or directory` → create the working directory first,
  in its own step.
- `invalid_request_error ... requires a newer version of Codex` → wrong
  binary; switch to the ChatGPT.app-bundled one or upgrade the npm global.
- Missing output file despite success message → check
  the Codex home directory's `generated_images/` and copy manually.
