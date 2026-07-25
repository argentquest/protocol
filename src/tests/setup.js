import '@testing-library/jest-dom/vitest'

HTMLCanvasElement.prototype.getContext = () => ({
  fillStyle: '',
  globalCompositeOperation: 'source-over',
  fillRect() {},
  getImageData() {
    return { data: new Uint8ClampedArray(4) }
  },
})
