import { Container } from 'pixi.js'

export const SCENE_LAYER_ORDER = Object.freeze([
  'arena',
  'debug',
  'ghostTrail',
  'trail',
  'obstacles',
  'targets',
  'coins',
  'effects',
  'token',
  'collisionGuide',
])

/**
 * Creates stable Pixi containers in deterministic back-to-front order.
 *
 * @param {typeof Container} [ContainerClass] Injectable Pixi class.
 * @returns {{root: Container, layers: Record<string, Container>}} Scene graph.
 */
export function createSceneLayers(ContainerClass = Container) {
  const root = new ContainerClass()
  root.label = 'world'
  const layers = {}
  for (const name of SCENE_LAYER_ORDER) {
    const layer = new ContainerClass()
    layer.label = name
    layers[name] = layer
    root.addChild(layer)
  }
  return { root, layers }
}
