import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { photoStore } from '../lib/photoStore'
import { PhotoTryOn } from './PhotoTryOn'

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  api: { tryOnStatus: vi.fn(), tryOn: vi.fn() },
}))
vi.mock('../lib/photoStore', () => ({ photoStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } }))
vi.mock('../lib/imageResize', () => ({
  toDataUri: vi.fn(async (b: File) => `data:image/jpeg;base64,${b.name.includes('me') ? 'PERSON' : 'GARMENT'}`),
}))

const m = vi.mocked(api)
const store = vi.mocked(photoStore)
const photo = (name: string) => new File(['x'], name, { type: 'image/png' })

beforeEach(() => {
  m.tryOnStatus.mockReset().mockResolvedValue({ configured: true })
  m.tryOn.mockReset()
  store.get.mockReset().mockResolvedValue(null)
  store.set.mockReset().mockResolvedValue(undefined)
  store.clear.mockReset().mockResolvedValue(undefined)
})

const upload = (id: string, file: File) => {
  const input = document.getElementById(id) as HTMLInputElement
  return userEvent.setup().upload(input, file)
}

describe('PhotoTryOn', () => {
  it('starts with both upload prompts and Generate disabled', async () => {
    render(<PhotoTryOn />)
    expect(await screen.findByRole('button', { name: 'Choose your photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a garment photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('restores a previously saved person photo on mount', async () => {
    store.get.mockResolvedValue(photo('me.png'))
    render(<PhotoTryOn />)
    expect(await screen.findByAltText('You')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose your photo' })).not.toBeInTheDocument()
  })

  it('choosing a person photo saves it and shows a preview', async () => {
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    expect(await screen.findByAltText('You')).toBeInTheDocument()
    expect(store.set).toHaveBeenCalledWith(expect.any(File))
  })

  it('Generate enables only once both a person and a garment photo are present', async () => {
    render(<PhotoTryOn />)
    const gen = screen.getByRole('button', { name: 'Generate' })
    await upload('tryon-person', photo('me.png'))
    expect(gen).toBeDisabled()
    await upload('tryon-garment', photo('shirt.png'))
    expect(gen).toBeEnabled()
  })

  it('sends the resized images, description and category, and shows the result', async () => {
    m.tryOn.mockResolvedValue({ imageUrl: 'https://example.com/result.png' })
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    await upload('tryon-garment', photo('shirt.png'))
    await user.type(screen.getByLabelText('Description'), 'Green linen shirt')
    await user.selectOptions(screen.getByLabelText('Type'), 'lower_body')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(m.tryOn).toHaveBeenCalledWith(
      'data:image/jpeg;base64,PERSON', 'data:image/jpeg;base64,GARMENT', 'Green linen shirt', 'lower_body',
    ))
    expect(await screen.findByAltText('You wearing the garment')).toHaveAttribute('src', 'https://example.com/result.png')
  })

  it('disables Generate and shows a wait message while the request is in flight', async () => {
    let resolve!: (v: { imageUrl: string }) => void
    m.tryOn.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    await upload('tryon-garment', photo('shirt.png'))
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('button', { name: 'Generating…' })).toBeDisabled()
    expect(screen.getByText(/20.*40 seconds/)).toBeInTheDocument()
    resolve({ imageUrl: 'https://example.com/r.png' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  })

  it('shows the server error message when generation fails', async () => {
    m.tryOn.mockRejectedValue(new ApiError(422, 'That photo pair couldn\'t be composited.'))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    await upload('tryon-garment', photo('shirt.png'))
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be composited")
  })

  it('shows a generic message for an unexpected failure', async () => {
    m.tryOn.mockRejectedValue(new Error('network exploded'))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    await upload('tryon-garment', photo('shirt.png'))
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
  })

  it('Remove clears the saved person photo', async () => {
    store.get.mockResolvedValue(photo('me.png'))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await screen.findByAltText('You')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(store.clear).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Choose your photo' })).toBeInTheDocument()
  })

  it('warns and disables Generate when try-on is not configured on the server', async () => {
    m.tryOnStatus.mockResolvedValue({ configured: false })
    render(<PhotoTryOn />)
    await upload('tryon-person', photo('me.png'))
    await upload('tryon-garment', photo('shirt.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't configured/i)
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })
})
