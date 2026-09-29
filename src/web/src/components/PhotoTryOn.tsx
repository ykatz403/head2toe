import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type ProductMatch } from '../lib/api'
import { toDataUri } from '../lib/imageResize'
import { photoStore } from '../lib/photoStore'

type PersonStatus = 'loading' | 'empty' | 'ready'
type GarmentMode = 'upload' | 'search'
const CATEGORIES = [
  ['upper_body', 'Top (shirt, sweater, jacket)'],
  ['lower_body', 'Bottoms (pants, shorts, skirt)'],
  ['dresses', 'Dress'],
  ['footwear', 'Shoes'],
] as const
// FASHN's tryon-max handles shoes as just another single item, same as a top or bottom.
const SLOT_CATEGORY: Record<string, string> = { shirt: 'upper_body', jacket: 'upper_body', pants: 'lower_body', shoes: 'footwear' }

interface Props {
  /** Where to portal the matches panel (the app's right-hand "shop this look" column). Renders inline if omitted. */
  sidePanelSlot?: HTMLElement | null
}

export function PhotoTryOn({ sidePanelSlot }: Props) {
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
  // At most one selected item per slot (a second shirt replaces the first), but different slots can combine.
  const [selected, setSelected] = useState<Record<string, ProductMatch>>({})
  const [changingId, setChangingId] = useState<number | null>(null)
  const [changeText, setChangeText] = useState('')

  const [busy, setBusy] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
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
    setSelected({})
    setSearchError('')
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setMatches([])
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

  const toggleSelect = (item: ProductMatch) => {
    setSelected((old) => {
      const next = { ...old }
      if (next[item.slot]?.id === item.id) delete next[item.slot]
      else next[item.slot] = item
      return next
    })
    setResultUrls([])
    setError('')
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
        setSelected((old) => (old[item.slot]?.id === item.id ? { ...old, [item.slot]: replacement } : old))
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

  const selectedItems = Object.values(selected)
  const hasGarment = garmentMode === 'upload' ? !!garmentUrl : selectedItems.length > 0

  const generate = async () => {
    if (!personFile.current || !hasGarment) return
    setBusy(true)
    setError('')
    setResultUrls([])
    setProgressLabel('')
    try {
      if (garmentMode === 'search' && selectedItems.length > 1) {
        // FASHN composites one item per call with no native multi-garment support (confirmed against their
        // docs), so multiple items means chaining: each round's output becomes the next round's base photo.
        // Only the last round asks for multiple variations - branching 3-ways at every step would multiply
        // cost for variations we'd throw away anyway.
        let baseImage = await toDataUri(personFile.current, 1600)
        let finalUrls: string[] = []
        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i]
          const isLast = i === selectedItems.length - 1
          setProgressLabel(`Adding ${item.name}… (${i + 1} of ${selectedItems.length})`)
          if (!item.image) throw new ApiError(422, `${item.name} has no usable photo. Remove it and try another item.`)
          const res = await api.tryOn(baseImage, item.image, `${item.brand} ${item.name}`, SLOT_CATEGORY[item.slot] ?? 'upper_body', isLast ? 3 : 1)
          if (!res.imageUrls?.length) throw new ApiError(422, `Could not add the ${item.slot}. Try a different item.`)
          baseImage = res.imageUrls[0]
          if (isLast) finalUrls = res.imageUrls
        }
        setResultUrls(finalUrls)
      } else {
        const garmentImage = garmentMode === 'search'
          ? selectedItems[0].image!
          : await toDataUri(garmentFile.current!, 1600)
        const desc = garmentMode === 'search' ? `${selectedItems[0].brand} ${selectedItems[0].name}` : description
        const cat = garmentMode === 'search' ? (SLOT_CATEGORY[selectedItems[0].slot] ?? 'upper_body') : category
        // A higher cap than the default: fine patterns hold up better with more source detail to work from.
        const humanImage = await toDataUri(personFile.current, 1600)
        const res = await api.tryOn(humanImage, garmentImage, desc, cat)
        setResultUrls(res.imageUrls)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong generating that. Try again.')
    } finally {
      setBusy(false)
      setProgressLabel('')
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

  const matchesPanel = (
    <aside className="panel" aria-label="Style matches">
      <div className="panel-head">
        <h3>Style matches</h3>
        {matches.length > 0 && <span className="eyebrow">{matches.length} found</span>}
      </div>
      {garmentMode === 'upload' && <p className="fine panel-empty">Switch to "Describe what you want" to find real items here.</p>}
      {garmentMode === 'search' && matches.length === 0 && !searching && (
        <p className="fine panel-empty">Describe what you're looking for on the left to see real matches here.</p>
      )}
      {searching && matches.length === 0 && <p className="fine panel-empty" role="status">Searching…</p>}
      {garmentMode === 'search' && matches.length > 0 && (
        <>
          <ul className="outfit">
            {matches.map((m) => {
              const isSelected = selected[m.slot]?.id === m.id
              return (
                <li key={m.id}>
                  <span className="sw">{m.image && <img src={m.image} alt="" />}</span>
                  <div>
                    <div className="slot">{m.slot}</div>
                    <div className="nm">{m.name}</div>
                    <div className="br">{m.brand} · ${m.price.toFixed(2)}</div>
                  </div>
                  <div className="right">
                    <div className="acts">
                      <button className="btn sm" type="button" aria-pressed={isSelected} onClick={() => toggleSelect(m)}>
                        {isSelected ? 'Added' : 'Add'}
                      </button>
                      <button className="btn sm" type="button" onClick={() => startChange(m)}>Change</button>
                      <a className="shop" href={m.url} target="_blank" rel="noopener sponsored">Shop ↗</a>
                    </div>
                  </div>
                </li>
              )
            })}
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
        </>
      )}
    </aside>
  )

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
            <div className="photo-stage small">
              <div className="upload">
                <p className="fine">Describe what you're looking for — e.g. "a navy blazer" or "warm shoes for fall". Add as many items as you like, one per category.</p>
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
                {selectedItems.length > 0 && (
                  <div className="chips">
                    {selectedItems.map((item) => (
                      <span key={item.id} className="chip">
                        {item.image && <img src={item.image} alt="" />}
                        {item.name}
                        <button type="button" aria-label={`Remove ${item.name}`} onClick={() => toggleSelect(item)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {searchError && <p className="err" role="alert">{searchError}</p>}

          {garmentMode === 'upload' && (
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
          )}
        </div>
      </div>

      {personInputEl}
      {garmentInputEl}

      <div className="tryon-actions">
        <button className="btn primary" type="button" disabled={busy || !personUrl || !hasGarment || configured === false} onClick={() => void generate()}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Generating…' : selectedItems.length > 1 ? `Generate (${selectedItems.length} items)` : 'Generate'}
        </button>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {busy && (
        <div className="tryon-result">
          <span className="eyebrow">Generating…</span>
          <div className="tryon-loading" role="status">
            <span className="spinner large" aria-hidden="true" />
            <p className="fine">{progressLabel || 'This calls a real AI model and usually takes 10–20 seconds.'}</p>
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
        Adding more than one item (e.g. a jacket and shoes) runs one AI call per item, layering each onto the previous result — it takes longer and costs more per generation than a single item.
        Your photo is sent only to the try-on service when you click Generate, never stored on our server.
        Multiple results per click is a temporary way to see the model's range — production would generate one.
      </p>

      {sidePanelSlot ? createPortal(matchesPanel, sidePanelSlot) : matchesPanel}
    </div>
  )
}
