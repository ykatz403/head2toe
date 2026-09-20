import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api, ApiError } from './lib/api'
import { AuthProvider } from './lib/auth'
import { outfit } from './test/fixtures'

vi.mock('./lib/api', async (orig) => ({
  ...(await orig<typeof import('./lib/api')>()),
  api: { outfit: vi.fn(), getScan: vi.fn(), putScan: vi.fn(), deleteScan: vi.fn(), register: vi.fn(), login: vi.fn() },
}))
// WebGL does not exist in jsdom: replace the 3D stage with something that exposes what it was asked to draw.
vi.mock('./avatar/Stage', () => ({
  Stage: (p: { body: unknown; items: { slot: string }[]; scanned: boolean }) => (
    <div data-testid="stage" data-scanned={String(p.scanned)} data-slots={p.items.map((i) => i.slot).join(',')} data-body={JSON.stringify(p.body)} />
  ),
}))
vi.mock('./lib/measure', () => ({ measureBody: vi.fn() }))

const m = vi.mocked(api)
const SERVER_SCAN = { heightCm: 185, buildPct: 110, skinTone: 3, createdAt: '2026-09-01T10:00:00Z' }
const body = () => JSON.parse(screen.getByTestId('stage').dataset.body!)
const slots = () => screen.getByTestId('stage').dataset.slots!.split(',').filter(Boolean)

function signedIn(email = 'me@example.com') {
  localStorage.setItem('h2t-token', 'a.b.c')
  localStorage.setItem('h2t-email', email)
}
const renderApp = async () => {
  const user = userEvent.setup()
  render(<AuthProvider><App /></AuthProvider>)
  await screen.findByText('Silk Shirt')
  return user
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.outfit.mockImplementation(async (season, tier, seed) => outfit({ season, tier, seed }))
  m.getScan.mockResolvedValue(null)
  m.putScan.mockImplementation(async (s) => ({ ...s, createdAt: '2026-09-20T10:00:00Z' }))
  m.deleteScan.mockResolvedValue(null)
})

describe('outfit browsing', () => {
  it('loads a summer look for both tiers on first visit', async () => {
    await renderApp()
    expect(m.outfit).toHaveBeenCalledWith('summer', 'both', 0)
    expect(screen.getByText('Summer · Designer + Everyday')).toBeInTheDocument()
  })

  it('draws the visible pieces on the avatar, and only those', async () => {
    await renderApp()
    expect(slots()).toEqual(['hat', 'top', 'shoes']) // the skipped outer layer is not drawn
  })

  it.each([['Winter', 'winter'], ['Pool day', 'pool']])('asks for a %s look when chosen', async (label, season) => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(m.outfit).toHaveBeenLastCalledWith(season, 'both', 0))
  })

  it.each([['Designer', 'lux'], ['Everyday', 'std']])('asks for %s pieces when chosen', async (label, tier) => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(m.outfit).toHaveBeenLastCalledWith('summer', tier, 0))
  })

  it('shows which options are selected', async () => {
    const user = await renderApp()
    expect(screen.getByRole('button', { name: 'Summer' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Winter' }))
    expect(screen.getByRole('button', { name: 'Winter' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Summer' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Shuffle asks for the next seed each time', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Shuffle look' }))
    await waitFor(() => expect(m.outfit).toHaveBeenLastCalledWith('summer', 'both', 1))
    await user.click(screen.getByRole('button', { name: 'Shuffle look' }))
    await waitFor(() => expect(m.outfit).toHaveBeenLastCalledWith('summer', 'both', 2))
  })

  it('hiding a layer removes it from the avatar and the total, showing it again restores both', async () => {
    const user = await renderApp()
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide Shirt on the model' }))
    expect(slots()).toEqual(['hat', 'shoes'])
    expect(screen.getByText('$100')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Shirt on the model' }))
    expect(slots()).toEqual(['hat', 'top', 'shoes'])
  })

  it('changing the occasion resets hidden layers', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Hide Shirt on the model' }))
    await user.click(screen.getByRole('button', { name: 'Winter' }))
    await waitFor(() => expect(slots()).toEqual(['hat', 'top', 'shoes']))
  })

  it('shows a clear error when outfits cannot be loaded', async () => {
    m.outfit.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AuthProvider><App /></AuthProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to fetch.*Is the API running\?/)
  })

  it('does not let a slow old response overwrite a newer choice', async () => {
    let releaseSlow!: () => void
    m.outfit.mockImplementationOnce(() => new Promise((r) => (releaseSlow = () => r(outfit({ season: 'summer', items: [] })))))
    render(<AuthProvider><App /></AuthProvider>)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Winter' }))
    await screen.findByText('Silk Shirt') // the winter response arrived first
    releaseSlow() // now the stale summer one resolves
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText('Silk Shirt')).toBeInTheDocument()
  })
})

describe('body controls', () => {
  it('starts with the default body and the stand-in label', async () => {
    await renderApp()
    expect(body()).toEqual({ heightCm: 178, buildPct: 100, skinTone: 0 })
    expect(screen.getByTestId('stage').dataset.scanned).toBe('false')
  })

  it('sliders and skin tone update the avatar and offer to save', async () => {
    const user = await renderApp()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skin tone 3' }))
    expect(body().skinTone).toBe(2)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})

describe('guest scan (not signed in)', () => {
  it('restores a scan saved on this device', async () => {
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ heightCm: 170, buildPct: 95, skinTone: 1, savedAt: '2026-09-10T10:00:00Z' }))
    await renderApp()
    expect(body()).toEqual({ heightCm: 170, buildPct: 95, skinTone: 1 })
    expect(screen.getByText(/Your scan · saved Sep 10, 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeInTheDocument()
    expect(m.getScan).not.toHaveBeenCalled() // guests never call the account API
  })

  it('offers "Scan yourself" when there is no scan', async () => {
    await renderApp()
    expect(screen.getByRole('button', { name: 'Scan yourself' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete my scan' })).not.toBeInTheDocument()
  })

  it('saving tweaks stores them on this device and invites the user to create an account', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Skin tone 4' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(JSON.parse(localStorage.getItem('h2t-guest-scan')!)).toMatchObject({ skinTone: 3, heightCm: 178 })
    expect(m.putScan).not.toHaveBeenCalled()
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('deleting the scan asks first, then resets the avatar', async () => {
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ heightCm: 170, buildPct: 95, skinTone: 1, savedAt: '2026-09-10T10:00:00Z' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Delete my scan' }))
    expect(localStorage.getItem('h2t-guest-scan')).toBeNull()
    expect(body()).toEqual({ heightCm: 178, buildPct: 100, skinTone: 0 })
  })

  it('cancelling the delete confirmation keeps the scan', async () => {
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ heightCm: 170, buildPct: 95, skinTone: 1, savedAt: '2026-09-10T10:00:00Z' }))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Delete my scan' }))
    expect(localStorage.getItem('h2t-guest-scan')).not.toBeNull()
    expect(body().heightCm).toBe(170)
  })
})

describe('signed-in scan (saved on the server)', () => {
  it('loads the scan from the account on every visit', async () => {
    signedIn()
    m.getScan.mockResolvedValue(SERVER_SCAN)
    await renderApp()
    await waitFor(() => expect(body()).toEqual({ heightCm: 185, buildPct: 110, skinTone: 3 }))
    expect(screen.getByText(/saved Sep 1, 2026/)).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })

  it('uploads a scan made as a guest the first time the user signs in, then forgets the local copy', async () => {
    signedIn()
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ heightCm: 170, buildPct: 95, skinTone: 1, savedAt: '2026-09-10T10:00:00Z' }))
    m.getScan.mockResolvedValue(null)
    await renderApp()
    await waitFor(() => expect(m.putScan).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 170, buildPct: 95, skinTone: 1 })))
    expect(localStorage.getItem('h2t-guest-scan')).toBeNull()
  })

  it('an existing server scan wins over a local one', async () => {
    signedIn()
    localStorage.setItem('h2t-guest-scan', JSON.stringify({ heightCm: 150, buildPct: 90, skinTone: 0, savedAt: '2026-09-10T10:00:00Z' }))
    m.getScan.mockResolvedValue(SERVER_SCAN)
    await renderApp()
    await waitFor(() => expect(body().heightCm).toBe(185))
    expect(m.putScan).not.toHaveBeenCalled()
  })

  it('an expired session signs the user out instead of leaving a broken page', async () => {
    signedIn()
    m.getScan.mockRejectedValue(new ApiError(401, 'Unauthorized'))
    await renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument())
    expect(localStorage.getItem('h2t-token')).toBeNull()
  })

  it('saves tweaks to the account', async () => {
    signedIn()
    m.getScan.mockResolvedValue(SERVER_SCAN)
    const user = await renderApp()
    await waitFor(() => expect(body().skinTone).toBe(3))
    await user.click(screen.getByRole('button', { name: 'Skin tone 1' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(m.putScan).toHaveBeenCalledWith({ heightCm: 185, buildPct: 110, skinTone: 0 }))
  })

  it('deleting removes it from the account after confirmation', async () => {
    signedIn()
    m.getScan.mockResolvedValue(SERVER_SCAN)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Delete my scan' }))
    await waitFor(() => expect(m.deleteScan).toHaveBeenCalledTimes(1))
    expect(body()).toEqual({ heightCm: 178, buildPct: 100, skinTone: 0 })
  })

  it('does not delete anything when the user cancels', async () => {
    signedIn()
    m.getScan.mockResolvedValue(SERVER_SCAN)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = await renderApp()
    await user.click(await screen.findByRole('button', { name: 'Delete my scan' }))
    expect(m.deleteScan).not.toHaveBeenCalled()
  })

  it('signing out returns to the guest experience', async () => {
    signedIn()
    m.getScan.mockResolvedValue(SERVER_SCAN)
    const user = await renderApp()
    await waitFor(() => expect(body().heightCm).toBe(185))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(body()).toEqual({ heightCm: 178, buildPct: 100, skinTone: 0 }))
    expect(localStorage.getItem('h2t-token')).toBeNull()
  })
})

describe('dialogs', () => {
  it('opens sign in and the scan flow, and closes them again', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Scan yourself' }))
    expect(within(screen.getByRole('dialog')).getByText('Step 1 of 4')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
