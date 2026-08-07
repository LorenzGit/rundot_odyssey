---
name: rundot-audio
description: "Create, integrate, mix, test, and operate music, sound effects, voice, and audio settings for RUN.world HTML5 games. Use for game audio direction, background music, SFX, TTS, Audio Generation API, rundot generate audio commands, audio lifecycle, mute controls, or audio accessibility."
---

# RUN.world game audio

Audio is interaction feedback and game identity, not a final-pass decoration.
Read the target project's installed SDK declarations and its bundled docs
before SDK generation or host integration — `api/AUDIO_GEN.md`,
`api/LIFECYCLES.md`, `api/RATE_LIMITS.md`, and `error-handling.md` under
`node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/`.
Pair this skill with `rundot-game-quality` for the release gate.

## Audio design pass

Before producing assets, complete `references/audio-brief-template.md`. Define
the game’s sonic identity, music states, SFX feedback map, accessibility
settings, asset budget, and the exact moments audio must reinforce. A minimum
shippable game covers primary input, success, failure, rewards, important
transitions, and intentional music/ambience or a documented artistic exception.

Keep music, SFX, voice, UI, and ambience independently controllable. Persist
those preferences in the game’s versioned player settings; mute, reduced motion,
or unavailable audio must never remove essential visual feedback.

Read `references/playback-and-assets.md` before adding an MP3, looping music,
or choosing bundled versus CDN/entitlement-gated audio delivery.
Read `references/procedural-web-audio.md` when using `AudioContext`, generated
tones/noise, dynamic music, or high-frequency game feedback.

## Implementation rules

1. Put playback behind one audio service. Scenes/gameplay request named cues;
   they do not create uncontrolled `Audio` instances.
2. Unlock playback from a player gesture where browser policy requires it. A
   blocked first play must become a recoverable state, never a silent failure.
3. Load and decode deliberately; use short, compressed assets for frequent SFX
   and avoid repeated concurrent copies of the same cue. Bound overlap and rate
   limit noisy actions.
4. Define state-aware music behavior: menu, active play, tension, results,
   pause/background, resume, and restart. Fade or stop intentionally; no music
   or loops may continue behind a paused/background game.
5. Normalize and audition levels on representative phone speakers/headphones.
   Keep UI feedback and critical cues audible without painful peaks or constant
   repetition.
6. Test on actual target form factors, after lifecycle transitions, reload, and
   with all settings combinations. Audio must not block the core loop, saving,
   rewards, or purchases.

## Generated audio and voice safety

- `RundotGameAPI.audioGen` supports SFX, music, and TTS; it is beta. Confirm
  installed types, parameters, availability, rate limits, and current cost
  before use.
- `rundot generate sfx`, `rundot generate music`, and voice commands are
  creator-side asset workflows. Verify installed command help immediately before
  relying on syntax.
- Generation can consume credits. Do not generate, save a designed voice, or
  make a paid remote request without the creator’s explicit approval after an
  estimate. Use local/imported assets or written briefs until approved.
- Treat runtime generation, voice design, and voice saving as explicit player or
  creator actions with loading, cancellation/error UI, and a usable fallback.
- Do not generate deceptive voice likenesses, ship unreviewed dialogue, or
  assume generated assets are culturally/legally appropriate. Review every
  final asset in context.

## Verification and handoff

Exercise first unlock, each cue, mute/volume persistence, pause/resume,
background/foreground, reload, interruption, reduced-motion setting, no-host
fallback, and failure paths. Report the audio brief, asset source/license or
generation approval, peak/mix review, test devices, remaining host/device work,
and any intentional exception.
