import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { onBridgeReady } from '../src/index.ts'
import {
  ANDROID_UA,
  DESKTOP_UA,
  installAndroidBridge,
  setUserAgent,
  setupBridgeTestLifecycle,
  whenReady,
} from './helpers.ts'

setupBridgeTestLifecycle()

describe('onBridgeReady — environment', () => {
  test('returns void and never fires on desktop', async () => {
    setUserAgent(DESKTOP_UA)
    const cb = vi.fn()
    const result = onBridgeReady(cb)
    expect(result).toBeUndefined()
    await Promise.resolve()
    await Promise.resolve()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('onBridgeReady — singleton', () => {
  beforeEach(() => {
    setUserAgent(ANDROID_UA)
  })

  test('multi-subscriber shares one bridge; init once', async () => {
    const { init } = installAndroidBridge()
    const a = vi.fn()
    const b = vi.fn()

    onBridgeReady(a)
    onBridgeReady(b)

    await vi.waitFor(() => {
      expect(a).toHaveBeenCalledOnce()
      expect(b).toHaveBeenCalledOnce()
    })
    expect(a.mock.calls[0]![0]).toBe(b.mock.calls[0]![0])
    expect(init).toHaveBeenCalledOnce()
  })

  test('late subscriber after ready gets same instance immediately', async () => {
    installAndroidBridge()
    const first = await whenReady()
    const second = vi.fn()
    onBridgeReady(second)
    expect(second).toHaveBeenCalledOnce()
    expect(second.mock.calls[0]![0]).toBe(first)
  })
})
