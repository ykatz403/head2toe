import { useEffect, useRef, useState } from 'react'
import { api, ApiError, type ProductMatch } from '../lib/api'
import { toDataUri } from '../lib/imageResize'
import { photoStore } from '../lib/photoStore'

type PersonStatus = 'loading' | 'empty' | 'ready'
type GarmentMode = 'upload' | 'search'
const CATEGORIES = [['upper_body', 'Top (shirt, sweater, jacket)'], ['lower_body', 'Bottoms (pants, shorts, skirt)'], ['dresses', 'Dress']] as const
// Only these two slots map to a try-on category the model supports; shoes show up to shop but can't be tried on yet.
const SLOT_CATEGORY: Record<string, string> = { shirt: 'upper_body', jacket: 'upper_body', pants: 'lower_body' }

export function PhotoTryOn() {
  const [personStatus, setPersonStatus] = useState<PersonStatus>('loading')
  const [personUrl, setPersonUrl] = useState<string | null>(null)
  const personFile = useRef<Blob | null>(null)

  const [garmentMode, setGarmentMode] = useState<GarmentMode>('upload')
  const [garmentUrl, setGarmentUrl] = useState<string | null>(null)
  const garmentFile = useRef<Blob | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0][0])

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [changingId, setChangingId] = useState<number | null>(null)
  const [changeText, setChangeText] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultUrls, setResultUrls] = useState<string[]>([])
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
    setResultUrls([])
    setError('')
    await photoStore.set(file)
  }
  const removePerson = async () => {
    await photoStore.clear()
    setPersonUrl((old) => (old && URL.revokeObjectURL(old), null))
    personFile.current = null
    setResultUrls([])
    setPersonStatus('empty')
  }
  const chooseGarment = (file: File | undefined) => {
    if (!file) return
    garmentFile.current = file
    setGarmentUrl((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(file)))
    setResultUrls([])
    setError('')
  }
  const removeGarment = () => {
    setGarmentUrl((old) => (old && URL.revokeObjectURL(old), null))
    garmentFile.current = null
    setResultUrls([])
  }

  const switchGarmentMode = (mode: GarmentMode) => {
    setGarmentMode(mode)
    removeGarment()
    setMatches([])
    setSelectedId(null)
    setSearchError('')
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setMatches([])
    setSelectedId(null)
    try {
      const res = await api.findProducts(query)
      setMatches(res.results)
      if (res.results.length === 0) setSearchError("Nothing matched that. Try describing it differently.")
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : 'Something went wrong searching. Try again.')
    } finally {
      setSearching(false)
    }
  }

  const useMatch = async (item: ProductMatch) => {
    if (!item.image) return
    setSearchError('')
    try {
      const blob = await api.fetchProductImage(item.image)
      garmentFile.current = blob
      setGarmentUrl((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(blob)))
      setResultUrls([])
      setError('')
      setSelectedId(item.id)
      setDescription(`${item.brand} ${item.name}`)
      const cat = SLOT_CATEGORY[item.slot]
      if (cat) setCategory(cat)
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : 'Could not load that product photo. Try again.')
    }
  }

  const startChange = (item: ProductMatch) => {
    setChangingId(item.id)
    setChangeText('')
  }

  const submitChange = async (item: ProductMatch) => {
    if (!changeText.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const res = await api.findProducts(changeText, item.slot)
      const replacement = res.results[0]
      if (replacement) {
        setMatches((old) => old.map((m) => (m.id === item.id ? replacement : m)))
        if (selectedId === item.id) await useMatch(replacement)
      } else {
        setSearchError("Nothing matched that for this item. Try describing it differently.")
      }
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setSearching(false)
      setChangingId(null)
    }
  }

  const generate = async () => {
    if (!personFile.current || !garmentFile.current) return
    setBusy(true)
    setError('')
    setResultUrls([])
    try {
      // A higher cap than the default: fine patterns hold up better with more source detail to work from.
      const [humanImage, garmentImage] = await Promise.all([toDataUri(personFile.current, 1600), toDataUri(garmentFile.current, 1600)])
      const res = await api.tryOn(humanImage, garmentImage, description, category)
      setResultUrls(res.imageUrls)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong generating that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const download = (url: string, i: number) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `head2toe-tryon-${i + 1}.png`
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
          <div className="mode-toggle" role="group" aria-label="How to pick a garment">
            <button className="btn sm" type="button" aria-pressed={garmentMode === 'upload'} onClick={() => switchGarmentMode('upload')}>Upload a photo</button>
            <button className="btn sm" type="button" aria-pressed={garmentMode === 'search'} onClick={() => switchGarmentMode('search')}>Describe what you want</button>
          </div>

          {garmentMode === 'upload' && (
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
          )}

          {garmentMode === 'search' && (
            <>
              <div className="photo-stage small">
                {!garmentUrl ? (
                  <div className="upload">
                    <p className="fine">Describe what you're looking for — e.g. "a casual corduroy shirt for fall". We'll find a real matching item below.</p>
                    <div className="tryon-fields" style={{ width: '100%' }}>
                      <input
                        className="num"
                        type="text"
                        placeholder="What are you looking for?"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                      />
                    </div>
                    <button className="btn primary" type="button" disabled={searching || !query.trim()} onClick={() => void runSearch()}>
                      {searching ? 'Searching…' : 'Find items'}
                    </button>
                  </div>
                ) : (
                  <>
                    <img className="tryon-img" src={garmentUrl} alt="Selected garment" />
                    <div className="photo-bar">
                      <button className="btn sm" type="button" onClick={removeGarment}>Clear selection</button>
                    </div>
                  </>
                )}
              </div>

              {searchError && <p className="err" role="alert">{searchError}</p>}

              {matches.length > 0 && (
                <aside className="panel" aria-label="Matching items">
                  <div className="panel-head">
                    <h3>Matches</h3>
                    <span className="eyebrow">{matches.length} found</span>
                  </div>
                  <ul className="outfit">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <span className="sw">{m.image && <img src={m.image} alt="" />}</span>
                        <div>
                          <div className="slot">{m.slot}</div>
                          <div className="nm">{m.name}</div>
                          <div className="br">{m.brand} · ${m.price.toFixed(2)}</div>
                        </div>
                        <div className="right">
                          <div className="acts">
                            {SLOT_CATEGORY[m.slot] && (
                              <button className="btn sm" type="button" aria-pressed={selectedId === m.id} onClick={() => void useMatch(m)}>
                                {selectedId === m.id ? 'Selected' : 'Use'}
                              </button>
                            )}
                            <button className="btn sm" type="button" onClick={() => startChange(m)}>Change</button>
                            <a className="shop" href={m.url} target="_blank" rel="noopener sponsored">Shop ↗</a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {changingId !== null && (
                    <div className="change-row">
                      <input
                        className="num"
                        type="text"
                        placeholder="Describe a replacement…"
                        value={changeText}
                        onChange={(e) => setChangeText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void submitChange(matches.find((m) => m.id === changingId)!)}
                      />
                      <button
                        className="btn sm primary"
                        type="button"
                        disabled={searching || !changeText.trim()}
                        onClick={() => void submitChange(matches.find((m) => m.id === changingId)!)}
                      >
                        Find
                      </button>
                      <button className="btn sm" type="button" onClick={() => setChangingId(null)}>Cancel</button>
                    </div>
                  )}
                </aside>
              )}
            </>
          )}

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
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {busy && (
        <div className="tryon-result">
          <span className="eyebrow">Generating…</span>
          <div className="tryon-loading" role="status">
            <span className="spinner large" aria-hidden="true" />
            <p className="fine">This calls a real AI model and usually takes 10–20 seconds.</p>
          </div>
        </div>
      )}

      {!busy && resultUrls.length > 0 && (
        <div className="tryon-result">
          <span className="eyebrow">Result — {resultUrls.length} variations of the same photos, diagnostic only</span>
          <div className="tryon-result-grid">
            {resultUrls.map((url, i) => (
              <div key={url} className="tryon-result-item">
                <img className="tryon-img large" src={url} alt={`You wearing the garment, variation ${i + 1}`} />
                <div className="photo-bar static">
                  <button className="btn sm" type="button" onClick={() => download(url, i)}>Save image</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="fine tryon-note">
        This generates one garment at a time (top, bottom, or dress) using a real AI model — it doesn't yet cover hats, shoes, glasses or a full outfit in one image.
        Your photo is sent only to the try-on service when you click Generate, never stored on our server.
        Multiple results per click is a temporary way to see the model's range — production would generate one.
      </p>
    </div>
  )
}
