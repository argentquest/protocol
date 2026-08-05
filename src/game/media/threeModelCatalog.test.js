import { describe, expect, it } from 'vitest'
import {
  defaultModelForRole,
  getThreeModel,
  getThreeModelCatalog,
  threeAssetUrl,
} from './threeModelCatalog.js'

describe('generated 3D model catalog', () => {
  it('registers all 126 Kenney models with stable unique IDs and previews', () => {
    const catalog = getThreeModelCatalog()
    expect(catalog.models).toHaveLength(126)
    expect(new Set(catalog.models.map((model) => model.modelId)).size).toBe(126)
    expect(catalog.models.every((model) => model.src.endsWith('.glb'))).toBe(true)
    expect(
      catalog.models.every((model) => model.previewSrc.endsWith('.png')),
    ).toBe(true)
  })

  it('resolves role defaults and deployment-base-aware asset URLs', () => {
    expect(getThreeModel(defaultModelForRole('token')).name).toBe('Ball Blue')
    expect(getThreeModel(defaultModelForRole('target')).name).toBe('Flag Blue')
    expect(defaultModelForRole('obstacle')).toBeNull()
    expect(
      threeAssetUrl('media/3d/kenney-minigolf/windmill.glb', '/game/'),
    ).toBe('/game/media/3d/kenney-minigolf/windmill.glb')
  })
})
