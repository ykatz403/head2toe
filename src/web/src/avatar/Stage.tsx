import { useEffect, useRef, useState } from 'react'
import { AvatarScene, type BodyShape, type LookItem } from './scene'

interface Props {
  body: BodyShape
  items: LookItem[]
  scanned: boolean
}

export function Stage({ body, items, scanned }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<AvatarScene | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    try {
      scene.current = new AvatarScene(canvas.current!, host.current!)
    } catch {
      setFailed(true)
      return
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [])
  useEffect(() => scene.current?.setBody(body), [body])
  useEffect(() => scene.current?.setLook(items), [items])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') scene.current?.rotate(-0.25)
    else if (e.key === 'ArrowRight') scene.current?.rotate(0.25)
    else return
    e.preventDefault()
  }

  return (
    <div className="stage" ref={host}>
      <canvas ref={canvas} tabIndex={0} onKeyDown={onKey} aria-label="3D model of you wearing the outfit. Drag or use the arrow keys to rotate." />
      <div className="ruler" aria-hidden="true" />
      <div className="tag">
        <span className={scanned ? 'badge ok' : 'badge demo'}>{scanned ? 'Your scan' : 'Stand-in avatar'}</span>
      </div>
      <div className="hint">drag to turn · arrow keys work too</div>
      <div className="views">
        <button className="btn sm" type="button" onClick={() => scene.current?.setView(0)}>Front</button>
        <button className="btn sm" type="button" onClick={() => scene.current?.setView(1)}>Side</button>
        <button className="btn sm" type="button" onClick={() => scene.current?.setView(2)}>Back</button>
        <button className="btn sm" type="button" aria-label="Zoom in" onClick={() => scene.current?.zoom(-0.4)}>+</button>
        <button className="btn sm" type="button" aria-label="Zoom out" onClick={() => scene.current?.zoom(0.4)}>−</button>
      </div>
      {failed && <div className="webgl-fail">3D isn't available in this browser. The outfit list still works.</div>}
    </div>
  )
}
