import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

vi.mock('../src/debug/login.ts', () => ({ loginForToken: vi.fn() }))

import { createDebugLoginGetter, createLocalBridge } from '../src/debug/bridge.ts'
import { enableDebugBridge, getDebugAccessToken } from '../src/debug/index.ts'
import { loginForToken, type DebugLogin } from '../src/debug/login.ts'
import { onBridgeReady } from '../src/index.ts'
import type { NativeCall, WebviewBridge } from '../src/types.ts'
import { DESKTOP_UA, setUserAgent, setupBridgeTestLifecycle } from './helpers.ts'

setupBridgeTestLifecycle()

const LOGIN: DebugLogin = { token: 'debug-token', userId: 441 }
const mockedLogin = vi.mocked(loginForToken)

beforeEach(() => {
  mockedLogin.mockReset()
})

function request(nativeCall: NativeCall, type: string, data?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    nativeCall(type, data, (raw) => resolve(JSON.parse(raw) as unknown))
  })
}

const pageParams = (params: string[]): { page: string; params: string[] } => ({
  page: 'test',
  params,
})

describe('debug bridge (createLocalBridge)', () => {
  test('answers static defaults without logging in', async () => {
    const nativeCall = createLocalBridge()

    await expect(request(nativeCall, 'get-page-params', pageParams([]))).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: { 'device-type': 'debug', theme: 'light', lang: 'zh-CN' },
    })
    await expect(request(nativeCall, 'get-page-params', pageParams(['theme']))).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: { theme: 'light' },
    })
    // The token is not part of the static defaults; native-first flows fall back explicitly.
    await expect(
      request(nativeCall, 'get-page-params', pageParams(['access-token'])),
    ).resolves.toEqual({ errcode: 0, errmsg: '', data: {} })
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  test('preserves explicitly supplied page params, including a token', async () => {
    const nativeCall = createLocalBridge({ 'access-token': 'synthetic-token', 'login-id': '441' })

    await expect(
      request(nativeCall, 'get-page-params', pageParams(['access-token', 'login-id'])),
    ).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: { 'access-token': 'synthetic-token', 'login-id': '441' },
    })

    await expect(request(nativeCall, 'get-page-params', pageParams([]))).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: {
        'device-type': 'debug',
        theme: 'light',
        lang: 'zh-CN',
        'access-token': 'synthetic-token',
        'login-id': '441',
      },
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  test('answers unknown protocols without logging in', async () => {
    const nativeCall = createLocalBridge()

    await expect(request(nativeCall, 'close-page')).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: {},
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })
})

describe('createDebugLoginGetter', () => {
  const credentials = {
    account: 'synthetic-account',
    password: 'synthetic-secret',
    countryCode: '00',
  }

  test('merges concurrent logins and reuses the result', async () => {
    const login = vi.fn(async () => LOGIN)
    const getLogin = createDebugLoginGetter(credentials, login)

    await expect(Promise.all([getLogin(), getLogin()])).resolves.toEqual([LOGIN, LOGIN])
    await expect(getLogin()).resolves.toBe(LOGIN)
    expect(login).toHaveBeenCalledOnce()
  })

  test('forgets a failed login so the next call retries', async () => {
    const login = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(LOGIN)
    const getLogin = createDebugLoginGetter(credentials, login)

    await expect(getLogin()).rejects.toThrow('offline')
    await expect(getLogin()).resolves.toEqual(LOGIN)
    expect(login).toHaveBeenCalledTimes(2)
  })
})

describe('getDebugAccessToken', () => {
  test('shares concurrent logins and reuses the token', async () => {
    enableDebugBridge()
    mockedLogin.mockResolvedValue(LOGIN)

    await expect(Promise.all([getDebugAccessToken(), getDebugAccessToken()])).resolves.toEqual([
      'debug-token',
      'debug-token',
    ])
    await expect(getDebugAccessToken()).resolves.toBe('debug-token')
    expect(mockedLogin).toHaveBeenCalledOnce()
  })

  test('retries after a failed login', async () => {
    enableDebugBridge()
    mockedLogin.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(LOGIN)

    await expect(getDebugAccessToken()).rejects.toThrow('offline')
    await expect(getDebugAccessToken()).resolves.toBe('debug-token')
    expect(mockedLogin).toHaveBeenCalledTimes(2)
  })

  test('uses the credentials supplied to enableDebugBridge', async () => {
    const credentials = {
      account: 'synthetic-account',
      password: 'synthetic-secret',
      countryCode: '00',
    }
    enableDebugBridge(credentials)
    mockedLogin.mockResolvedValue(LOGIN)

    await expect(getDebugAccessToken()).resolves.toBe('debug-token')
    expect(mockedLogin).toHaveBeenCalledWith(credentials)
  })
})

describe('enableDebugBridge', () => {
  test('hands over a bridge immediately whose page-param reads never log in', async () => {
    setUserAgent(DESKTOP_UA)
    enableDebugBridge()
    mockedLogin.mockResolvedValue(LOGIN)

    const onReady = vi.fn()
    onBridgeReady(onReady)

    // Synchronous delivery: nothing awaited a login.
    expect(onReady).toHaveBeenCalledOnce()

    const bridge = onReady.mock.calls[0]![0] as WebviewBridge
    await expect(
      bridge.request('get-page-params', { page: 'test', params: ['access-token'] }),
    ).resolves.toEqual({ errcode: 0, errmsg: '', data: {} })
    await expect(bridge.request('get-page-params', { page: 'test', params: [] })).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: { 'device-type': 'debug', theme: 'light', lang: 'zh-CN' },
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })
})
