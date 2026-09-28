export interface Product {
  id: number
  slot: string
  brand: string
  name: string
  price: number
  color: string
  tier: 'lux' | 'std'
  attrs: Record<string, unknown>
  shopUrl: string
}
export interface OutfitItem {
  slot: string
  label: string
  product: Product | null
  note: string | null
}
export interface Outfit {
  season: string
  tier: string
  seed: number
  total: number
  items: OutfitItem[]
}
export interface Scan {
  heightCm: number
  buildPct: number
  skinTone: number
  createdAt: string
}
interface AuthResponse {
  token: string
  email: string
}
export interface TryOnResult {
  imageUrl: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'h2t-token'
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable: the session just won't persist */
    }
  },
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, { ...init, headers })
  if (res.status === 204) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? 'Something went wrong. Try again.')
  }
  return res.json() as Promise<T>
}

export const api = {
  register: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<AuthResponse>,
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<AuthResponse>,
  getScan: () => request<Scan>('/api/scan'),
  putScan: (s: Omit<Scan, 'createdAt'>) => request<Scan>('/api/scan', { method: 'PUT', body: JSON.stringify(s) }) as Promise<Scan>,
  deleteScan: () => request<null>('/api/scan', { method: 'DELETE' }),
  outfit: (season: string, tier: string, seed: number) =>
    request<Outfit>(`/api/outfit?season=${season}&tier=${tier}&seed=${seed}`) as Promise<Outfit>,
  tryOnStatus: () => request<{ configured: boolean }>('/api/tryon/status') as Promise<{ configured: boolean }>,
  tryOn: (humanImage: string, garmentImage: string, garmentDescription: string, category: string) =>
    request<TryOnResult>('/api/tryon', {
      method: 'POST',
      body: JSON.stringify({ humanImage, garmentImage, garmentDescription, category }),
    }) as Promise<TryOnResult>,
}
