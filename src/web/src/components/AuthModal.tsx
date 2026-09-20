import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { useModal } from '../lib/useModal'

interface Props {
  onClose: () => void
}

export function AuthModal({ onClose }: Props) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sheet = useModal<HTMLFormElement>(onClose, mode)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await (mode === 'up' ? signUp : signIn)(email, password)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-t" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" ref={sheet} onSubmit={submit}>
        <div className="sheet-head">
          <span className="eyebrow">{mode === 'up' ? 'Create account' : 'Sign in'}</span>
          <button className="btn sm" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="step">
        <h3 id="auth-t">{mode === 'up' ? 'Keep your scan for good' : 'Welcome back'}</h3>
        <p className="fine">
          {mode === 'up'
            ? 'Your body scan is saved to your account, so you scan once and use it on every device.'
            : 'Sign in to load your saved scan.'}
        </p>
        <div className="slider">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" className="num" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="slider">
          <label htmlFor="auth-pw">Password</label>
          <input id="auth-pw" className="num" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError('') }}>
            {mode === 'up' ? 'I have an account' : 'Create an account'}
          </button>
          <button className="btn primary" type="submit" disabled={busy}>{mode === 'up' ? 'Create account' : 'Sign in'}</button>
        </div>
        </div>
      </form>
    </div>
  )
}
