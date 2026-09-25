/// <reference types="node" />
import 'fake-indexeddb/auto'
import { Blob } from 'node:buffer' // jsdom's own Blob isn't structured-clonable by fake-indexeddb; Node's is
import { beforeEach, describe, expect, it } from 'vitest'
import { photoStore } from './photoStore'

const blob = (text = 'fake-photo-bytes') => new Blob([text], { type: 'image/png' }) as unknown as globalThis.Blob

beforeEach(async () => {
  await photoStore.clear()
})

describe('photoStore', () => {
  it('has nothing before a photo is saved', async () => expect(await photoStore.get()).toBeNull())

  it('round-trips a photo', async () => {
    await photoStore.set(blob())
    const back = await photoStore.get()
    expect(back).toBeInstanceOf(Blob)
    expect(await back!.text()).toBe('fake-photo-bytes')
  })

  it('saving again replaces the previous photo', async () => {
    await photoStore.set(blob('first'))
    await photoStore.set(blob('second'))
    expect(await (await photoStore.get())!.text()).toBe('second')
  })

  it('clear removes it', async () => {
    await photoStore.set(blob())
    await photoStore.clear()
    expect(await photoStore.get()).toBeNull()
  })
})
