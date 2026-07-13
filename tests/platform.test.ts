import { describe, expect, test } from 'vite-plus/test'

import { isAndroid, isIOS, isSupportBridge } from '../src/index.ts'
import {
  ANDROID_UA,
  DESKTOP_UA,
  IOS_UA,
  setUserAgent,
  setupBridgeTestLifecycle,
} from './helpers.ts'

setupBridgeTestLifecycle()

describe('isSupportBridge', () => {
  test('false on desktop', () => {
    setUserAgent(DESKTOP_UA)
    expect(isSupportBridge()).toBe(false)
  })

  test('true on Android even before WVJB inject', () => {
    setUserAgent(ANDROID_UA)
    expect(isSupportBridge()).toBe(true)
  })

  test('true on iOS even before uniBridgeCall inject', () => {
    setUserAgent(IOS_UA)
    expect(isSupportBridge()).toBe(true)
  })
})

describe('isAndroid / isIOS', () => {
  test('detects mobile UA strings', () => {
    expect(isAndroid('Mozilla/5.0 (Linux; Android 13)')).toBe(true)
    expect(isAndroid('Mozilla/5.0 (Linux; Adr 10)')).toBe(true)
    expect(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false)
    expect(isIOS(IOS_UA)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Linux; Android 13)')).toBe(false)
    expect(isAndroid(DESKTOP_UA)).toBe(false)
    expect(isIOS(DESKTOP_UA)).toBe(false)
  })
})
