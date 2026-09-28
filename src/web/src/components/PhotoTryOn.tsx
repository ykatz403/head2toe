import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { toDataUri } from '../lib/imageResize'
import { photoStore } from '../lib/photoStore'

type PersonStatus = 'loading' | 'empty' | 'ready'
const CATEGORIES = [['upper_body', 'Top (shirt, sweater, jacket)'], ['lower_body', 'Bottoms (pants, shorts, skirt)'], ['dresses', 'Dress']] as const

export function PhotoTryOn() {
  const [personStatus, setPersonStatus] = useState<PersonStatus>('loading')
  const [personUrl, setPersonUrl] = useState<string | null>(null)
  const personFile = useRef<Blob | null>(null)

  const [garmentUrl, setGarmentUrl] = useState<string | null>(null)
  const garmentFile = useRef<File | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0][0])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const personInput = useRef<HTMLInputElement>(null)
  const garmentInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let stale = false
    photoStore.get().then((blob) => {
      if (stale) return
      if (blob) {
        personFile.current = blob
        setPersonUrl(URL.createObjectURL(blob))
        setPersonStatus('ready')
      } else {
        setPersonStatus('empty')
      }
    })
    api.tryOnStatus().then((s) => !stale && setConfigured(s.configured), () => {})
    return () => {
      stale = true
    }
  }, [])

  const choosePerson = async (file: File | undefined) => {
    if (!file) return
    personFile.current = file
    setPersonUrl((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(file)))
    setPersonStatus('ready')
    setResultUrl(null)
    setError('')
    await photoStore.set(file)
  }
  const removePerson = async () => {
    await photoStore.clear()
    setPersonUrl((old) => (old && URL.revokeObjectURL(old), null))
    personFile.current = null
    setResultUrl(null)
    setPersonStatus('empty')
  }
  const chooseGarment = (file: File | undefined) => {
    if (!file) return
    garmentFile.current = file
    setGarmentUrl((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(file)))
    setResultUrl(null)
    setError('')
  }
  const removeGarment = () => {
    setGarmentUrl((old) => (old && URL.revokeObjectURL(old), null))
    garmentFile.current = null
    setResultUrl(null)
  }

  const generate = async () => {
    if (!personFile.current || !garmentFile.current) return
    setBusy(true)
    setError('')
    setResultUrl(null)
    try {
      const [humanImage, garmentImage] = await Promise.all([toDataUri(personFile.current), toDataUri(garmentFile.current)])
      const res = await api.tryOn(humanImage, garmentImage, description, category)
      setResultUrl(res.imageUrl)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong generating that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = 'head2toe-tryon.png'
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  const personInputEl = <input id="tryon-person" ref={personInput} type="file" accept="image/*" hidden onChange={(e) => { void choosePerson(e.target.files?.[0]); e.target.value = '' }} />
  const garmentInputEl = <input id="tryon-garment" ref={garmentInput} type="file" accept="image/*" hidden onChange={(e) => { chooseGarment(e.target.files?.[0]); e.target.value = '' }} />

  return (
    <div className="tryon">
      {configured === false && (
        <p className="err" role="alert">
          Try-on isn't configured on this server yet (no FASHN API token set). Ask whoever runs this deployment to add one.
        </p>
      )}

      <div className="tryon-grid">
        <div className="tryon-col">
          <span className="eyebrow">1 · Your photo</span>
          <div className="photo-stage small">
            {personStatus === 'loading' && <p className="fine" role="status">Loading…</p>}
            {personStatus === 'empty' && (
              <div className="upload">
                <p className="fine">A full-length photo: head to feet, facing the camera, plain background if possible.</p>
                <button className="btn primary" type="button" onClick={() => personInput.current?.click()}>Choose your photo</button>
              </div>
            )}
            {personStatus === 'ready' && personUrl && (
              <>
                <img className="tryon-img" src={personUrl} alt="You" />
                <div className="photo-bar">
                  <button className="btn sm" type="button" onClick={() => personInput.current?.click()}>Change</button>
                  <button className="btn sm" type="button" onClick={() => void removePerson()}>Remove</button>
                </div>
              </>
            )}
          </div>
          <p className="fine">Kept on this device between visits. Only sent to the try-on service when you click Generate below.</p>
        </div>

        <div className="tryon-col">
          <span className="eyebrow">2 · The garment</span>
          <div className="photo-stage small">
            {!garmentUrl ? (
              <div className="upload">
                <p className="fine">A clear product photo of one item: a shirt, a pair of pants, a dress. Flat-lay or on a mannequin works best.</p>
                <button className="btn primary" type="button" onClick={() => garmentInput.current?.click()}>Choose a garment photo</button>
              </div>
            ) : (
              <>
                <img className="tryon-img" src={garmentUrl} alt="Garment" />
                <div className="photo-bar">
                  <button className="btn sm" type="button" onClick={() => garmentInput.current?.click()}>Change</button>
                  <button className="btn sm" type="button" onClick={removeGarment}>Remove</button>
                </div>
              </>
            )}
          </div>
          <div className="tryon-fields">
            <div className="slider">
              <label htmlFor="garment-desc">Description</label>
              <input id="garment-desc" className="num" type="text" placeholder="e.g. Short sleeve round neck t-shirt" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="slider">
              <label htmlFor="garment-cat">Type</label>
              <select id="garment-cat" className="num" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {personInputEl}
      {garmentInputEl}

      <div className="tryon-actions">
        <button className="btn primary" type="button" disabled={busy || !personUrl || !garmentUrl || configured === false} onClick={() => void generate()}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
        {busy && <p className="fine" role="status">This calls a real AI model and usually takes 10–20 seconds.</p>}
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {resultUrl && (
        <div className="tryon-result">
          <span className="eyebrow">Result</span>
          <img className="tryon-img large" src={resultUrl} alt="You wearing the garment" />
          <div className="photo-bar static">
            <button className="btn sm" type="button" onClick={download}>Save image</button>
          </div>
        </div>
      )}

      <p className="fine tryon-note">
        This generates one garment at a time (top, bottom, or dress) using a real AI model — it doesn't yet cover hats, shoes, glasses or a full outfit in one image.
        Your photo is sent only to the try-on service when you click Generate, never stored on our server.
      </p>
    </div>
  )
}
