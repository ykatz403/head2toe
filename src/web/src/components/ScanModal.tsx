import { useCallback, useState } from 'react'
import type { Measurement } from '../lib/measure'
import { useModal } from '../lib/useModal'

interface Props {
  initialHeight: number
  onSave: (m: { heightCm: number; buildPct: number }) => Promise<void>
  onClose: () => void
}

type Step = 1 | 2 | 3 | 4

/** A photo the user picked, with a preview URL that is revoked as soon as it is no longer needed. */
interface Photo {
  file: File
  url: string
}

export function ScanModal({ initialHeight, onSave, onClose }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [height, setHeight] = useState(String(initialHeight))
  const [weight, setWeight] = useState('75')
  const [consent, setConsent] = useState(false)
  const [front, setFront] = useState<Photo | null>(null)
  const [side, setSide] = useState<Photo | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Measurement | null>(null)
  const [saving, setSaving] = useState(false)

  const h = Number(height)
  const w = Number(weight)
  const validBody = h >= 120 && h <= 220 && w >= 35 && w <= 200

  const discard = useCallback(() => {
    setFront((p) => (p && URL.revokeObjectURL(p.url), null))
    setSide((p) => (p && URL.revokeObjectURL(p.url), null))
  }, [])

  const close = useCallback(() => {
    discard()
    onClose()
  }, [discard, onClose])

  const sheet = useModal<HTMLDivElement>(close, `${step}-${result ? 'done' : 'busy'}`)

  const pick = (which: 'front' | 'side', file: File | undefined) => {
    if (!file) return
    const photo = { file, url: URL.createObjectURL(file) }
    const set = which === 'front' ? setFront : setSide
    set((old) => (old && URL.revokeObjectURL(old.url), photo))
    setError('')
  }

  const build = async () => {
    if (!front || !side) return
    setStep(4)
    setError('')
    setResult(null)
    try {
      // The pose model is large, so it is only fetched when someone actually scans.
      const { measureBody } = await import('../lib/measure')
      const [m] = await Promise.all([measureBody(front.file, side.file, h, w), new Promise((r) => setTimeout(r, 1400))])
      discard()
      setResult(m)
    } catch (e) {
      setStep(2)
      setError(e instanceof Error && e.name === 'ScanError' ? e.message : 'The scan failed. Check your photos and try again.')
    }
  }

  const finish = async () => {
    if (!result) return
    setSaving(true)
    try {
      await onSave({ heightCm: h, buildPct: result.buildPct })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your scan. Try again.')
      setSaving(false)
    }
  }

  const photoStep = (which: 'front' | 'side', title: string, hint: string, photo: Photo | null, next: () => void, back: () => void, nextLabel: string) => (
    <div className="step">
      <h3>{title}</h3>
      <p className="fine">{hint}</p>
      {error && <p className="err" role="alert">{error}</p>}
      <label className="drop" htmlFor={`p-${which}`}>
        {photo ? <img src={photo.url} alt={`${which} photo preview`} /> : <span>Take or choose a photo</span>}
      </label>
      <input id={`p-${which}`} type="file" accept="image/*" hidden onChange={(e) => pick(which, e.target.files?.[0])} />
      <div className="actions">
        <button className="btn" type="button" onClick={back}>Back</button>
        <button className="btn primary" type="button" disabled={!photo} onClick={next}>{nextLabel}</button>
      </div>
    </div>
  )

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="scan-t" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" ref={sheet}>
        <div className="sheet-head">
          <span className="eyebrow">Step {step} of 4</span>
          <button className="btn sm" type="button" onClick={close} aria-label="Close scan">✕</button>
        </div>

        {step === 1 && (
          <div className="step">
            <h3 id="scan-t">Set up your one-time scan</h3>
            <ul className="tips">
              <li>Wear fitted clothes, or underwear if you're comfortable.</li>
              <li>Stand about 2 m (6 ft) from your phone, propped up or held by a friend.</li>
              <li>Plain wall behind you, good light, whole body in frame, feet included.</li>
            </ul>
            <div className="two">
              <div className="slider">
                <label htmlFor="s-h">Height (cm)</label>
                <input id="s-h" className="num" type="number" min={120} max={220} inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div className="slider">
                <label htmlFor="s-w">Weight (kg)</label>
                <input id="s-w" className="num" type="number" min={35} max={200} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree my photos are analysed once, on this device, to build my avatar. They are never uploaded and are discarded straight after. Only my measurements are saved.</span>
            </label>
            <div className="actions">
              <button className="btn primary" type="button" disabled={!consent || !validBody} onClick={() => setStep(2)}>Start</button>
            </div>
          </div>
        )}

        {step === 2 && photoStep('front', 'Front photo', 'Stand straight, arms slightly away from your sides, facing the camera.', front, () => setStep(3), () => setStep(1), 'Next')}
        {step === 3 && photoStep('side', 'Side photo', 'Turn 90 degrees, arms relaxed at your sides, same distance from the camera.', side, build, () => setStep(2), 'Build my avatar')}

        {step === 4 && (
          <div className="step">
            <h3>{result ? 'Your avatar is ready' : 'Building your avatar'}</h3>
            {!result ? (
              <p className="fine" role="status">Finding your body outline and measuring your proportions…</p>
            ) : (
              <>
                <dl className="facts">
                  <div><dt>Height</dt><dd>{h} cm</dd></div>
                  <div><dt>Build</dt><dd>{result.buildPct}%</dd></div>
                  {result.shoulderCm != null && <div><dt>Shoulders</dt><dd>~{result.shoulderCm} cm</dd></div>}
                  {result.hipCm != null && <div><dt>Hips</dt><dd>~{result.hipCm} cm</dd></div>}
                </dl>
                <p className="fine">
                  {result.usedPhotos
                    ? 'Measured from your photos, which have now been discarded. Only these measurements are saved. Estimates are approximate: you can fine-tune height, build and skin tone on the next screen.'
                    : "We couldn't run the photo analysis in this browser, so your avatar is estimated from height and weight. You can fine-tune it on the next screen."}
                </p>
                {error && <p className="err" role="alert">{error}</p>}
                <div className="actions">
                  <button className="btn primary" type="button" disabled={saving} onClick={finish}>Save and see my avatar</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
