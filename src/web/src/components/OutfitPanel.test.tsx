import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { outfit } from '../test/fixtures'
import { OutfitPanel } from './OutfitPanel'

const setup = (hidden: string[] = [], o = outfit()) => {
  const onToggle = vi.fn()
  render(<OutfitPanel outfit={o} hidden={new Set(hidden)} onToggle={onToggle} title="Summer · Both" />)
  return { onToggle }
}

describe('OutfitPanel', () => {
  it('lists every piece with brand, tier and price', () => {
    setup()
    expect(screen.getByText('Silk Shirt')).toBeInTheDocument()
    expect(screen.getByText('Gucci · Designer')).toBeInTheDocument()
    expect(screen.getByText('Zara · Everyday')).toBeInTheDocument()
    expect(screen.getByText('$1,400')).toBeInTheDocument()
    expect(screen.getByText('$79.90')).toBeInTheDocument()
  })

  it('explains skipped slots instead of leaving a gap', () => {
    setup()
    expect(screen.getByText('Not needed in the heat')).toBeInTheDocument()
  })

  it('totals only the visible pieces', () => {
    setup()
    expect(screen.getByText('$1,500')).toBeInTheDocument() // 20 + 1400 + 79.9 rounded
  })

  it('leaves hidden pieces out of the total but still lists them', () => {
    setup(['top'])
    expect(screen.getByText('Silk Shirt')).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument() // 20 + 79.9
  })

  it('tells the parent which layer was toggled', async () => {
    const { onToggle } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Hide Shirt on the model' }))
    expect(onToggle).toHaveBeenCalledWith('top')
  })

  it('offers to show a layer that is hidden', () => {
    setup(['top'])
    expect(screen.getByRole('button', { name: 'Show Shirt on the model' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shop links go through the tracked redirect, in a new tab, marked as sponsored', () => {
    setup()
    const link = screen.getByRole('link', { name: 'Shop Silk Shirt at Gucci' })
    expect(link).toHaveAttribute('href', '/go/2')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(link.getAttribute('rel')).toMatch(/sponsored/)
  })

  it('does not show shop links for skipped slots', () => {
    setup()
    const row = screen.getByText('Not needed in the heat').closest('li')!
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders an empty state without crashing before the outfit loads', () => {
    render(<OutfitPanel outfit={null} hidden={new Set()} onToggle={() => {}} title="x" />)
    expect(screen.getByText('$0')).toBeInTheDocument()
  })

  it('shows the title it is given', () => expect((setup(), screen.getByText('Summer · Both'))).toBeInTheDocument())

  it('discloses the affiliate relationship', () => {
    setup()
    expect(screen.getByText(/commission/i)).toBeInTheDocument()
  })
})
