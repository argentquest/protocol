/**
 * @typedef {object} GameEvent
 * @property {string} type Stable logical event type.
 * @property {object} payload Serializable event data.
 */

/**
 * Creates an engine-local synchronous event bus.
 *
 * @returns {{subscribe: (type: string, listener: (event: GameEvent) => void) => (() => void), emit: (type: string, payload?: object) => void, dispose: () => void, readonly disposed: boolean}}
 */
export function createGameEventBus() {
  const listeners = new Map()
  let disposed = false

  function subscribe(type, listener) {
    if (disposed) throw new Error('Cannot subscribe to a disposed event bus.')
    if (typeof listener !== 'function') {
      throw new TypeError('Game event listener must be a function.')
    }
    const typeListeners = listeners.get(type) ?? new Set()
    typeListeners.add(listener)
    listeners.set(type, typeListeners)
    return () => {
      typeListeners.delete(listener)
      if (typeListeners.size === 0) listeners.delete(type)
    }
  }

  function emit(type, payload = {}) {
    if (disposed) return
    const event = Object.freeze({ type, payload })
    for (const listener of listeners.get(type) ?? []) listener(event)
    for (const listener of listeners.get('*') ?? []) listener(event)
  }

  function dispose() {
    disposed = true
    listeners.clear()
  }

  return {
    subscribe,
    emit,
    dispose,
    get disposed() {
      return disposed
    },
  }
}
