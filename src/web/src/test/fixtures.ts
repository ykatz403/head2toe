import type { Outfit, OutfitItem, Product } from '../lib/api'

export const product = (over: Partial<Product> = {}): Product => ({
  id: 1, slot: 'top', brand: 'Uniqlo', name: 'Linen Shirt', price: 40, color: '#9fc0d6', tier: 'std', attrs: { sleeve: 'short' }, shopUrl: '/go/1', ...over,
})

export const item = (slot: string, label: string, p: Partial<Product> | null, note: string | null = null): OutfitItem => ({
  slot, label, product: p ? product({ slot, ...p }) : null, note,
})

export const outfit = (over: Partial<Outfit> = {}): Outfit => ({
  season: 'summer', tier: 'both', seed: 0, total: 0,
  items: [
    item('hat', 'Hat', { id: 1, name: 'UV Cap', brand: 'Uniqlo', price: 20, shopUrl: '/go/1', attrs: { shape: 'cap' } }),
    item('top', 'Shirt', { id: 2, name: 'Silk Shirt', brand: 'Gucci', price: 1400, tier: 'lux', shopUrl: '/go/2' }),
    item('outer', 'Outer layer', null, 'Not needed in the heat'),
    item('shoes', 'Shoes', { id: 3, name: 'Loafers', brand: 'Zara', price: 79.9, shopUrl: '/go/3', attrs: { type: 'loafer' } }),
  ],
  ...over,
})
