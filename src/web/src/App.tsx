import { useCallback, useEffect, useMemo, useState } from 'react'
import { Stage } from './avatar/Stage'
import { SKIN_TONES, type BodyShape } from './avatar/scene'
import { AuthModal } from './components/AuthModal'
import { OutfitPanel } from './components/OutfitPanel'
import { ScanModal } from './components/ScanModal'
import { api, ApiError, type Outfit } from './lib/api'
import { useAuth } from './lib/auth'
import { DEFAULT_BODY, formatDate, guestScan, type SavedBody } from './lib/body'

const SEASONS = [['summer', 'Summer'], ['winter', 'Winter'], ['pool', 'Pool day']] as const
const TIERS = [['lux', 'Designer'], ['std', 'Everyday'], ['both', 'Both']] as const
const TIER_NAME: Record<string, string> = { lux: 'Designer', std: 'Everyday', both: 'Designer + Everyday' }
const SEASON_NAME: Record<string, string> = { summer: 'Summer', winter: 'Winter', pool: 'Pool day' }

const toBody = (s: SavedBody | null): BodyShape =>
  s ? { heightCm: s.heightCm, buildPct: s.buildPct, skinTone: s.skinTone } : DEFAULT_BODY

export default function App() {
  const { email, signOut } = useAuth()
  const [season, setSeason] = useState('summer')
  const [tier, setTier] = useState('both')
  const [seed, setSeed] = useState(0)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loadError, setLoadError] = useState('')
  const [body, setBody] = useState<BodyShape>(DEFAULT_BODY)
  const [saved, setSaved] = useState<SavedBody | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [notice, setNotice] = useState('')

  // ---- outfit ----
  useEffect(() => {
    let stale = false
    setLoadError('')
    api.outfit(season, tier, seed).then(
      (o) => !stale && setOutfit(o),
      (e) => !stale && setLoadError(e instanceof Error ? e.message : 'Could not load outfits.'),
    )
    return () => {
      stale = true
    }
  }, [season, tier, seed])

  const items = useMemo(
    () => (outfit?.items ?? []).filter((i) => i.product && !hidden.has(i.slot)).map((i) => ({ slot: i.slot, color: i.product!.color, attrs: i.product!.attrs })),
    [outfit, hidden],
  )

  // ---- saved scan: on the server when signed in, on this device when not ----
  const apply = useCallback((s: SavedBody | null) => {
    setSaved(s)
    setBody(toBody(s))
  }, [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      if (!email) return apply(guestScan.get())
      try {
        let s = await api.getScan()
        if (!s) {
          const g = guestScan.get()
          if (g) {
            s = await api.putScan(g)
            guestScan.clear()
          }
        }
        if (!stale) apply(s ? { ...s, savedAt: s.createdAt } : null)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signOut()
      }
    })()
    return () => {
      stale = true
    }
  }, [email, apply, signOut])

  const persist = async (b: BodyShape) => {
    if (email) {
      const s = await api.putScan(b)
      apply({ ...s, savedAt: s.createdAt })
    } else {
      const s: SavedBody = { ...b, savedAt: new Date().toISOString() }
      guestScan.set(s)
      apply(s)
      setNotice('Saved on this device. Create a free account to keep it on every device.')
    }
  }

  const removeScan = async () => {
    if (!window.confirm('Delete your saved scan? You can scan again any time.')) return
    if (email) await api.deleteScan()
    guestScan.clear()
    apply(null)
    setNotice('')
  }

  const dirty = JSON.stringify(body) !== JSON.stringify(toBody(saved))
  const pickSeason = (v: string) => {
    setSeason(v)
    setHidden(new Set())
  }
  const pickTier = (v: string) => {
    setTier(v)
    setHidden(new Set())
  }
  const toggle = (slot: string) =>
    setHidden((h) => {
      const n = new Set(h)
      if (!n.delete(slot)) n.add(slot)
      return n
    })

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
        <h1>See the whole outfit on your own body before you buy a thing.</h1>
        <p>Pick the occasion, scan yourself once at home, and shop every piece, from Uniqlo to Gucci, from the side panel.</p>
      </div>

      <div className="toolbar">
        <div className="field"><span>1 · What's the occasion?</span>
          <div className="seg" role="group" aria-label="Season">
            {SEASONS.map(([v, l]) => <button key={v} type="button" aria-pressed={season === v} onClick={() => pickSeason(v)}>{l}</button>)}
          </div></div>
        <div className="field"><span>2 · Where do you shop?</span>
          <div className="seg" role="group" aria-label="Store level">
            {TIERS.map(([v, l]) => <button key={v} type="button" aria-pressed={tier === v} onClick={() => pickTier(v)}>{l}</button>)}
          </div></div>
        <button className="btn primary" type="button" onClick={() => { setSeed((s) => s + 1); setHidden(new Set()) }}>Shuffle look</button>
      </div>

      {loadError && <p className="err" role="alert">{loadError} Is the API running?</p>}

      <div className="studio">
        <div>
          <Stage body={body} items={items} scanned={!!saved} />
          <div className="body-row">
            <div className="slider">
              <label htmlFor="height">Height <b>{body.heightCm} cm</b></label>
              <input id="height" type="range" min={155} max={200} value={Math.min(200, Math.max(155, body.heightCm))} onChange={(e) => setBody({ ...body, heightCm: +e.target.value })} />
            </div>
            <div className="slider">
              <label htmlFor="build">Build <b>{body.buildPct}%</b></label>
              <input id="build" type="range" min={85} max={125} value={body.buildPct} onChange={(e) => setBody({ ...body, buildPct: +e.target.value })} />
            </div>
            <div className="field"><span>Skin tone</span>
              <div className="tones" role="group" aria-label="Skin tone">
                {SKIN_TONES.map((c, i) => (
                  <button key={c} type="button" style={{ background: c }} aria-label={`Skin tone ${i + 1}`} aria-pressed={body.skinTone === i} onClick={() => setBody({ ...body, skinTone: i })} />
                ))}
              </div></div>
          </div>
          <div className="body-row">
            <button className="btn primary" type="button" onClick={() => setScanOpen(true)}>{saved ? 'Re-scan' : 'Scan yourself'}</button>
            {dirty && <button className="btn" type="button" onClick={() => persist(body)}>Save changes</button>}
            {saved && <span className="badge ok">Your scan · saved {formatDate(saved.savedAt)}</span>}
            {saved && <button className="btn" type="button" onClick={removeScan}>Delete my scan</button>}
          </div>
          <p className="fine" style={{ marginTop: 10 }}>
            {notice || 'One scan at home, done once. Your photos are analysed on your device and never uploaded.'}
            {notice && !email && <> <button className="link" type="button" onClick={() => setAuthOpen(true)}>Create account</button></>}
          </p>
        </div>

        <OutfitPanel outfit={outfit} hidden={hidden} onToggle={toggle} title={`${SEASON_NAME[season]} · ${TIER_NAME[tier]}`} />
      </div>

      <footer>
        Head2Toe is an early product. Brand names are examples of retailers we link to, with no affiliation or endorsement. Prices are illustrative.
      </footer>

      {scanOpen && (
        <ScanModal
          initialHeight={body.heightCm}
          onClose={() => setScanOpen(false)}
          onSave={async (m) => {
            await persist({ ...m, skinTone: body.skinTone })
          }}
        />
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
