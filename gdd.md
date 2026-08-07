Odyssey: The Perfect Shot

PixiJS Prototype Specification
Goal
Build a polished HTML5 mobile prototype using the provided PixiJS project template.
The player controls Ulysses, fires one arrow through several glowing gates, and hits a final target.
The game must support mouse and touch in landscape orientation.
 
⸻
 
Core Loop
1. Load a handcrafted level.
2. Drag to aim.
3. Show a dotted trajectory preview.
4. Release to fire.
5. Follow the arrow with the camera.
6. Collect gates.
7. Hit the target.
8. Show results.
9. Retry or continue.
Each level should last approximately 10–20 seconds.
 
⸻
 
Technical Rules
* Use the existing project template and architecture.
* Do not reorganize the template.
* Use TypeScript and PixiJS.
* Use a fixed virtual resolution of 1920 × 1080.
* Preserve aspect ratio and letterbox when needed.
* Use virtual coordinates for gameplay.
* Support modern iPhone landscape proportions.
* Do not use an external physics engine.
* Do not procedurally generate levels.
 
⸻
 
Game States
Use these states:
* Loading
* Aiming
* Arrow Flying
* Victory
* Defeat
Only one arrow may exist during a shot.
 
⸻
 
Controls
Before Firing
* Pointer down begins aiming.
* Drag changes the firing angle.
* Vertical drag sets the angle, horizontal drag sets the draw power.
* Release fires the arrow.
Aim range:
* Minimum: -10°
* Maximum: 66° (above this the arc leaves the top of the world)
Draw power is NOT fixed. Horizontal drag sets it between 0.55x and 1.4x of the
arrow's launch speed, and each course opens on its own draw.
During Flight
Horizontal dragging slightly steers the arrow.
Vertical dragging has no effect.
Steering must be subtle and configurable.
 
⸻
 
Arrow Physics
Use manual, frame-rate-independent projectile physics.
Physics runs on a fixed integration slice (1/120 s). `advanceShot` chops ANY dt
it is given into slices internally, so a 30 FPS caller and a 144 FPS caller land
on the same pixel by construction. Position integrates trapezoidally — on the
average of the velocity before and after the accelerations — which is exact for
a constant force instead of carrying Euler's 0.5·a·dt² error. A wind zone's
impulse is weighted by the fraction of the step's travel that is actually inside
the band, not by whether the step happened to start inside it.

None of that mattered under gravity alone. It all became load-bearing the moment
gusts were made strong enough to see: at 4600 px/s² the residual per-step error
was tens of pixels per band, and the same par shot cleared at 120 FPS and missed
at 30.

Configurable starting values (SHOT_CONFIG):
Wind
Gusts must OVERPOWER gravity, not modulate it. accelY runs 2600–4600 px/s²
(3–5× gravity) across a 300–400px band. At the original 700–1800 the gust added
about 17° of bend to a path gravity was already bending 5–28°, so it read as
"the arrow is falling" — measurable and invisible. At the shipped strength the
arrow's heading turns 23–59° crossing a band and an updraft visibly lifts it
mid-flight. `npm run test:e2e` measures that turn in the LIVE game and fails
below 18°.

Reflectors are kept out of wind bands: the arc through a strong gust is steep
and fast, so a bumper inside one is a coin flip between missing and a
dead-centre hit. Each interactive piece also gets its own stretch of the arc —
early, middle, late — because letting them all draw from the middle made
overlap the single biggest reason a bumper never got placed.

* Launch speed: 1300 px/s at 1.0x draw (per-arrow overrides in arrows.ts)
* Gravity: 900 px/s²
* Maximum steering acceleration: 90 px/s²
* Maximum delta time: 0.033 seconds
Courses run 2400-2950 px and take 1.1-2.2 s to fly, so the camera genuinely
travels and each course can own a distinct arc shape. Launch speed and course
length move together: changing one without the other collapses the courses back
onto a single screen.
The arrow must rotate to face its velocity.
Track the previous and current position of the arrow tip for collision detection.
 
⸻
 
Trajectory Preview
The preview is honest but NOT omniscient.

Solid dots run from the bow to the leading edge of the first wind band and are
exactly where the arrow will fly. A dashed gate marks where certainty ends.
Past it the dots are hollow and show the WIND-FREE continuation — a reference
line, not a prediction. Reading the chevrons and adding the drift is the
player's job.

This is the whole reason wind exists as a mechanic. When the preview simulated
the gusts too, the force was measurable (a band changes the tip's acceleration
from 900 to ~1600 px/s²) and completely unfelt: the dots already bent through
the band, so the player lined the dots up with the rings, fired, and the arrow
followed the dots. A force the preview fully predicts cannot change any decision
the player makes. `npm run simulate` fails the build if a preview that reaches a
gust does not stop being certain there.

`windScale` on each arrow is therefore a purchase decision, not flavour: BRONZE
(0.45) barely moves and is easy to call, FEATHER (1.35) is thrown about in
exchange for the best mid-flight steering.

While aiming:
* Show approximately 25 dots.
* Use the same launch speed and gravity as the real arrow.
* Ignore steering.
* Recalculate only when the angle changes.
* Stop at the level bounds.
Without steering, the arrow should closely follow the preview.
 
⸻
 
Camera
Before firing, show Ulysses and the first gates.
There is no scrolling camera. The WHOLE course is on screen before the player
aims and stays there for the entire flight.

The course is scaled uniformly (~0.6-0.7x) to fit the area left over once the
HUD's top and bottom reserves and the device safe area are subtracted, then
seated so its floor line sits on the bottom of that area. A course that scrolls
means aiming at rings you cannot see, which is the opposite of what this game
asks the player to do.

Do not add camera shake or cinematic cuts. Recompute the fit on every resize and
rotation.
 
⸻
 
Gates
Do not use visible circular rings.
Each gate should have:
* A small solid gold top cap.
* A small solid gold bottom cap.
* A large cyan semi-transparent opening.
* Subtle particles and glow inside the opening.
The opening should occupy most of the gate height.
Suggested size:
* Total height: 300–500 px
* Width: 80–140 px
* Each solid cap: 30–50 px
The arrow scores when its tip crosses the gate’s X-position while inside the opening’s vertical range.
Use swept collision detection so fast arrows cannot skip gates.
A gate can only be collected once.
Three gate kinds, told apart by hue and capital metal, not brightness alone:
* normal — cyan, 1× score
* gold — amber, 2× score
* crown — violet, 5× score, a deliberately small opening on the solution arc
Gates may bob vertically. A bobbing gate’s opening is enlarged by its own
amplitude so the course stays winnable at any release phase — it is a timing
feel, not a one-frame window.
On collection:
* Add score.
* Increase combo.
* Brighten the gate.
* Play a circular pulse.
* Emit a small particle burst.
* Dim the gate afterward.
Missing a gate does not fail the level.
 
⸻
 
Target
The final target must be shown almost from the side, at approximately a 15° angle.
It should include:
* A visible red-and-white bullseye.
* Slight wooden thickness.
* Support legs.
* A clear mobile-readable silhouette.
Do not use a strong three-quarter perspective.
Use swept collision detection against the visible target area.
 
⸻
 
Scoring
Each gate awards:
50 × current combo × gate multiplier (normal 1, gold 2, crown 5)
Rules:
* Combo starts at 1.
* Each collected gate increases it by 1.
* Missing a gate does not reset it.
* The target scores by ring: outer 50, inner 200, bullseye 500.
* Stars: 1 = any hit, 2 = every gate, 3 = every gate + bullseye.
* Collecting every gate and hitting the bullseye earns Perfect Shot.
 
⸻
 
Victory and Defeat
Victory
Trigger when the arrow hits the target.
Then:
* Stop physics.
* Play a short impact effect.
* Show score, collected gates, and Perfect Shot status.
Defeat
Trigger when:
* The arrow hits an obstacle.
* The arrow exits the level.
* The arrow falls below the playable area.
* The arrow stops without reaching the target.
Show a Retry button.
 
⸻
 
Levels
The ladder is ENDLESS and PROCEDURAL. There is no level table and no level
picker: `generateLevel(depth, arrow)` builds course N from its depth alone, so
course 47 is the same course for every player and nothing needs storing.

The generator is generate-then-prove, never generate-and-hope:
1. Lay wind and lethal rock, which a par shot must route around.
2. Search (angle, power) with the REAL integrator and keep the traced path,
   ranking candidates on how much of the arc can carry rings.
3. Sit the interactive furniture — obsidian slab, bumpers, ricochet plate — ON
   that arc, offering several positions each and keeping the one the shot
   actually banks off rather than the first that merely survives.
4. Put the target where the path ends and the rings along the path.
5. Re-fly par at every shipped frame rate, requiring a three-star with real
   margin off dead centre. A course that cannot prove it is discarded and the
   seed rolled; if a depth stays stubborn the generator strips its fanciest
   furniture rather than serving a copy of an earlier depth.

Physics runs on a fixed 1/120 s tick decoupled from the render frame, so the
shot the generator verified is exactly the shot the player flies.

Mechanics unlock one at a time (FEATURE_DEPTH): gold rings 3, wind 4, stone
hazards 6, bobbing rings 8, ricochet bumpers 10, obsidian 12, orbiting rings 14,
iris rings 16, angled plates 18, crown rings 20, swinging target 22, cross-shear
wind 26.

Losing never costs depth — a miss re-arms the same course. A miss still pays a
fraction of its rings in drachmae, because an under-equipped player has to be
able to earn the shaft that unblocks them.

Each course is built around its own SOLUTION ARC and records it as `parShot`.
Gate centres are generated from that arc, so a course is threadable by
construction. Two courses must never share a solution: the ladder escalates on
angle, draw, flight time, ring count, obstacles, wind and gate motion together.

ARROWS ARE THE PROGRESSION GATE. Each shaft carries `might` (the obsidian grade
it smashes) and `bounces` (ricochets it survives before shattering). Obsidian
hardness climbs with depth, so a course past its grade is not merely harder —
it is closed until a heavier shaft is bought. The menu refuses to enter such a
course and names the shaft required.

The menu shows the current course number, best depth, the next mechanic ahead,
and a badge on ARROWS when an upgrade is affordable or required. It is not a
course picker.

Do not randomly place gates or scenery.
 
⸻
 
Level Data
Each level must define:
* World width and height
* Background asset and its scenery grade (sky, tint, wash, ledge colour)
* Ulysses position and launch position
* Initial aim angle and initial draw power
* The par shot the course was authored around
* Gate positions, opening sizes, kinds and motion
* Target position, size and optional swing
* Static obstacle positions and collision shapes
* Wind zones (vertical and horizontal acceleration)

Every gate capital and the whole target disc must sit inside PLAY_TOP..PLAY_BOTTOM
(150..930 design px). That band is what survives cover-fit crop on a landscape
phone; outside it, the player cannot see what they must hit. validateLevels()
enforces this and runs in the dev build and in `npm run simulate`.

Gameplay objects must remain separate from the background image.
 
⸻
 
Art Direction
Use a bright, playful cartoon mobile-game style:
* Saturated colors
* Clean shapes
* Soft painted shading
* Strong silhouettes
* Simplified Greek architecture
* Blue sky and turquoise sea
* Golden accents
Avoid:
* Photorealism
* Dark or gritty visuals
* Heavy perspective
* Excessive detail
* Visual clutter
 
⸻
 
Background Art
Three handcrafted paintings serve the eight courses. Each background should:
* Contain no UI, character, arrow, gates, target, or trajectory.
* Include Greek cliffs, ruins, villages, sea, temples, clouds, and vegetation.
* Leave open sky around the intended arrow path.

A painting is camera-parallaxed at a rate derived from its own horizontal slack,
never stretched to the world width — stretching a 1504px painting across a
2900px course softens it badly. Per-course identity comes from the light around
the painting (sky gradient, tint, colour wash, vignette) in src/game/scenery.ts.

Do not draw flat vector silhouettes over a painting to fake depth: painted art
and hard-edged vector shapes at the same depth read as a rendering bug.
Do not procedurally assemble the environment.
 
⸻
 
Ulysses Art and Animation
Build Ulysses from separate transparent image parts:
* Torso
* Head
* Hair
* Cape
* Upper and lower arms
* Hands
* Upper and lower legs
* Bow
All parts must share the same scale, lighting, style, and joint positions.
Use transform-based animation, not frame-by-frame sprites.
Required animations:
Idle
* Subtle breathing
* Small cape movement
Aim
* Bow rotates toward the aim angle
* Bow arm follows the bow
* Drawing hand moves backward
* Head roughly follows the aim direction
Release
* Drawing hand moves forward
* Bow recoils slightly
* Cape reacts briefly
 
⸻
 
Other Required Assets
Create reusable transparent assets for:
* Arrow
* Gate top cap
* Gate bottom cap
* Gate glow
* Gate particles
* Gate success pulse
* Near-side-view target
* Target impact effect
* Greek stone pillar
* Rock obstacle
* Pause button
* Results panel
* Retry button
* Next Level button
* Perfect Shot badge
Do not include unrelated power-up icons.
 
⸻
 
UI
During gameplay show only:
* One stat bar: score, combo, rings collected
* A course title card that announces the course and then fades
* Pause button
* One bottom plate: aim angle, draw power, and a control hint that retires

HUD_TOP_RESERVE and HUD_BOTTOM_RESERVE are the design-px budgets the chrome
owns. The course fit subtracts them, so a ring can never sit behind a panel.
Victory screen:
* Ring quality, stars, rings collected, target points, total, drachmae
* Retry, Next Course
Defeat screen:
* Why the shot was lost, Retry, Menu

Every HUD position is derived from stage.coverInsets(), which folds together the
cover-fit crop AND the device safe area. On a landscape iPhone the crop is
vertical and the safe area is horizontal, so using either alone leaves chrome
under the sensor housing or off the frame. No HUD element may use a hard-coded
screen coordinate.

React owns the product shell (main menu, shop, settings). Pixi owns the in-run
HUD only. There must not be a second, differently-styled menu inside the canvas.
 
⸻
 
Performance
Target 60 FPS on a modern iPhone.
* Reuse particles.
* Avoid object creation every frame.
* Limit transparency-heavy effects.
* Destroy level-specific objects when changing levels.
* Handle missing assets with simple placeholders instead of crashing.
 
⸻
 
Out of Scope
Do not implement:
* Procedural levels
* Random gate placement
* Moving obstacles
* Power-ups
* Multiple arrows per shot
* Story dialogue
* Character movement
* Frame-by-frame character animation

Since the original prototype scope, the shipped game additionally has: wind
zones, bobbing gates, a swinging boss target, variable draw power, buyable
arrows, save, analytics, monetization and retention systems.
 
⸻
 
Completion Criteria
The prototype is complete when:
* It runs inside the provided PixiJS template.
* Mouse and touch controls work.
* It displays correctly in iPhone landscape.
* Ulysses aims and fires using movable body parts.
* The trajectory preview matches the arrow.
* Arrow physics are frame-rate independent.
* Steering works subtly.
* The camera follows correctly.
* Gates are visually clear and reliably detected.
* The target is shown at approximately a 15° angle.
* Victory, defeat, retry, and next-level flows work.
* Eight handcrafted courses are included, no two cleared by the same shot.
* Every course three-stars on its recorded par shot at 30, 60 and 144 FPS.
* Every gate capital and the target disc sit inside the visible play band.
* All required artwork is included.
* No gameplay object is baked into a background.
* No console errors occur during normal play.