# Template audio brief

## Direction

- Warm, low-key, optimistic utility music: 68 BPM, major-seventh harmony,
  rounded sine/triangle plucks, generous rests, and low playback levels.
- Explicit exclusions: beating drones, constant bass pressure, buzzy square
  waves, sharp highs, vocals, fake orchestration, and dense repetition.
- Designed first for phone speakers, then headphones, in portrait play.

## Music states

- Menu: four sparse notes per eight-step phrase over a quiet chord-cycle bass.
- Gameplay: the same identity with a slightly fuller motif; no hard transition.
- Pause/sleep/background: stop scheduling and suspend the shared audio context.
- Resume: restart from the current harmonic step after the context resumes.
- Host overlays: the RUN facade explicitly suspends the shared audio context
  around rewarded ads, interstitials, and Shop checkout because host-owned UI
  does not reliably emit lifecycle callbacks. A counted guard handles overlap;
  audio resumes only after the final surface closes and the player has not
  muted the relevant channel and the app is not otherwise paused/hidden.
- Music is procedural and local. It uses no generated asset, RUN credits, or
  external license.

## Feedback map

| Moment | Sound | Haptic | Required visual feedback |
| --- | --- | --- | --- |
| UI tap | soft sine tick | light when supported/enabled | pressed/focus state |
| Start | short rising triangle | light | phase transition |
| Bounce | quiet rounded ping, rate-limited | none | movement, score, particles |
| Reward/milestone | rising consonant cue | success | reward state/effect |
| Failure/unavailable | falling soft cue | warning/error where appropriate | status copy/toast |

Every cue has a cooldown and short envelope. Oscillators disconnect after they
end, and the master bus has conservative dynamics compression.

## Settings and accessibility

- Separate persisted Music and SFX toggles/volumes; defaults are 42% and 70%.
- Haptics have a separate persisted toggle and are never the only signal.
- There is no voice or standalone ambience bus in this content-neutral starter.
- Audio unlock is recoverable after a player gesture; reduced motion does not
  remove audio controls or non-motion outcome feedback.

## QA

- The development `?qa=1` contract reports context state, scheduler state,
  active music/SFX voices, scheduled notes, and suppressed rapid cues.
- Verify first unlock, Music/SFX off independently, repeated bounce limits,
  pause/resume, background/foreground, ad and checkout open/close (including
  closing while the app is paused), reload persistence, and phone/headphone mix
  in every derived game.
