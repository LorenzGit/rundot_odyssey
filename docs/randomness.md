# Deterministic randomness

Use [`NoiseRandom`](../src/game/noiseRandom.ts) for ordinary random decisions in
a derived single-player game. It is a TypeScript port of the position-based
32-bit noise implementation used by prior RUN games.

```ts
import { NoiseRandom } from "./noiseRandom.ts";

const random = new NoiseRandom(runSeed, savedPosition);

const reward = random.int(10, 25, 1); // 10 through 24
const scale = random.float(0.8, 1.2, 2);
const isRare = random.bool(0.05, 3);

save.randomPosition = random.position;
```

The seed and position are unsigned 32-bit integers. Every `nextUint`,
`nextDouble`, `int`, `float`, or `bool` call advances the position exactly once.
Persist both the seed and position when a sequence must resume exactly.

Salts distinguish unrelated decisions. Give stable, documented salts to
independent systems or fields so adding one type of roll does not silently
change another. `NoiseRandom.randomize(seed, position, salt)` is pure and
call-order independent; it is useful for cells, entities, or procedural content
whose stable position is already known.

## Required use

- Do not use `Math.random()` in game source.
- Inject a seeded `NoiseRandom` into procedural generation and gameplay systems
  when their results must replay or survive save/load.
- Use a runtime-created `NoiseRandom` for cosmetic-only variation when replay is
  irrelevant; the default constructor seeds it from the current time.
- Keep exact seeds with regression reports and procedural-generation tests.
- Do not use this class for cryptography, purchase identifiers, authentication,
  or security decisions. Use the Web Crypto API for those.
- Do not substitute it for RUN SyncPlay randomness. Authoritative deterministic
  multiplayer must use the SDK's server-owned `ctx.random` and certified
  `hash2`/`valueNoise*`/`fbm2D` functions.

The integer method intentionally preserves the original C# modulo mapping for
cross-language compatibility. Its upper bound is exclusive. `nextDouble()` and
`float()` preserve the original inclusive upper endpoint because they normalize
with `0xffffffff`.
