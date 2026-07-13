import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { onBridgeReady } from '../src/index.ts'
import type { WebviewBridge } from '../src/types.ts'
import {
  IOS_UA,
  installIosHandler,
  setUserAgent,
  setupBridgeTestLifecycle,
  whenReady,
} from './helpers.ts'

setupBridgeTestLifecycle()

describe('onBridgeReady — iOS', () => {
  beforeEach(() => {
    setUserAgent(IOS_UA)
  })

  test('request posts to messageHandlers and resolves via window callback', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    const promise = bridge.request<{ errcode: number }>('wechat-app-prepay', { a: 1 })

    expect(postMessage).toHaveBeenCalledOnce()
    const payload = JSON.parse(postMessage.mock.calls[0]![0] as string) as {
      type: string
      data: unknown
      callbackName: string
    }
    expect(payload.type).toBe('wechat-app-prepay')
    expect(payload.data).toEqual({ a: 1 })
    expect(payload.callbackName).toBe('bridge_callback_wechat_app_prepay')

    const cb = (window as unknown as Record<string, (raw: string) => void>)[payload.callbackName]
    expect(typeof cb).toBe('function')
    cb(JSON.stringify({ errcode: 0 }))

    await expect(promise).resolves.toEqual({ errcode: 0 })
  })

  test('send does not include callbackName', async () => {
    const { postMessage } = installIosHandler()
    const bridge = await whenReady()

    bridge.send('close-page', { x: 1 })

    expect(postMessage).toHaveBeenCalledOnce()
    expect(JSON.parse(postMessage.mock.calls[0]![0] as string)).toEqual({
      type: 'close-page',
      data: { x: 1 },
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
