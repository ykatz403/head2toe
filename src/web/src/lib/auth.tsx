import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStore } from './api'

const EMAIL_KEY = 'h2t-email'
const readEmail = () => {
  try {
    return tokenStore.get() ? localStorage.getItem(EMAIL_KEY) : null
  } catch {
    return null
  }
}

interface AuthState {
  email: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(readEmail)

  const finish = useCallback((r: { token: string; email: string }) => {
    tokenStore.set(r.token)
    try {
      localStorage.setItem(EMAIL_KEY, r.email)
    } catch {
      /* ignore */
    }
    setEmail(r.email)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      email,
      signIn: async (e, p) => finish(await api.login(e, p)),
      signUp: async (e, p) => finish(await api.register(e, p)),
      signOut: () => {
        tokenStore.set(null)
        setEmail(null)
      },
    }),
    [email, finish],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
