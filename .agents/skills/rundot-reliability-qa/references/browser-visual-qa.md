# Browser visual regression contract

Use this pattern for games where a production release needs reproducible visual
and behavioral evidence beyond a build passing. Tower Defense demonstrates it in
`tower-defense/scripts/visual-qa.mjs`; do not copy its game-specific coordinates
or state names into another game.

## Add a test-only game contract

When the URL contains a development-only `qa=1` flag, expose a small,
non-production global such as `globalThis.__gameQa`:

```ts
type GameQa = {
  snapshot(): Record<string, unknown>
  startRun(): Promise<void> | void
  reset(): Promise<void> | void
  // Add semantic actions only for important game states.
}
```

Never expose this in production builds or use it as a player/admin control. Its
actions must be semantic (for example `startRun`, `claimDailyReward`,
`openSettings`), not brittle canvas coordinates.

## Write a browser-driven audit

Use Chrome DevTools Protocol or an established browser test runner to:

1. Start a local production-like build at declared phone, tablet, and desktop
   viewports/DPRs.
2. Fail on unhandled exceptions and console errors, except documented expected
   mock-host warnings.
3. Drive the QA contract and real input through the first session, core loop,
   failure/retry, save/reload, settings, monetization surfaces, and relevant
   feature states.
4. Capture named screenshots at stable checkpoints. Store only intentional
   release evidence or compare against approved baselines with a reviewed
   tolerance; do not accumulate unreviewed screenshots forever.
5. Assert meaningful state: no duplicate reward, persisted setting, music/audio
   pause/resume, expected UI visibility, correct asset loaded, and no broken
   layout—not merely that a screenshot exists.

Record command, commit/version, viewport, test data/reset method, screenshots,
and failures in the release evidence. Keep host-only/payment/multiplayer checks
separate and label them as requiring real RUN conditions.

## A passing test is not evidence until it can fail

Most of the defects that reached a device in one project did so past a green
suite. In every case the assertion was measuring something adjacent to the
actual property:

| Bug the player saw | What the test asserted | Why it passed |
| --- | --- | --- |
| Bullet and thrown gun leave together | the two events land on different frames | the round stays airborne; frame index says nothing about what is on screen |
| Modal action unreachable | the buttons are inside the sheet | the clipped element was an offer, not a button |
| Offer sliced in half | the results sheet has no overflow | with no host the offer hides itself, so the sheet measured a `0px` hole |
| Rate of fire throttled 20x | the gun fires and consumes rounds | never measured the interval between shots |

Two habits that catch this:

1. **Assert the property the player experiences**, not a proxy. Distance between
   two objects on screen, not the frame each was created on. Seconds between
   shots, not that a shot happened.
2. **Break it on purpose.** After writing a regression test, re-introduce the
   old behaviour and confirm the test fails. A test that has never failed has
   not been shown to test anything. This takes a minute and repeatedly turned
   out to be the difference between a real check and a decorative one.

## Verify the edit landed

Scripted edits that anchor on a source string fail silently when the anchor
does not match — no error, no diff, and the suite still reports success because
nothing was added. Assert the substitution occurred, then grep for the new
assertion text before reporting a test as added. In one session two test blocks
were reported as landed across separate commits while neither was ever in the
file.
