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

export function createGameStateMachine(initialState = 'loading', onTransition = () => {}) {
  if (!GAME_STATES.includes(initialState)) {
    throw new Error(`Unknown initial game state "${initialState}".`)
  }
  let state = initialState
  let resumeState = null

  function can(event) {
    if (event === 'pause') {
      return state !== 'paused' && state !== 'loading' && state !== 'failed'
    }
    if (event === 'resume') return state === 'paused' && resumeState !== null
    return Boolean(transitions[state]?.[event])
  }

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
    get state() {
      return state
    },
    get resumeState() {
      return resumeState
    },
  }
}
