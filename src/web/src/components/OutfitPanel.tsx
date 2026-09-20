import type { Outfit } from '../lib/api'

const money = (n: number) => '$' + (n % 1 ? n.toFixed(2) : n.toLocaleString('en-US'))

interface Props {
  outfit: Outfit | null
  hidden: Set<string>
  onToggle: (slot: string) => void
  title: string
}

export function OutfitPanel({ outfit, hidden, onToggle, title }: Props) {
  const total = outfit?.items.reduce((sum, i) => sum + (i.product && !hidden.has(i.slot) ? i.product.price : 0), 0) ?? 0
  return (
    <aside className="panel" aria-label="Shop this look">
      <div className="panel-head">
        <h3>Shop this look</h3>
        <span className="eyebrow">{title}</span>
      </div>
      <ul className="outfit">
        {outfit?.items.map((i) => {
          const p = i.product
          if (!p)
            return (
              <li key={i.slot} className="skip">
                <span className="sw" />
                <div>
                  <div className="slot">{i.label}</div>
                  <div className="br">{i.note}</div>
                </div>
                <span />
              </li>
            )
          const off = hidden.has(i.slot)
          return (
            <li key={i.slot} className={off ? 'off' : undefined}>
              <span className="sw" style={{ background: p.color }} />
              <div>
                <div className="slot">{i.label}</div>
                <div className="nm">{p.name}</div>
                <div className="br">{p.brand} · {p.tier === 'lux' ? 'Designer' : 'Everyday'}</div>
              </div>
              <div className="right">
                <span className="price">{money(p.price)}</span>
                <div className="acts">
                  <button
                    className="eye"
                    type="button"
                    aria-pressed={!off}
                    aria-label={`${off ? 'Show' : 'Hide'} ${i.label} on the model`}
                    title={off ? 'Show on model' : 'Hide on model'}
                    onClick={() => onToggle(i.slot)}
                  >
                    {off ? '○' : '●'}
                  </button>
                  <a className="shop" href={p.shopUrl} target="_blank" rel="noopener sponsored" aria-label={`Shop ${p.name} at ${p.brand}`}>
                    Shop ↗
                  </a>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="panel-foot">
        <div className="total"><span>Full look</span><span className="mono">{money(Math.round(total))}</span></div>
        <p className="fine">Prices are illustrative. Each Shop link opens the retailer and is tracked, so we earn a commission if you buy.</p>
      </div>
    </aside>
  )
}
