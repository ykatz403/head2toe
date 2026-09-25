import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { photoStore } from '../lib/photoStore'
import { PhotoTryOn } from './PhotoTryOn'

const analysis = { photo: {}, photoCtx: {}, w: 10, h: 10, lm: [], tight: null, loose: null }
const analyzePhoto = vi.fn()
const renderTryOn = vi.fn()
vi.mock('../lib/tryon', () => ({ analyzePhoto: (...a: unknown[]) => analyzePhoto(...a), renderTryOn: (...a: unknown[]) => renderTryOn(...a) }))
vi.mock('../lib/photoStore', () => ({ photoStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } }))
const store = vi.mocked(photoStore)

const photo = (name = 'me.png') => new File(['x'], name, { type: 'image/png' })
const scanError = (msg: string) => Object.assign(new Error(msg), { name: 'ScanError' })

beforeEach(() => {
  analyzePhoto.mockReset().mockResolvedValue(analysis)
  renderTryOn.mockReset()
  store.get.mockReset().mockResolvedValue(null)
  store.set.mockReset().mockResolvedValue(undefined)
  store.clear.mockReset().mockResolvedValue(undefined)
})

const upload = async (user: ReturnType<typeof userEvent.setup>, file = photo()) =>
  user.upload(document.getElementById('try-photo') as HTMLInputElement, file)

describe('PhotoTryOn: no saved photo', () => {
  it('shows the upload prompt and the privacy note', async () => {
    render(<PhotoTryOn items={[]} />)
    expect(await screen.findByRole('heading', { name: /put the outfit on your photo/i })).toBeInTheDocument()
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
  })

  it('analysing a chosen photo saves it and renders the result', async () => {
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    await screen.findByRole('heading', { name: /put the outfit/i })
    await upload(user)
    await waitFor(() => expect(analyzePhoto).toHaveBeenCalledTimes(1))
    expect(store.set).toHaveBeenCalledWith(expect.any(File))
    expect(await screen.findByRole('button', { name: 'Show original' })).toBeInTheDocument()
    expect(renderTryOn).toHaveBeenCalledWith(analysis, expect.anything(), [], false)
  })

  it('a photo with nobody in it shows the reason and stays on the upload screen', async () => {
    analyzePhoto.mockRejectedValue(scanError("We couldn't find a person in your photo."))
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    await screen.findByRole('heading', { name: /put the outfit/i })
    await upload(user)
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't find a person")
    expect(store.set).not.toHaveBeenCalled()
  })

  it('an unexpected failure gets a generic, non-technical message', async () => {
    analyzePhoto.mockRejectedValue(new Error('WASM trapped at 0xdead'))
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    await screen.findByRole('heading', { name: /put the outfit/i })
    await upload(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/try a different one/i)
    expect(alert).not.toHaveTextContent('0xdead')
  })
})

describe('PhotoTryOn: a saved photo exists', () => {
  it('loads and renders it on mount, without asking the user anything', async () => {
    store.get.mockResolvedValue(photo())
    render(<PhotoTryOn items={[{ slot: 'top', color: '#123', attrs: {} }]} />)
    await waitFor(() => expect(analyzePhoto).toHaveBeenCalledTimes(1))
    expect(store.set).not.toHaveBeenCalled() // re-analysing a saved photo does not re-save it
    expect(await screen.findByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    expect(renderTryOn).toHaveBeenCalledWith(analysis, expect.anything(), [{ slot: 'top', color: '#123', attrs: {} }], false)
  })

  it('re-renders when the chosen items change, without re-analysing the photo', async () => {
    store.get.mockResolvedValue(photo())
    const { rerender } = render(<PhotoTryOn items={[]} />)
    await waitFor(() => expect(analyzePhoto).toHaveBeenCalledTimes(1))
    rerender(<PhotoTryOn items={[{ slot: 'hat', color: '#fff', attrs: {} }]} />)
    await waitFor(() => expect(renderTryOn).toHaveBeenLastCalledWith(analysis, expect.anything(), [{ slot: 'hat', color: '#fff', attrs: {} }], false))
    expect(analyzePhoto).toHaveBeenCalledTimes(1)
  })

  it('Show original swaps to the plain photo and back', async () => {
    store.get.mockResolvedValue(photo())
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    const toggle = await screen.findByRole('button', { name: 'Show original' })
    await user.click(toggle)
    expect(renderTryOn).toHaveBeenLastCalledWith(analysis, expect.anything(), [], true)
    expect(screen.getByRole('button', { name: 'Show outfit' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Show outfit' }))
    expect(renderTryOn).toHaveBeenLastCalledWith(analysis, expect.anything(), [], false)
  })

  it('Change photo replaces the analysis and saves the new one', async () => {
    store.get.mockResolvedValue(photo('old.png'))
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    await screen.findByRole('button', { name: 'Change photo' })
    await upload(user, photo('new.png'))
    await waitFor(() => expect(analyzePhoto).toHaveBeenCalledTimes(2))
    expect(store.set).toHaveBeenCalledTimes(1) // only the newly chosen photo is (re)saved, not the one just loaded
    expect(store.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.png' }))
  })

  it('Remove photo clears storage and returns to the upload prompt', async () => {
    store.get.mockResolvedValue(photo())
    const user = userEvent.setup()
    render(<PhotoTryOn items={[]} />)
    await user.click(await screen.findByRole('button', { name: 'Remove photo' }))
    expect(store.clear).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: /put the outfit/i })).toBeInTheDocument()
  })

  it('a corrupt saved photo falls back to the upload prompt with an explanation', async () => {
    store.get.mockResolvedValue(photo())
    analyzePhoto.mockRejectedValue(scanError("We couldn't open your photo."))
    render(<PhotoTryOn items={[]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open your photo")
    expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeInTheDocument()
  })
})
