import { useCallback, useEffect, useRef, useState } from 'react'
import type { LookItem } from '../avatar/scene'
import type { Analysis } from '../lib/tryon'
import { photoStore } from '../lib/photoStore'

type Status = 'loading' | 'empty' | 'ready'
type TryOnModule = typeof import('../lib/tryon')

interface Props {
  items: LookItem[]
}

export function PhotoTryOn({ items }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [original, setOriginal] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const analysis = useRef<Analysis | null>(null)
  const mod = useRef<TryOnModule | null>(null)
  const [version, setVersion] = useState(0) // bumps when a new photo is analysed, to repaint

  // The pose model is large, so it is only fetched once someone actually has a photo.
  const load = useCallback(async (blob: Blob, save: boolean) => {
    setStatus('loading')
    setError('')
    try {
      mod.current ??= await import('../lib/tryon')
      analysis.current = await mod.current.analyzePhoto(blob)
      if (save) await photoStore.set(blob)
      setVersion((v) => v + 1)
      setStatus('ready')
    } catch (e) {
      analysis.current = null
      setError(e instanceof Error && e.name === 'ScanError' ? e.message : "We couldn't process that photo. Try a different one.")
      setStatus('empty')
    }
  }, [])

  useEffect(() => {
    let stale = false
    photoStore.get().then((blob) => {
      if (stale) return
      if (blob) void load(blob, false)
      else setStatus('empty')
    })
    return () => {
      stale = true
    }
  }, [load])

  useEffect(() => {
    if (status === 'ready' && analysis.current && mod.current && canvas.current)
      mod.current.renderTryOn(analysis.current, canvas.current, items, original)
  }, [status, items, original, version])

  const choose = (file: File | undefined) => {
    if (file) void load(file, true)
  }
  const remove = async () => {
    await photoStore.clear()
    analysis.current = null
    setOriginal(false)
    setStatus('empty')
  }
  const download = () => {
    canvas.current?.toBlob((b) => {
      if (!b) return
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = 'head2toe-look.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const input = (
    <input
      id="try-photo"
      ref={fileInput}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }}
    />
  )
  const openPicker = () => fileInput.current?.click()

  return (
    <div>
      <div className="photo-stage">
        {status === 'loading' && <p className="fine" role="status">Finding you in the photo…</p>}

        {status === 'empty' && (
          <div className="upload">
            <h3>Put the outfit on your photo</h3>
            <ul className="tips">
              <li>A full-length photo: head to feet, standing, facing the camera.</li>
              <li>Arms slightly away from your body, plain background, good light.</li>
              <li>Fitted clothes work best. Loose clothes can show around the edges.</li>
            </ul>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="btn primary" type="button" onClick={openPicker}>Choose a photo</button>
            <p className="fine">Your photo stays on this device. It is analysed in your browser and never uploaded.</p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <canvas ref={canvas} className="try-canvas" aria-label={original ? 'Your original photo' : 'Your photo wearing the outfit'} />
            <div className="photo-bar">
              <button className="btn sm" type="button" aria-pressed={original} onClick={() => setOriginal((o) => !o)}>
                {original ? 'Show outfit' : 'Show original'}
              </button>
              <button className="btn sm" type="button" onClick={download}>Save image</button>
              <button className="btn sm" type="button" onClick={openPicker}>Change photo</button>
              <button className="btn sm" type="button" onClick={remove}>Remove photo</button>
            </div>
          </>
        )}
      </div>
      {input}
      <p className="fine" style={{ marginTop: 10 }}>
        Preview: the clothes are placed using body detection and shaded from your photo, so it is an approximation, not a photo-real fitting.
        Layers hidden under others (undershirts, underwear) aren't drawn.
      </p>
    </div>
  )
}
