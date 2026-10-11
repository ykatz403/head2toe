import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type ProductMatch } from '../lib/api'
import { photoStore } from '../lib/photoStore'
import { PhotoTryOn } from './PhotoTryOn'

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  api: { tryOnStatus: vi.fn(), tryOn: vi.fn(), findProducts: vi.fn() },
}))
vi.mock('../lib/photoStore', () => ({ photoStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } }))
vi.mock('../lib/imageResize', () => ({
  toDataUri: vi.fn(async (b: File) => `data:image/jpeg;base64,${b.name.includes('me') ? 'PERSON' : 'GARMENT'}`),
}))

const m = vi.mocked(api)
const store = vi.mocked(photoStore)
const photo = (name: string) => new File(['x'], name, { type: 'image/png' })
const MATCH: ProductMatch = {
  id: 1, slot: 'shirt', name: 'Green Linen Shirt', brand: 'Everlane', price: 68,
  url: 'https://example.com/shirt', image: 'https://img.example.com/shirt.jpg', reason: 'matches',
}

const upload = (id: string, file: File) => {
  const input = document.getElementById(id) as HTMLInputElement
  return userEvent.setup().upload(input, file)
}

/** Uploads a person photo and adds one item from a search, leaving Generate enabled. */
async function addPersonAndItem(user: ReturnType<typeof userEvent.setup>) {
  await upload('tryon-person', photo('me.png'))
  await user.type(screen.getByPlaceholderText('What are you looking for?'), 'a green shirt')
  await user.click(screen.getByRole('button', { name: 'Find items' }))
  await user.click(await screen.findByRole('button', { name: 'Add' }))
}

beforeEach(() => {
  m.tryOnStatus.mockReset().mockResolvedValue({ configured: true })
  m.tryOn.mockReset()
  m.findProducts.mockReset().mockResolvedValue({ results: [MATCH] })
  store.get.mockReset().mockResolvedValue(null)
  store.set.mockReset().mockResolvedValue(undefined)
  store.clear.mockReset().mockResolvedValue(undefined)
})

describe('PhotoTryOn', () => {
  it('starts with the photo prompt and the search box, Generate disabled', async () => {
    render(<PhotoTryOn />)
    expect(await screen.findByRole('button', { name: 'Choose your photo' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What are you looking for?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose a garment photo' })).not.toBeInTheDocument()
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

  it('Generate enables once a photo is chosen and a matched item is added', async () => {
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    const gen = screen.getByRole('button', { name: 'Generate' })
    await upload('tryon-person', photo('me.png'))
    expect(gen).toBeDisabled()
    await user.type(screen.getByPlaceholderText('What are you looking for?'), 'a green shirt')
    await user.click(screen.getByRole('button', { name: 'Find items' }))
    expect(await screen.findByText('Green Linen Shirt')).toBeInTheDocument()
    expect(gen).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(gen).toBeEnabled()
  })

  it('sends the matched item straight through and shows a single result with hidden access to the rest', async () => {
    m.tryOn.mockResolvedValue({ imageUrls: ['https://example.com/r1.png', 'https://example.com/r2.png', 'https://example.com/r3.png'] })
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(m.tryOn).toHaveBeenCalledWith(
      'data:image/jpeg;base64,PERSON', 'https://img.example.com/shirt.jpg', 'Everlane Green Linen Shirt', 'upper_body',
    ))
    expect(await screen.findByAltText('You wearing the garment')).toHaveAttribute('src', 'https://example.com/r1.png')
    // Only one image is visible; the other two are reachable only through the unlabeled control at the bottom.
    expect(screen.queryByAltText(/variation/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Other variations' })).toBeInTheDocument()
  })

  it('the hidden "other variations" control opens the rest in a lightbox, starting past the visible one', async () => {
    m.tryOn.mockResolvedValue({ imageUrls: ['https://example.com/r1.png', 'https://example.com/r2.png', 'https://example.com/r3.png'] })
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByAltText('You wearing the garment')
    await user.click(screen.getByRole('button', { name: 'Other variations' }))
    expect(screen.getByText('Variation 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /variation 2/i })).toHaveAttribute('src', 'https://example.com/r2.png')
  })

  it('expanding the visible result opens only that one image, with no sign of the others', async () => {
    m.tryOn.mockResolvedValue({ imageUrls: ['https://example.com/r1.png', 'https://example.com/r2.png', 'https://example.com/r3.png'] })
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByAltText('You wearing the garment')
    await user.click(screen.getByRole('button', { name: '⤢ Expand' }))
    expect(within(screen.getByRole('dialog')).getByText('Result')).toBeInTheDocument()
    expect(screen.queryByText(/Variation \d of/)).not.toBeInTheDocument()
  })

  it('disables Generate and shows a wait message while the request is in flight', async () => {
    let resolve!: (v: { imageUrls: string[] }) => void
    m.tryOn.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('button', { name: 'Generating…' })).toBeDisabled()
    expect(screen.getByText(/10.*20 seconds/)).toBeInTheDocument()
    resolve({ imageUrls: ['https://example.com/r.png'] })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  })

  it('shows the server error message when generation fails', async () => {
    m.tryOn.mockRejectedValue(new ApiError(422, 'That photo pair couldn\'t be composited.'))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be composited")
  })

  it('shows a generic message for an unexpected failure', async () => {
    m.tryOn.mockRejectedValue(new Error('network exploded'))
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    await addPersonAndItem(user)
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't configured/i)
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('upload mode is hidden by default, reachable only through the unlabeled control at the bottom', async () => {
    const user = userEvent.setup()
    render(<PhotoTryOn />)
    expect(screen.queryByRole('button', { name: 'Upload a photo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toggle advanced mode' }))
    expect(screen.getByRole('button', { name: 'Upload a photo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Upload a photo' }))
    expect(screen.getByRole('button', { name: 'Choose a garment photo' })).toBeInTheDocument()
  })
})
