import '@testing-library/jest-dom/vitest'

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => ({
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    fillRect() {},
    getImageData() {
      return { data: new Uint8ClampedArray(4) }
    },
  })
}
