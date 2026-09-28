import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toDataUri } from './imageResize'

// jsdom has no real canvas or image decoder, so the resize math is tested against mocked
// createImageBitmap dimensions and a stubbed canvas rather than real pixels.
let bitmapSize = { width: 200, height: 300 }
let lastCanvasSize = { width: 0, height: 0 }

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...bitmapSize, close: vi.fn() })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb) {
    lastCanvasSize = { width: this.width, height: this.height }
    cb!(new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' }))
  })
})

const blob = () => new Blob(['x'], { type: 'image/png' })

describe('toDataUri', () => {
  it('returns a jpeg data URI', async () => {
    bitmapSize = { width: 100, height: 150 }
    expect(await toDataUri(blob())).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('leaves a small image at its original size', async () => {
    bitmapSize = { width: 200, height: 300 }
    await toDataUri(blob(), 1024)
    expect(lastCanvasSize).toEqual({ width: 200, height: 300 })
  })

  it('downscales a large image to fit maxSide, keeping aspect ratio', async () => {
    bitmapSize = { width: 2000, height: 1000 }
    await toDataUri(blob(), 500)
    expect(lastCanvasSize).toEqual({ width: 500, height: 250 })
  })

  it('rejects a file that is not a real image', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('not an image'))
    await expect(toDataUri(blob())).rejects.toThrow()
  })
})
