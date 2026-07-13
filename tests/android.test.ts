import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { BridgeProtocolError } from '../src/index.ts'
import { onBridgeReady } from '../src/index.ts'
import type { WebviewBridge } from '../src/types.ts'
// Opt into built-in Vois app protocols for this test file
import '../src/vois.ts'
import {
  ANDROID_UA,
  installAndroidBridge,
  setUserAgent,
  setupBridgeTestLifecycle,
  whenReady,
} from './helpers.ts'

setupBridgeTestLifecycle()

describe('onBridgeReady — Android', () => {
  beforeEach(() => {
    setUserAgent(ANDROID_UA)
  })

  test('send and request go through uniBridgeCall after ready', async () => {
    const { callHandler, init } = installAndroidBridge()
    const bridge = await whenReady()

    expect(init).toHaveBeenCalledOnce()

    bridge.send('close-page')
    expect(callHandler).toHaveBeenCalledOnce()

    const [name, payload] = callHandler.mock.calls[0]!
    expect(name).toBe('uniBridgeCall')
    expect(JSON.parse(payload as string)).toEqual({ type: 'close-page', data: {} })

    callHandler.mockClear()
    const res = await bridge.request('ios-app-prepay', {
      product_id: 'x',
      product_name: 'VIP',
      product_desc: 'desc',
      amount: 1,
      currency: 'CNY',
    })
    expect(res).toEqual({ errcode: 0, errmsg: 'ok' })
    expect(callHandler).toHaveBeenCalledOnce()
  })

  test('delivers a ready bridge instance', async () => {
    installAndroidBridge()
    const received = await whenReady()
    expect(typeof received.send).toBe('function')
    expect(typeof received.request).toBe('function')
    expect(() => received.send('close-page')).not.toThrow()
  })

  test('fires after late injection', async () => {
    const callHandler = vi.fn(
      (_name: string, _data: unknown, callback?: (data: string) => void) => {
        callback?.(JSON.stringify({ ok: true }))
      },
    )
    const init = vi.fn()
    const onReady = vi.fn()

    onBridgeReady(onReady)

    window.WebViewJavascriptBridge = {
      init,
      callHandler,
    }
    document.dispatchEvent(new Event('WebViewJavascriptBridgeReady'))

    await vi.waitFor(() => {
      expect(onReady).toHaveBeenCalledOnce()
    })
    const readyBridge = onReady.mock.calls[0]![0] as WebviewBridge
    const res = await readyBridge.request('ping')
    expect(res).toEqual({ ok: true })
    expect(init).toHaveBeenCalledOnce()
  })

  test('rejects on invalid JSON response', async () => {
    const { callHandler } = installAndroidBridge()
    callHandler.mockImplementation(
      (_name: string, _data: unknown, callback?: (data: string) => void) => {
        callback?.('not-json')
      },
    )

    const bridge = await whenReady()
    await expect(bridge.request('bad')).rejects.toBeInstanceOf(BridgeProtocolError)
  })

  test('request waits without timeout until native responds', async () => {
    const { callHandler } = installAndroidBridge()
    let nativeCb: ((data: string) => void) | undefined
    callHandler.mockImplementation(
      (_name: string, _data: unknown, callback?: (data: string) => void) => {
        nativeCb = callback
      },
    )

    const bridge = await whenReady()
    const promise = bridge.request('slow')

    let settled = false
    void promise.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    expect(settled).toBe(false)

    nativeCb?.(JSON.stringify({ ok: true }))
    await expect(promise).resolves.toEqual({ ok: true })
  })
})
