export const GAME_STATES = Object.freeze([
  'loading',
  'ready',
  'active-main',
  'main-reached',
  'bonus-offer',
  'bonus-ready',
  'active-bonus',
  'completed',
  'failed',
  'restarting',
  'paused',
])

/**
 * @typedef {object} GameTransition
 * @property {string} previous Previous game state.
 * @property {string} state Resulting game state.
 * @property {string} event Transition event.
 * @property {object} payload Event-specific data.
 */

const transitions = {
  loading: { loaded: 'ready', fail: 'failed' },
  ready: { activate: 'active-main', restart: 'restarting', fail: 'failed' },
  'active-main': {
    'main-reached': 'main-reached',
    'release-early': 'restarting',
    'maximum-collisions': 'restarting',
    restart: 'restarting',
    fail: 'failed',
  },
  'main-reached': {
    'bonus-offered': 'bonus-offer',
    bank: 'completed',
    'no-bonus': 'completed',
    restart: 'restarting',
    fail: 'failed',
  },
  'bonus-offer': {
    pursue: 'bonus-ready',
    bank: 'completed',
    restart: 'restarting',
    fail: 'failed',
  },
  'bonus-ready': {
    activate: 'active-bonus',
    bank: 'completed',
    restart: 'restarting',
    fail: 'failed',
  },
  'active-bonus': {
    'bonus-reached': 'main-reached',
    'bonus-failed': 'completed',
    'maximum-collisions': 'restarting',
    restart: 'restarting',
    fail: 'failed',
  },
  completed: { replay: 'ready', next: 'loading', restart: 'restarting' },
  failed: { retry: 'ready', replay: 'ready', restart: 'restarting' },
  restarting: { reset: 'ready', fail: 'failed' },
}

/**
 * Creates the validated state machine that governs a level session.
 *
 * @param {string} [initialState='loading'] Initial state.
 * @param {(transition: GameTransition) => void} [onTransition] Transition observer.
 * @returns {{can: (event: string) => boolean, transition: (event: string, payload?: object) => GameTransition, readonly state: string, readonly resumeState: string|null}}
 */
export function createGameStateMachine(initialState = 'loading', onTransition = () => {}) {
  if (!GAME_STATES.includes(initialState)) {
    throw new Error(`Unknown initial game state "${initialState}".`)
  }
  let state = initialState
  let resumeState = null

  /** @param {string} event Transition event. @returns {boolean} Whether the current state accepts it. */
  function can(event) {
    if (event === 'pause') {
      return state !== 'paused' && state !== 'loading' && state !== 'failed'
    }
    if (event === 'resume') return state === 'paused' && resumeState !== null
    return Boolean(transitions[state]?.[event])
  }

  /**
   * Applies one valid transition and notifies the state observer.
   *
   * @param {string} event Transition event.
   * @param {object} [payload={}] Serializable transition context.
   * @returns {string} New gameplay state.
   */
  function transition(event, payload = {}) {
    if (!can(event)) {
      throw new Error(`Invalid game transition "${event}" from "${state}".`)
    }
    const previous = state
    if (event === 'pause') {
      resumeState = state
      state = 'paused'
    } else if (event === 'resume') {
      state = resumeState
      resumeState = null
    } else {
      state = transitions[state][event]
    }
    const result = Object.freeze({ previous, state, event, payload })
    onTransition(result)
    return result
  }

  return {
    can,
    transition,
    /** @returns {string} Current gameplay state. */
    get state() {
      return state
    },
    /** @returns {string|null} State restored when leaving pause. */
    get resumeState() {
      return resumeState
    },
  }
}
