import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '../lib/measure'
import { ScanModal } from './ScanModal'

// A plain function (not vi.fn) so rejected promises are not double-tracked by the spy.
const m = vi.hoisted(() => ({ impl: (async () => ({})) as (...a: unknown[]) => Promise<unknown>, calls: [] as unknown[][] }))
vi.mock('../lib/measure', () => ({ measureBody: (...a: unknown[]) => (m.calls.push(a), m.impl(...a)) }))
const resolves = (v: Measurement) => { m.impl = async () => v }
const rejects = (e: Error) => { m.impl = () => Promise.reject(e) }

const photo = (name: string) => new File(['x'], name, { type: 'image/png' })
const scanError = (msg: string) => Object.assign(new Error(msg), { name: 'ScanError' })

function setup(over: { onSave?: () => Promise<void> } = {}) {
  const onSave = vi.fn(over.onSave ?? (async () => {}))
  const onClose = vi.fn()
  const user = userEvent.setup()
  const utils = render(<ScanModal initialHeight={178} onSave={onSave} onClose={onClose} />)
  const upload = (id: string, file = photo('a.png')) => fireEvent.change(utils.container.querySelector(`#${id}`)!, { target: { files: [file] } })
  return { ...utils, user, onSave, onClose, upload }
}

async function toFrontPhoto(t: ReturnType<typeof setup>) {
  await t.user.click(screen.getByRole('checkbox'))
  await t.user.click(screen.getByRole('button', { name: 'Start' }))
}
async function toBuild(t: ReturnType<typeof setup>) {
  await toFrontPhoto(t)
  t.upload('p-front')
  await t.user.click(screen.getByRole('button', { name: 'Next' }))
  t.upload('p-side')
  await t.user.click(screen.getByRole('button', { name: 'Build my avatar' }))
}

beforeEach(() => { m.calls.length = 0; m.impl = async () => ({}) })

describe('ScanModal setup step', () => {
  it('starts at step 1 with the privacy promise visible', () => {
    setup()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
  })

  it('cannot start without consent', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('can start once consent is given and the numbers are sensible', async () => {
    const t = setup()
    await t.user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it.each([['119'], ['221'], ['']])('blocks a height of "%s" even with consent', async (h) => {
    const t = setup()
    await t.user.click(screen.getByRole('checkbox'))
    await t.user.clear(screen.getByLabelText('Height (cm)'))
    if (h) await t.user.type(screen.getByLabelText('Height (cm)'), h)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it.each([['34'], ['201']])('blocks a weight of %s kg', async (w) => {
    const t = setup()
    await t.user.click(screen.getByRole('checkbox'))
    await t.user.clear(screen.getByLabelText('Weight (kg)'))
    await t.user.type(screen.getByLabelText('Weight (kg)'), w)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('pre-fills the height from the avatar', () => {
    setup()
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(178)
  })
})

describe('ScanModal photo steps', () => {
  it('needs a front photo before Next, and shows a preview', async () => {
    const t = setup()
    await toFrontPhoto(t)
    expect(screen.getByRole('heading', { name: 'Front photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    t.upload('p-front')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(screen.getByAltText('front photo preview')).toBeInTheDocument()
  })

  it('needs a side photo before building', async () => {
    const t = setup()
    await toFrontPhoto(t)
    t.upload('p-front')
    await t.user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Side photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build my avatar' })).toBeDisabled()
  })

  it('Back goes to the previous step and keeps the photo', async () => {
    const t = setup()
    await toFrontPhoto(t)
    t.upload('p-front')
    await t.user.click(screen.getByRole('button', { name: 'Next' }))
    await t.user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Front photo' })).toBeInTheDocument()
    expect(screen.getByAltText('front photo preview')).toBeInTheDocument()
  })

  it('replacing a photo frees the old preview', async () => {
    const t = setup()
    await toFrontPhoto(t)
    t.upload('p-front', photo('1.png'))
    t.upload('p-front', photo('2.png'))
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})

describe('ScanModal building the avatar', () => {
  it('measures with the entered height and weight and shows the result', async () => {
    resolves({ buildPct: 108, shoulderCm: 42, hipCm: 23, usedPhotos: true })
    const t = setup()
    await toBuild(t)
    expect(await screen.findByRole('heading', { name: 'Your avatar is ready' }, { timeout: 4000 })).toBeInTheDocument()
    expect(m.calls).toHaveLength(1)
    expect(m.calls[0].slice(2)).toEqual([178, 75])
    expect(m.calls[0][0]).toBeInstanceOf(File)
    expect(screen.getByText('108%')).toBeInTheDocument()
    expect(screen.getByText('~42 cm')).toBeInTheDocument()
    expect(screen.getByText(/photos, which have now been discarded/i)).toBeInTheDocument()
  })

  it('discards both photos once measured', async () => {
    resolves({ buildPct: 100, shoulderCm: 40, hipCm: 22, usedPhotos: true })
    const t = setup()
    await toBuild(t)
    await screen.findByRole('heading', { name: 'Your avatar is ready' }, { timeout: 4000 })
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('saves only the measurements, then closes', async () => {
    resolves({ buildPct: 108, shoulderCm: 42, hipCm: 23, usedPhotos: true })
    const t = setup()
    await toBuild(t)
    await t.user.click(await screen.findByRole('button', { name: /save and see my avatar/i }, { timeout: 4000 }))
    await waitFor(() => expect(t.onClose).toHaveBeenCalled())
    expect(t.onSave).toHaveBeenCalledWith({ heightCm: 178, buildPct: 108 })
  })

  it('is honest when photo analysis was not possible', async () => {
    resolves({ buildPct: 100, shoulderCm: null, hipCm: null, usedPhotos: false })
    const t = setup()
    await toBuild(t)
    expect(await screen.findByText(/estimated from height and weight/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText(/Shoulders/)).not.toBeInTheDocument()
  })

  it('sends the user back to retake photos when no person is found, with the reason', async () => {
    rejects(scanError("We couldn't find a person in your front photo."))
    const t = setup()
    await toBuild(t)
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent("couldn't find a person in your front photo")
    expect(screen.getByRole('heading', { name: 'Front photo' })).toBeInTheDocument()
  })

  it('shows a generic message for unexpected failures, without leaking details', async () => {
    rejects(new Error('WASM exploded at 0xdeadbeef'))
    const t = setup()
    await toBuild(t)
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent('The scan failed. Check your photos and try again.')
    expect(alert).not.toHaveTextContent('deadbeef')
  })

  it('stays open and explains when saving fails', async () => {
    resolves({ buildPct: 100, shoulderCm: 40, hipCm: 22, usedPhotos: true })
    const t = setup({ onSave: async () => { throw new Error('Could not reach the server.') } })
    await toBuild(t)
    await t.user.click(await screen.findByRole('button', { name: /save and see my avatar/i }, { timeout: 4000 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    expect(t.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save and see my avatar/i })).toBeEnabled() // can retry
  })
})

describe('ScanModal closing', () => {
  it('closes with Escape', async () => {
    const t = setup()
    await t.user.keyboard('{Escape}')
    expect(t.onClose).toHaveBeenCalled()
  })
  it('closes with the close button and discards photos', async () => {
    const t = setup()
    await toFrontPhoto(t)
    t.upload('p-front')
    await t.user.click(screen.getByRole('button', { name: 'Close scan' }))
    expect(t.onClose).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
})
