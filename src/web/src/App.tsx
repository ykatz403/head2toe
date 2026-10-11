import { useState } from 'react'
import { AuthModal } from './components/AuthModal'
import { PhotoTryOn } from './components/PhotoTryOn'
import { useAuth } from './lib/auth'

export default function App() {
  const { email, signOut } = useAuth()
  const [sideEl, setSideEl] = useState<HTMLDivElement | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">Head2<span>Toe</span></div>
        <div className="acct">
          {email ? (
            <>
              <span className="fine">{email}</span>
              <button className="btn sm" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="btn sm" type="button" onClick={() => setAuthOpen(true)}>Sign in</button>
          )}
        </div>
      </header>

      <div className="hero">
        <h1>See yourself wearing it before you buy.</h1>
        <p>Describe what you're looking for, upload a photo of yourself, and see a real AI-generated preview.</p>
      </div>

      <div className="studio">
        <div>
          <PhotoTryOn sidePanelSlot={sideEl} />
        </div>
        <div ref={setSideEl} />
      </div>

      <footer>
        Head2Toe is an early product. Brand names are examples of retailers we link to, with no affiliation or endorsement. Prices are illustrative.
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
