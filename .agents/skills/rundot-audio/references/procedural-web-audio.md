# Procedural Web Audio for game feedback

Use procedural Web Audio when it gives a small game distinctive, low-footprint
feedback. Prefer authored assets when the required sound needs precise musical or
brand control.

## Service pattern

- Own one lazily created `AudioContext`, master gain, optional music element,
  and separate persisted Music/SFX/Voice controls in an audio service.
- Create/resume the context after a player gesture. On host pause/sleep,
  suspend it and stop scheduling new events; resume only when appropriate.
- Give each cue a semantic name and an intentional per-cue cooldown. Rapid taps,
  projectile hits, and repeated collisions must not create unlimited oscillators
  or noise buffers.
- Add restrained pitch/velocity variation for repeated cues, but keep outcome
  cues recognizable. Make randomness observable or seedable in QA when it
  affects test assertions.
- Route every oscillator/buffer through a gain envelope and master bus; stop and
  disconnect sources promptly. Never schedule against a suspended audio clock.

## Test it

Expose test-only counters or playback state under the browser QA contract:

- gesture unlock/rejection recovery;
- SFX mute produces no new nodes while music may remain independently enabled;
- music loop/pause/resume retains intended position;
- host/modal pause stops playback and scheduling;
- rapid action stays within cue-rate limits;
- no Web Audio errors or accumulating sources after a long session.

Do not use a procedural cue as the only success/failure signal; preserve visual
and, where supported, haptic feedback.
