# Social experiences and K-factor

This guide explains how to design social mechanics that can create organic
acquisition because inviting another person is part of the play—not a detached
referral task. It is a hypothesis framework, not a promise of viral growth.

## What K-factor measures

For one acquisition generation:

```text
K = average invitations sent per eligible player
    × invitation-to-activated-new-player conversion rate
```

If an eligible player sends four invitations and 25% become activated new
players, `K = 4 × 0.25 = 1`. In that simplified cohort, each eligible player
produces approximately one activated player.

Define every term before reporting K:

- **Eligible player:** reached the social value moment and could invite.
- **Invitation:** one delivered, deduplicated invitation—not a button tap.
- **Conversion:** a genuinely new player who opens the intended experience and
  completes the chosen activation event.
- **Window:** the fixed time allowed for attribution.

`K > 1` does not guarantee durable growth. Retention, invitation fatigue,
channel limits, duplicate recipients, fraud, and later-generation conversion
can still collapse the loop. Always pair K with invited-player D1/D7 retention,
core-loop completion, and trust/abuse guardrails.

## Novel social means the invitation is gameplay

A weak referral says, “Install this so I get currency.” A stronger invitation
says, “I made this for you,” “I need your help,” or “I want to see what happens
when you play.” The invited person should receive immediate value and a real
role rather than feeling used as a reward token.

A healthy loop usually follows this sequence:

```text
play trigger → personalized invitation → low-friction participation
→ shared or surprising outcome → invitee receives a reason to continue
→ optional reason to involve the next person
```

The loop improves K in two independent ways:

- **More meaningful invitations per player:** the game repeatedly creates
  situations where another person adds value.
- **Higher conversion per invitation:** the invitation promises a specific,
  personal experience rather than advertising the whole game abstractly.

## Pattern library

### Asymmetric cooperation

Give participants different information, abilities, timing, or interfaces so
communication matters.

- One player sees a map while another controls the character.
- One disarms a trap while another reads incomplete instructions.
- One prepares a route, spell, loadout, or clue set that another must execute.
- A mobile participant changes conditions in a desktop player’s encounter.

The invitation is naturally specific: “I need you to solve this part.” Provide
an asynchronous or bot fallback so unavailable friends do not hard-block the
core game.

### Player-created challenges

Let a player create a level, puzzle, race, character, ghost replay, monster, or
decision specifically for another person.

- “Can you beat the room I made?”
- “Guess the answer I selected.”
- “Survive against the monster I designed.”
- “Beat my ghost replay.”
- “Continue the story I started.”

The content is the invitation. Creation needs templates, validation, reporting,
and moderation so sharing remains fast and safe.

### Social transformation

Produce an output that exists because of the relationship between participants.

- Combine two drawings into one creature.
- Generate a team name or world from both players’ answers.
- Turn contrasting play styles into a personalized battle.
- Create a humorous recap from earlier matches.
- Build a “friendship dungeon” from what participants know about one another.

These work when the output is personal, expressive, funny, competitive, or
collectible. Never infer or reveal sensitive relationship traits.

### Delayed social consequences

Let one player create something that waits in another player’s next session.

- Hide an object in a friend’s world.
- Leave a ghost, gift, message, trap, or challenge.
- Choose a future event or encounter modifier.
- Turn a run outcome into an enemy or helper in another world.

Make the sender and effect clear, allow mute/block/report controls, bound the
impact, and never let a social payload destroy irreversible progress.

### Chain and relay experiences

Each participant contributes one step and passes the result onward.

- Draw a character, then ask another player to name it.
- Add one line to a story.
- Build one room of a shared dungeon.
- Defeat one boss phase and recruit someone for the next.
- Add one rule that the following player must obey.

Track chain depth and contributor value, not only invitation count. Give every
participant a satisfying local outcome in case the chain ends.

## Design contract

Before implementing a social loop, answer:

1. What value does the sender receive before inviting?
2. What specific experience does the invitation promise?
3. What can the invitee do before a long tutorial, account flow, or purchase?
4. What is fun if the invitee never installs or returns?
5. What new reason—if any—does the invitee earn to involve someone else?
6. How are spam, harassment, unsafe content, impersonation, and unwanted contact
   prevented or reported?
7. What data is shared, and how is consent made legible to both parties?

Do not upload address books, private messages, raw invite text, or relationship
graphs merely to optimize K. Use opaque invitation IDs and bounded,
non-sensitive analytics properties.

## Measurement plan

Instrument the complete funnel with stable, deduplicated IDs:

| Stage | Example metric |
| --- | --- |
| Eligibility | players who reached the social value moment |
| Creation | challenges/relays created per eligible player |
| Send | delivered invitations per eligible player |
| Open | unique invitation opens ÷ delivered invitations |
| Activation | new players completing the promised interaction ÷ delivered invitations |
| Shared outcome | pairs/chains reaching the rewarding outcome |
| Continuation | invited players completing the core loop and returning D1/D7 |
| Propagation | invited players who later become eligible inviters |
| Trust | blocks, reports, mutes, declines, and repeated-send rate |

Report K alongside sample size, attribution window, player/version/channel
cohort, and invited-player retention. Do not count existing-player re-engagement
as new-player acquisition; measure it separately.

## RUN implementation map

Useful RUN surfaces include social sharing and composers, launch-intent
resolution, notifications with consent, clips, UGC/collaboration, analytics,
attribution, realtime multiplayer, and Syncplay. See
[`run-capabilities.md`](run-capabilities.md) for the active examples, authority
requirements, and failure posture.

Keep invitation resolution behind a typed service, validate every payload,
require a direct player gesture before sharing, and provide a useful local or
solo fallback when the RUN host or recipient is unavailable.

## Release gate

Do not scale a social loop from K alone. Require evidence that:

- the invitee reaches value quickly and understands who invited them;
- invited-player retention is not materially worse than comparable organic
  cohorts;
- reports, blocks, declines, and spam signals stay within the agreed guardrail;
- content moderation and payload validation work under adversarial input;
- removing or disabling the loop does not break saves or core progression.
