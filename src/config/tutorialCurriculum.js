import level01 from './tutorial-levels/tutorial-01.json'
import level02 from './tutorial-levels/tutorial-02.json'
import level03 from './tutorial-levels/tutorial-03.json'
import level04 from './tutorial-levels/tutorial-04.json'
import level05 from './tutorial-levels/tutorial-05.json'
import level06 from './tutorial-levels/tutorial-06.json'
import level07 from './tutorial-levels/tutorial-07.json'
import level08 from './tutorial-levels/tutorial-08.json'
import level09 from './tutorial-levels/tutorial-09.json'
import level10 from './tutorial-levels/tutorial-10.json'
import level11 from './tutorial-levels/tutorial-11.json'
import level12 from './tutorial-levels/tutorial-12.json'
import level13 from './tutorial-levels/tutorial-13.json'
import level14 from './tutorial-levels/tutorial-14.json'
import level15 from './tutorial-levels/tutorial-15.json'
import level16 from './tutorial-levels/tutorial-16.json'
import level17 from './tutorial-levels/tutorial-17.json'
import level18 from './tutorial-levels/tutorial-18.json'
import level19 from './tutorial-levels/tutorial-19.json'
import level20 from './tutorial-levels/tutorial-20.json'

/**
 * The Aurora Academy progression divided into six teaching phases.
 *
 * @type {Array<{phase: number, title: string, range: [number, number], summary: string}>}
 */
export const tutorialPhases = [
  {
    phase: 1,
    title: 'Foundation',
    range: [1, 4],
    summary: 'Steering, static geometry, coins, and walls.',
  },
  {
    phase: 2,
    title: 'Motion Reading',
    range: [5, 9],
    summary: 'Timing every moving and dynamic hazard.',
  },
  {
    phase: 3,
    title: 'Environment',
    range: [10, 13],
    summary: 'Switches, force fields, and tracking threats.',
  },
  {
    phase: 4,
    title: 'Ricochet',
    range: [14, 16],
    summary: 'Shots, surface responses, and shot goals.',
  },
  {
    phase: 5,
    title: 'Vertical',
    range: [17, 18],
    summary: 'Ramps, gravity, slopes, and bridges.',
  },
  {
    phase: 6,
    title: 'Mastery',
    range: [19, 20],
    summary: 'Bonuses, powers, and the full convergence.',
  },
]

/**
 * Detailed lesson explanations for the 20 Aurora Academy levels.
 *
 * Each entry pairs a lesson body and tip with the level document itself, so
 * names, difficulties, and in-game briefings always match the level files.
 *
 * @type {Array<{level: object, category: string, mode: string, detail: string, tip: string}>}
 */
const lessons = [
  {
    level: level01,
    category: 'Movement',
    mode: 'Guided',
    detail:
      'The token never snaps to the pointer. It accelerates toward your cursor at a bounded rate and decelerates as it arrives, so gentle, deliberate movement keeps you in control. The arena edge is a hard boundary — keep the complete token inside.',
    tip: 'Click the token once to link it and move the pointer ahead of the token, not onto it, for the smoothest line.',
  },
  {
    level: level02,
    category: 'Obstacles',
    mode: 'Guided',
    detail:
      'Every obstacle is authoritative collision geometry: circle, rectangle, or diamond. A contact costs 20% of your score multiplier, and the third contact restarts the attempt on the same layout. The complete token outline must clear every shape.',
    tip: 'Leave at least one token-width of clearance — the hitbox is slightly smaller than the artwork, but not by much.',
  },
  {
    level: level03,
    category: 'Coins',
    mode: 'Guided',
    detail:
      'Coins are one-time pickups worth points. The score also rewards how close your actual route is to the par distance and par time, so a wide detour for a single coin can cost more than the coin is worth.',
    tip: 'Read the whole coin arc before you move; one smooth curve beats two corrections.',
  },
  {
    level: level04,
    category: 'Walls',
    mode: 'Both',
    detail:
      'Interior walls are permanent course furniture. In Guided mode they stop the token without counting as a hazard penalty; in Ricochet they rebound the token with their restitution. The perimeter walls around the arena behave the same way.',
    tip: 'Slide along a wall to correct your line — contact with a wall never breaks your run.',
  },
  {
    level: level05,
    category: 'Moving obstacles',
    mode: 'Guided',
    detail:
      'Moving obstacles follow a fixed sinusoidal track — position, amplitude, period, and phase are all deterministic, so a line that works once works forever. The hazard is fastest mid-sweep and lingers at the ends of its travel.',
    tip: 'Cross just after the obstacle passes your lane, when it is farthest from your line.',
  },
  {
    level: level06,
    category: 'Phase gates',
    mode: 'Guided',
    detail:
      'A phase gate cycles solid → warning → open. The gate is an obstacle only while solid; the warning phase announces that it is about to close, and the open window is when you cross. Each gate runs on its own deterministic clock.',
    tip: 'Wait for the gate to be fully open before committing — the open window is longer than the warning.',
  },
  {
    level: level07,
    category: 'Pulse blocks',
    mode: 'Guided',
    detail:
      'A pulse block breathes between its minimum and maximum scale on a fixed cycle. Its collision footprint changes with its size, so a gap that is blocked at full size opens at minimum size.',
    tip: 'Time your entry so you reach the narrowest point of the corridor just as the block is smallest.',
  },
  {
    level: level08,
    category: 'Orbiters',
    mode: 'Guided',
    detail:
      'Orbiters travel a fixed elliptical path around their anchor. The whole path is deterministic — the orbiter is never chasing you. Pick the moment it swings away from your line and commit.',
    tip: 'The orbiter is slowest relative to you at the ends of its ellipse; use that beat to cross.',
  },
  {
    level: level09,
    category: 'Rotating arms',
    mode: 'Guided',
    detail:
      'A rotating spinner sweeps a full circle at a constant angular speed. Its arm is thin but fast, and it covers a predictable ring around its anchor. The safe moment is the gap right after the arm passes your crossing point.',
    tip: 'Wait at the ring’s edge, not inside it — you can cross the ring in the time between sweeps.',
  },
  {
    level: level10,
    category: 'Switches',
    mode: 'Guided',
    detail:
      'A switch pad opens its linked barriers when the token touches it. Timed switches stay open for their duration and then close; once-switches open permanently. Barriers start solid and are passable only while the switch is active.',
    tip: 'Touch the pad, then go straight through — don’t pause to watch the barrier open.',
  },
  {
    level: level11,
    category: 'Force fields',
    mode: 'Guided',
    detail:
      'A conveyor applies a constant force in one direction while the token is inside its rectangle. It adds to your velocity every tick, so you must hold steering against it just to keep a straight line.',
    tip: 'Aim slightly up-current of your target and let the field carry you onto the line.',
  },
  {
    level: level12,
    category: 'Force fields',
    mode: 'Guided',
    detail:
      'Radial fields push (repulsor) or pull (attractor) the token toward or away from a center, with force that weakens with distance. An attractor bends your route inward; a repulsor deflects you outward.',
    tip: 'Pass an attractor on the side opposite your target so the pull curves you onto the line instead of into it.',
  },
  {
    level: level13,
    category: 'Tracking obstacles',
    mode: 'Guided',
    detail:
      'A tracking obstacle wakes after your first press and homes toward the token inside its zone, accelerating gradually and steering with a limited turn rate. It never leaves its zone, so the open side is your escape.',
    tip: 'The Slow Field power (key 3) slows every moving and tracking hazard for 4 seconds — a free breath when the chaser corners you.',
  },
  {
    level: level14,
    category: 'Ricochet',
    mode: 'Ricochet',
    detail:
      'Ricochet replaces steering with shots: press the stopped token, pull opposite the direction you want to go, and release. Launch speed scales with pull distance up to a maximum. Drag bleeds speed every second, and the token stops when it slows below the stop speed.',
    tip: 'Full-power pulls overshoot — start with a medium pull and let drag bring you to rest near the target.',
  },
  {
    level: level15,
    category: 'Ricochet surfaces',
    mode: 'Ricochet',
    detail:
      'Different surfaces respond differently in Ricochet: walls and bumpers rebound the token with their restitution (a bumper can exceed 1.0 and add speed), while arrestors stop it instantly on contact. Choose your impacts deliberately.',
    tip: 'Use a bumper to recover speed after a drag-heavy shot, and treat an arrestor as a wall that ends your shot.',
  },
  {
    level: level16,
    category: 'Reset surfaces',
    mode: 'Ricochet',
    detail:
      'A reset surface returns the token to its most recent fully stopped position — a forgiving recovery, but it costs you the shot. Shot goals track par (target shots), perfect shots, and a maximum limit; the last permitted shot always resolves before the result is decided.',
    tip: 'If a shot is going wrong, a reset is often cheaper than a wall bounce into a corner.',
  },
  {
    level: level17,
    category: 'Elevation',
    mode: 'Both',
    detail:
      'With vertical physics, ramps launch the token when you cross them with enough speed in their direction. Air drag is much lower than ground drag, so launched tokens carry a long way. Obstacles with an explicit collision height can be flown over; infinite-height obstacles cannot.',
    tip: 'Approach the ramp dead-on and at full speed — the launch follows the ramp, not your aim.',
  },
  {
    level: level18,
    category: 'Terrain',
    mode: 'Both',
    detail:
      'Terrain surfaces are sloped decks: gravity projects along the slope, pulling the token downhill, and friction slows the roll. A raised surface with nothing beneath its deck is a bridge — walk off the edge and you fall to the ground below.',
    tip: 'On a downhill, release steering early; the slope finishes the job and friction stops you.',
  },
  {
    level: level19,
    category: 'Bonuses & powers',
    mode: 'Both',
    detail:
      'After the main target, the relay offers a bonus target for extra reward, or you can bank and keep the score. Failing a bonus costs a fraction of the score, so know your line before pursuing. Powers are consumable charges bought in the Power Lab and activated with keys 1–5; the Obstacle Shield ignores obstacle contacts for 3 seconds.',
    tip: 'Activate the shield just before the tightest part of the return path, not at the start.',
  },
  {
    level: level20,
    category: 'Mastery',
    mode: 'Both',
    detail:
      'Every lesson in one course: a phase gate to time, an orbiter to read, a spinner to avoid, a current to counter, coins to gather, and a bonus relay to weigh. Read the whole course before your first press — the fastest route is planned, not discovered.',
    tip: 'Collect the coins on the way to the target; the bonus is optional and the main line comes first.',
  },
]

/** @type {Array<{number: number, name: string, difficulty: number, briefing: string, category: string, mode: string, detail: string, tip: string}>} */
export const tutorialLessons = lessons.map(({ level, category, mode, detail, tip }) => ({
  number: level.number,
  name: level.name,
  difficulty: level.difficulty,
  briefing: level.briefing,
  category,
  mode,
  detail,
  tip,
}))
