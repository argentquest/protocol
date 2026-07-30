# Path Protocol — Deep Design Review & New Ideas

Based on a thorough review of the codebase (architecturev2.md, sprintv2.md, level schemas, all 70 levels, engine code, geometry system, hazard system, power system, and collision system).

---

## 1. Current State Summary

### What exists today

| Element | Details |
|---------|---------|
| **Levels** | 70 deterministic levels (1–30 original, 31–60 expansion, 61–70 apex) |
| **Arena shapes** | `rect` (with corner radius), `ellipse`, `polygon` |
| **Token shapes** | `circle`, `rect`, `diamond` |
| **Static obstacles** | Placed manually or generated; shapes: circle, rect, diamond |
| **Moving obstacles** | Sinusoidal oscillation on x or y axis; configurable amplitude, period, phase |
| **Tracking obstacles** | Steer toward token within a rectangular zone; configurable speed, acceleration, turn rate |
| **Coins** | One-time collectibles with point value |
| **Bonuses** | Ordered relay targets offered based on score percentage |
| **Powers** | Obstacle Shield, Full Shield, Slow Field, Coin Magnet, Route Scan |
| **Scoring** | Time + distance efficiency vs par, collision penalties, bonus rewards |

### What's missing / could be improved

1. **Obstacle variety is thin** — only 3 behavioral types (static, sinusoidal, tracking) with 3 visual shapes
2. **Levels 31–60 are copy-paste variants** — many reuse the exact same layout as level 10 with only score/name changes
3. **No environmental hazards** — the arena itself never does anything interesting
4. **No interactive or stateful obstacles** — nothing responds to the token beyond collision
5. **No level modifiers** — every level plays the same way, just harder
6. **Completion is just a score screen** — no celebration, no mini-challenge, no reward gameplay
7. **No multi-phase levels** — every level is one arena, one route, done
8. **No visual or audio feedback variety** — collision always looks/sounds the same

---

## 2. New Obstacle Types

These are designed to fit within the existing engine architecture (fixed-step simulation, JSON schema, geometry system) while adding meaningful gameplay variety.

### 2.1 Rotating Obstacle (Spinner)

**Concept:** A rectangular or diamond-shaped obstacle that rotates around its center at a configurable speed. The collision shape rotates with it, creating dynamic gaps that open and close.

**Schema addition:**
```json
{
  "id": "spinner-a",
  "type": "rotating",
  "mediaId": "obstacle-rotating-rect",
  "shape": "rect",
  "x": 500,
  "y": 400,
  "width": 160,
  "height": 40,
  "rotationSpeedDegPerSecond": 90,
  "initialAngleDeg": 0
}
```

**Implementation notes:**
- Add `rotatingObstacles` array to level schema
- Store current angle in session state (like tracking obstacles store position)
- Advance angle each fixed step: `angle += rotationSpeed * (stepMs / 1000)`
- Collision: rotate the polygon vertices by current angle before intersection test
- The geometry system already has `polygonForShape()` — extend it to accept an optional rotation parameter
- Visual: Pixi display object rotation matches the collision angle

**Gameplay impact:**
- Creates timing puzzles — wait for the gap to align
- Can be placed in corridors to force precise timing
- Multiple spinners at different speeds create complex overlapping patterns
- Low difficulty: slow rotation, wide obstacle. High difficulty: fast rotation, narrow gaps

### 2.2 Pulsing Obstacle (Breather)

**Concept:** An obstacle that rhythmically expands and contracts between a minimum and maximum size. The collision shape scales with the visual.

**Schema addition:**
```json
{
  "id": "pulse-a",
  "type": "pulsing",
  "mediaId": "obstacle-pulsing-circle",
  "shape": "circle",
  "x": 500,
  "y": 400,
  "baseSize": 40,
  "pulseAmplitude": 30,
  "periodMs": 3000,
  "phase": 0
}
```

**Implementation notes:**
- Add `pulsingObstacles` array to level schema
- Current size = `baseSize + sin(elapsed / period * 2PI + phase) * amplitude`
- Collision shape updates each frame with the current size
- Reuse the same sinusoidal math from `currentMovingObstacle()` but applied to size instead of position
- Visual: Pixi scale transform, or redraw the GraphicsContext at the current size

**Gameplay impact:**
- Creates variable-width passages that open and close
- A pulsing circle can block a path entirely at max size and leave room at min size
- Combine with moving obstacles for layered timing challenges
- Low difficulty: slow pulse, small amplitude. High difficulty: fast pulse, large amplitude, placed in narrow corridors

### 2.3 Gate (One-Way / Timed)

**Concept:** A barrier that opens permanently when the token touches a switch/trigger elsewhere in the arena, or opens for a fixed duration after trigger contact.

**Schema addition:**
```json
{
  "id": "gate-a",
  "type": "gate",
  "mediaId": "obstacle-gate-rect",
  "shape": "rect",
  "x": 500,
  "y": 300,
  "width": 120,
  "height": 20,
  "triggerId": "switch-a",
  "openDurationMs": 0,
  "closeDelayMs": 0
}
```

With a companion trigger:
```json
{
  "id": "switch-a",
  "type": "trigger",
  "mediaId": "trigger-standard",
  "shape": "circle",
  "x": 200,
  "y": 600,
  "size": 30,
  "targetGateId": "gate-a"
}
```

**Implementation notes:**
- Add `gates` and `triggers` arrays to level schema
- Gate state: `closed` | `opening` | `open` | `closing`
- When token touches trigger, emit event, gate transitions to open
- If `openDurationMs > 0`, gate auto-closes after that duration (timed gate)
- If `openDurationMs === 0`, gate stays open permanently (one-way gate)
- Collision: gate is solid when closed, passable when open
- Visual: animate the gate sliding or fading open/closed

**Gameplay impact:**
- Forces route planning — must detour to trigger before proceeding
- Timed gates create urgency — reach the gate before it closes
- Can create one-way systems that lock the player into a route
- Combine with tracking obstacles for high tension

### 2.4 Fragile Obstacle (Breakable Wall)

**Concept:** An obstacle that breaks after a configurable number of token collisions, permanently clearing that path. Each collision with the obstacle reduces its integrity.

**Schema addition:**
```json
{
  "id": "fragile-a",
  "type": "fragile",
  "mediaId": "obstacle-fragile-rect",
  "shape": "rect",
  "x": 500,
  "y": 400,
  "width": 100,
  "height": 100,
  "integrity": 3,
  "collisionPenalty": true
}
```

**Implementation notes:**
- Add `fragileObstacles` array to level schema
- Track `integrity` per obstacle in session state
- On collision with a fragile obstacle: decrement integrity, apply normal collision penalty if `collisionPenalty: true`
- When integrity reaches 0: remove from collision set, play break animation, emit event
- The obstacle is removed from the `allObstacles` array passed to collision detection

**Gameplay impact:**
- Strategic choice: take a collision to break through vs find the long way around
- Can create shortcuts that require sacrifice
- Multiple breakable walls create branching paths
- High difficulty: low integrity (1 hit breaks), placed in critical paths

### 2.5 Repulsor Field

**Concept:** A circular or rectangular zone that applies a repulsion force to the token when it enters. The token is pushed away from the center (or in a configured direction) proportional to proximity.

**Schema addition:**
```json
{
  "id": "repulsor-a",
  "type": "repulsor",
  "mediaId": "obstacle-repulsor",
  "shape": "circle",
  "x": 500,
  "y": 400,
  "radius": 120,
  "force": 400,
  "falloff": "linear"
}
```

**Implementation notes:**
- Add `repulsors` array to level schema
- Each fixed step, check if token center is within the repulsor's radius
- If inside, apply a velocity impulse away from center: `force * (1 - distance/radius) * normalizedDirection * (stepMs/1000)`
- The impulse is added to the token's velocity before collision detection
- Repulsors are not solid — the token passes through but is deflected
- Visual: subtle shimmer or particle effect, stronger near center

**Gameplay impact:**
- Creates "currents" that push the token off course
- Can be used to create curved paths without manual steering
- Multiple repulsors create interference patterns
- Combine with tracking obstacles for chaos
- Low difficulty: weak force, small radius. High difficulty: strong force, large radius, placed near hazards

### 2.6 Phase-Shifting Obstacle (Blinker)

**Concept:** An obstacle that alternates between solid and passable states on a timer. The token can pass through it during the passable phase but collides during the solid phase.

**Schema addition:**
```json
{
  "id": "blinker-a",
  "type": "phaser",
  "mediaId": "obstacle-phaser-rect",
  "shape": "rect",
  "x": 500,
  "y": 400,
  "width": 100,
  "height": 100,
  "solidDurationMs": 2000,
  "passableDurationMs": 1500,
  "phase": 0
}
```

**Implementation notes:**
- Add `phaserObstacles` array to level schema
- Track a phase timer per obstacle in session state
- Cycle: solid for `solidDurationMs`, then passable for `passableDurationMs`, repeat
- When passable: exclude from collision set, render with transparency or different visual
- When solid: include in collision set, render normally
- Visual: pulsing glow when solid, ghostly/faded when passable, brief transition animation

**Gameplay impact:**
- Creates waiting-game timing challenges
- Must observe the pattern and time movement through the obstacle
- Multiple phasers with different phases create complex temporal puzzles
- Combine with moving obstacles for layered timing
- Low difficulty: long passable window, short solid window. High difficulty: short passable window, long solid window

### 2.7 Conveyor / Force Field

**Concept:** A rectangular zone that applies a constant velocity to the token in a configured direction while the token is inside it. The token drifts even when not actively steering.

**Schema addition:**
```json
{
  "id": "conveyor-a",
  "type": "conveyor",
  "mediaId": "obstacle-conveyor",
  "shape": "rect",
  "x": 400,
  "y": 400,
  "width": 200,
  "height": 60,
  "directionDeg": 270,
  "speed": 120
}
```

**Implementation notes:**
- Add `conveyors` array to level schema
- Each fixed step, check if token center is inside any conveyor zone
- If inside, add conveyor velocity to token velocity (or override lateral component)
- Conveyors are not solid — the token passes through but is carried
- Visual: animated arrows or directional stripes

**Gameplay impact:**
- Forces the token along a path — can be helpful or dangerous
- Can carry the token into hazards if not counter-steered
- Creates one-way corridors and forced-movement sections
- Combine with moving obstacles for precision challenges
- Low difficulty: slow speed, short conveyor. High difficulty: fast speed, long conveyor over hazards

---

## 3. Mini-Level Completion Concept

### 3.1 The Idea

When a player completes a level (reaches the main target), instead of immediately showing the score screen, the game offers a **"Breach Protocol"** mini-level — a short, optional sub-challenge that:

1. Uses the same arena but with a simplified/modified layout
2. Has a single target to reach within a tight time limit
3. Awards bonus coins and a score multiplier if completed
4. Is always optional — the player can bank and skip

### 3.2 How It Works

**Trigger:** When the player reaches the main target and the bonus offer dialog appears, a third option is added: "Attempt Breach" alongside "Pursue Bonus" and "Bank Score."

**Breach mini-level rules:**
- The arena is the same shape/size but obstacles are rearranged (new deterministic seed derived from level seed + "breach")
- Token starts at the main target position
- One target to reach (a "breach exit")
- Tight time limit (e.g., 50% of the main level's par time)
- No bonus targets, no coins
- Collisions still count but the limit is 1 (any collision = breach failed)
- If completed: bonus coins + score multiplier on the main level score
- If failed: no penalty (the main level score is already banked)

**Schema addition to level config:**
```json
{
  "breach": {
    "enabled": true,
    "seed": "breach-level-01-v1",
    "parTimeMs": 3000,
    "obstacleCount": 3,
    "allowedShapes": ["rect"],
    "minSize": 60,
    "maxSize": 100,
    "minimumGap": 80,
    "rewardCoins": 3,
    "scoreMultiplier": 1.25
  }
}
```

### 3.3 Implementation Notes

- Add optional `breach` property to level schema
- If absent, the Breach option does not appear (backward compatible)
- Generate breach layout using the same `levelGenerator.js` but with the breach seed and config
- Reuse the same engine/state machine — the breach is essentially a mini level session
- The breach uses the same arena, token, and movement settings as the parent level
- On breach completion: apply `scoreMultiplier` to the main level score, award `rewardCoins`
- On breach failure: return to the normal completion flow with no penalty

### 3.4 Progression Integration

- Early levels (1–10): breach is simple, generous time, few obstacles
- Mid levels (11–30): breach is moderate, tighter time, mixed obstacles
- Late levels (31–60): breach is challenging, uses moving/tracking obstacles
- Apex levels (61–70): breach is extremely tight, uses all obstacle types
- Some levels may have no breach (story/rest levels)
- Completing all breaches in a tier could unlock an achievement or bonus power

### 3.5 Visual & Audio

- Breach mode has a distinct visual filter (e.g., scanline overlay, color shift)
- Countdown timer is prominently displayed
- Distinct audio cue when breach starts and when time is running out
- Success: celebratory sound + particle burst
- Failure: soft failure sound (no penalty, so no harsh punishment)

---

## 4. Additional Ideas for Variety

### 4.1 Arena Hazards

The arena itself can have interactive features:
- **Crushing walls** — arena margins that slowly close in, then reset
- **Floor hazards** — zones within the arena that damage the token on contact (like lava/pits)
- **Teleporters** — zones that instantly move the token to another location
- **Speed zones** — areas that boost or reduce token speed

### 4.2 Level Conditions / Mutators

Applied per level or as a global modifier:
- **Fog** — reduced visibility, token trail only shows last N samples
- **Reverse controls** — pointer/keys are inverted
- **Low friction** — token slides more, deceleration is reduced
- **High gravity** — token accelerates faster but decelerates slower
- **One-shot** — only one collision allowed (not three)

### 4.3 Token Variants

Beyond shape/size:
- **Trailing token** — leaves a persistent trail that obstacles can also collide with (self-trapping risk)
- **Bouncing token** — token bounces off arena boundaries instead of colliding
- **Split token** — two linked tokens that must both reach the target (control switches between them)
- **Momentum token** — no deceleration, must steer to change direction

### 4.4 Environmental Storytelling

- Levels could have thematic names that hint at mechanics
- Briefing text could evolve based on player performance
- Visual themes could change between level tiers (laboratory → wilderness → digital space)
- Hidden lore collectibles (data fragments) placed in difficult-to-reach spots

### 4.5 New Power Concepts

| Power | Effect | Key |
|-------|--------|-----|
| **Time Freeze** | Freezes all moving/tracking obstacles for 2s | 6 |
| **Phase Walk** | Token becomes passable through obstacles for 1.5s | 7 |
| **Decoy** | Creates a stationary decoy that tracking obstacles chase | 8 |
| **Rewind** | Returns token to position 3 seconds ago | 9 |

---

## 5. Implementation Priority

### Sprint-ready (low effort, high impact)

1. **Rotating obstacles** — reuses existing polygon collision, adds rotation parameter
2. **Pulsing obstacles** — reuses sinusoidal math from moving obstacles
3. **Phase-shifting obstacles** — simple timer-based state toggle
4. **Breach mini-levels** — reuses entire engine, just new level generation call

### Medium effort

5. **Conveyor zones** — new force-application system, no collision changes
6. **Repulsor fields** — new force-application system, proximity-based
7. **Fragile obstacles** — new integrity tracking, minor collision system change

### Larger effort (new systems)

8. **Gates & triggers** — new entity types, event wiring, state management
9. **Arena hazards** — new zone types, damage model
10. **Level conditions** — new modifier system, UI indicators

---

## 6. Schema Compatibility

All new obstacle types should be added as **optional arrays** in the level schema:

```json
{
  "rotatingObstacles": { "type": "array", "items": { "$ref": "#/$defs/rotatingObstacle" } },
  "pulsingObstacles": { "type": "array", "items": { "$ref": "#/$defs/pulsingObstacle" } },
  "gates": { "type": "array", "items": { "$ref": "#/$defs/gate" } },
  "triggers": { "type": "array", "items": { "$ref": "#/$defs/trigger" } },
  "fragileObstacles": { "type": "array", "items": { "$ref": "#/$defs/fragileObstacle" } },
  "repulsors": { "type": "array", "items": { "$ref": "#/$defs/repulsor" } },
  "phaserObstacles": { "type": "array", "items": { "$ref": "#/$defs/phaserObstacle" } },
  "conveyors": { "type": "array", "items": { "$ref": "#/$defs/conveyor" } },
  "breach": { "$ref": "#/$defs/breachConfig" }
}
```

Existing levels are unaffected — they simply omit these arrays. The engine checks for each array's existence before iterating.

---

## 7. Summary

The game has a solid foundation: deterministic simulation, clean engine/renderer separation, validated JSON configs, and 70 levels. The main area for improvement is **gameplay variety** — the obstacle system currently has only 3 behavioral types, and many expansion levels are copy-paste variants.

The highest-impact additions are:

| Addition | Why it matters |
|----------|----------------|
| **Rotating obstacles** | Creates timing puzzles, reuses existing collision code |
| **Pulsing obstacles** | Variable-width passages, reuses existing math |
| **Phase-shifting obstacles** | Temporal waiting-game challenges, simple timer |
| **Breach mini-levels** | Adds post-completion gameplay, reuses entire engine |
| **Conveyor zones** | Forces token movement, creates one-way systems |
| **Fragile obstacles** | Strategic collision trade-offs, path-breaking |

Each addition is designed to be **backward compatible** (optional schema fields, existing levels unchanged) and **architecturally consistent** (fixed-step simulation, JSON config, geometry system).
