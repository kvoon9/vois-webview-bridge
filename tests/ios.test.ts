import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { onBridgeReady } from '../src/index.ts'
import type { WebviewBridge } from '../src/types.ts'
// Opt into built-in Vois app protocols for this test file
import '../src/vois.ts'
import {
  IOS_UA,
  installIosHandler,
  setUserAgent,
  setupBridgeTestLifecycle,
  whenReady,
} from './helpers.ts'

setupBridgeTestLifecycle()

interface RequestPayload {
  type: string
  data: unknown
  callbackName: string
}

function parsePayload(raw: unknown): RequestPayload {
  return JSON.parse(raw as string) as RequestPayload
}

function windowHandler(name: string): ((raw: string) => void) | undefined {
  return (window as unknown as Record<string, ((raw: string) => void) | undefined>)[name]
}

const PREPAY = {
  appid: 'app',
  partnerid: 'partner',
  prepay_id: 'prepay',
  noncestr: 'nonce',
  timestamp: 1,
  sign: 'sign',
}

describe('onBridgeReady — iOS', () => {
  beforeEach(() => {
    setUserAgent(IOS_UA)
  })

  test('request posts to messageHandlers and resolves via window callback', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    const promise = bridge.request('wechat-app-prepay', PREPAY)

    expect(postMessage).toHaveBeenCalledOnce()
    const payload = parsePayload(postMessage.mock.calls[0]![0])
    expect(payload.type).toBe('wechat-app-prepay')
    expect(payload.data).toEqual(PREPAY)
    expect(payload.callbackName).toMatch(/^bridge_callback_wechat_app_prepay_\d+$/)

    const cb = windowHandler(payload.callbackName)
    expect(typeof cb).toBe('function')
    cb!(JSON.stringify({ errcode: 0 }))

    await expect(promise).resolves.toEqual({ errcode: 0 })
  })

  test('two same-protocol requests get unique callbacks and resolve independently in reverse order', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    // The app has timed the first one out; its SDK promise simply stays pending.
    const params = { page: 'test', params: ['access-token'] }
    const abandoned = bridge.request('get-page-params', params)
    const fresh = bridge.request('get-page-params', params)

    expect(postMessage).toHaveBeenCalledTimes(2)
    const abandonedName = parsePayload(postMessage.mock.calls[0]![0]).callbackName
    const freshName = parsePayload(postMessage.mock.calls[1]![0]).callbackName

    expect(abandonedName).not.toBe(freshName)
    expect(abandonedName).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
    expect(freshName).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/)

    // The fresh request answers first; the abandoned callback stays registered.
    windowHandler(freshName)!(JSON.stringify({ errcode: 0, data: { 'access-token': 'fresh' } }))
    await expect(fresh).resolves.toEqual({ errcode: 0, data: { 'access-token': 'fresh' } })
    expect(typeof windowHandler(abandonedName)).toBe('function')

    // The late reply lands on the abandoned request, never on the fresh one.
    windowHandler(abandonedName)!(JSON.stringify({ errcode: 0, data: { 'access-token': 'stale' } }))
    await expect(abandoned).resolves.toEqual({ errcode: 0, data: { 'access-token': 'stale' } })
    expect(windowHandler(freshName)).toBeUndefined()
    expect(windowHandler(abandonedName)).toBeUndefined()
  })

  test('removes the callback once it is delivered', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    const promise = bridge.request('wechat-app-prepay', PREPAY)
    const { callbackName } = parsePayload(postMessage.mock.calls[0]![0])

    expect(typeof windowHandler(callbackName)).toBe('function')
    windowHandler(callbackName)!(JSON.stringify({ errcode: 0 }))
    await expect(promise).resolves.toEqual({ errcode: 0 })

    expect(Object.hasOwn(window, callbackName)).toBe(false)
    expect(windowHandler(callbackName)).toBeUndefined()
  })

  test('send does not include callbackName', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    bridge.send('close-page')

    expect(postMessage).toHaveBeenCalledOnce()
    expect(parsePayload(postMessage.mock.calls[0]![0])).toEqual({
      type: 'close-page',
      data: {},
    })
  })

  test('does not fire until uniBridgeCall is injected', async () => {
    const onReady = vi.fn()
    onBridgeReady(onReady)

    await Promise.resolve()
    await Promise.resolve()
    expect(onReady).not.toHaveBeenCalled()

    const { postMessage } = installIosHandler()
    await vi.waitFor(() => {
      expect(onReady).toHaveBeenCalledOnce()
    })

    const readyBridge = onReady.mock.calls[0]![0] as WebviewBridge
    readyBridge.send('close-page')
    expect(postMessage).toHaveBeenCalledOnce()
  })
})
