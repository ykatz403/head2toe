import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, tokenStore } from './api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: url as string, init: init as RequestInit, headers: new Headers((init as RequestInit).headers) }
}

describe('api client', () => {
  it('sends no Authorization header when signed out', async () => {
    fetchMock.mockResolvedValue(json({ season: 'summer' }))
    await api.outfit('summer', 'both', 0)
    expect(lastCall().headers.has('Authorization')).toBe(false)
  })

  it('sends the saved token as a Bearer header', async () => {
    tokenStore.set('abc.def.ghi')
    fetchMock.mockResolvedValue(json({}))
    await api.getScan()
    expect(lastCall().headers.get('Authorization')).toBe('Bearer abc.def.ghi')
  })

  it('builds the outfit URL from its arguments', async () => {
    fetchMock.mockResolvedValue(json({}))
    await api.outfit('winter', 'lux', 7)
    expect(lastCall().url).toBe('/api/outfit?season=winter&tier=lux&seed=7')
  })

  it('treats 204 as "nothing there" (no scan yet)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await api.getScan()).toBeNull()
  })

  it('sends JSON bodies with the right method and content type', async () => {
    fetchMock.mockResolvedValue(json({ heightCm: 176, buildPct: 104, skinTone: 2, createdAt: 'x' }))
    await api.putScan({ heightCm: 176, buildPct: 104, skinTone: 2 })
    const { init, headers } = lastCall()
    expect(init.method).toBe('PUT')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ heightCm: 176, buildPct: 104, skinTone: 2 })
  })

  it('uses DELETE for removing a scan', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await api.deleteScan()
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('surfaces the server error message and status', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Email or password is incorrect.' }, 401))
    const err = await api.login('a@b.com', 'x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('Email or password is incorrect.')
  })

  it('falls back to a friendly message when the error is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const err = await api.outfit('summer', 'both', 0).catch((e) => e)
    expect(err.status).toBe(502)
    expect(err.message).toBe('Something went wrong. Try again.')
  })

  it('lets network failures propagate so the UI can show an error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.outfit('summer', 'both', 0)).rejects.toThrow('Failed to fetch')
  })
})

describe('tokenStore', () => {
  it('stores and clears the token', () => {
    tokenStore.set('t')
    expect(tokenStore.get()).toBe('t')
    tokenStore.set(null)
    expect(tokenStore.get()).toBeNull()
  })
})
