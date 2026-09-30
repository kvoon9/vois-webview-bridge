import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

vi.mock('../src/debug/login.ts', () => ({ loginForToken: vi.fn() }))

import {
  createDebugLoginGetter,
  createLocalBridge,
  resetDebugPageParams,
} from '../src/debug/bridge.ts'
import { enableDebugBridge, getDebugAccessToken, loginWithCredentials } from '../src/debug/index.ts'
import { loginForToken, type DebugLogin } from '../src/debug/login.ts'
import { onBridgeReady } from '../src/index.ts'
import type { NativeCall, WebviewBridge } from '../src/types.ts'
import { DESKTOP_UA, setUserAgent, setupBridgeTestLifecycle } from './helpers.ts'

setupBridgeTestLifecycle()

const LOGIN: DebugLogin = { token: 'debug-token', userId: 441 }
const mockedLogin = vi.mocked(loginForToken)

beforeEach(() => {
  mockedLogin.mockReset()
  resetDebugPageParams()
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
  beforeEach(() => {
    // No debug server here, so the account login stays in charge by default.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no debug server')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('prefers the token a debug server minted', async () => {
    enableDebugBridge()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'served-token' }) }),
    )

    await expect(getDebugAccessToken()).resolves.toBe('served-token')
    expect(mockedLogin).not.toHaveBeenCalled()
  })

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

describe('loginWithCredentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('posts the credentials and resolves with the served login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'served-token', userId: 441 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      loginWithCredentials({ account: 'a', password: 'b', countryCode: '86' }),
    ).resolves.toEqual({ token: 'served-token', userId: 441 })
    expect(fetchMock).toHaveBeenCalledWith('/__vois-bridge/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'a', password: 'b', countryCode: '86' }),
    })
  })

  test('throws the server rejection message verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: '登录失败: resultCode=105 (账号或密码错误)' }),
      }),
    )

    await expect(
      loginWithCredentials({ account: 'a', password: 'wrong', countryCode: '86' }),
    ).rejects.toThrow('账号或密码错误')
  })

  test('falls back to the status code when the body is unreadable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )

    await expect(
      loginWithCredentials({ account: 'a', password: 'b', countryCode: '86' }),
    ).rejects.toThrow('HTTP 404')
  })

  test('makes the live bridge answer login-id for the account that signed in', async () => {
    enableDebugBridge()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'served-token', userId: 1541034 }),
      }),
    )

    await expect(
      loginWithCredentials({ account: 'a', password: 'b', countryCode: '86' }),
    ).resolves.toEqual({ token: 'served-token', userId: 1541034 })

    const onReady = vi.fn()
    onBridgeReady(onReady)
    const bridge = onReady.mock.calls[0]![0] as WebviewBridge
    await expect(
      bridge.request('get-page-params', { page: 'test', params: ['login-id'] }),
    ).resolves.toEqual({ errcode: 0, errmsg: '', data: { 'login-id': '1541034' } })
  })
})

describe('enableDebugBridge page params', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A page that loaded after the login: nothing adopted, only the server knows. */
  test('answers login-id from the debug server session', async () => {
    enableDebugBridge()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'served-token', userId: 1541034 }),
      }),
    )

    const onReady = vi.fn()
    onBridgeReady(onReady)
    const bridge = onReady.mock.calls[0]![0] as WebviewBridge
    await expect(
      bridge.request('get-page-params', { page: 'test', params: ['login-id'] }),
    ).resolves.toEqual({ errcode: 0, errmsg: '', data: { 'login-id': '1541034' } })
    // The whole-set read serves it too, alongside the debug environment defaults.
    await expect(bridge.request('get-page-params', { page: 'test', params: [] })).resolves.toEqual({
      errcode: 0,
      errmsg: '',
      data: {
        'device-type': 'debug',
        theme: 'light',
        lang: 'zh-CN',
        'login-id': '1541034',
      },
    })
  })

  test('leaves a read that cannot see login-id to the defaults', async () => {
    enableDebugBridge()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'served-token', userId: 1541034 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const onReady = vi.fn()
    onBridgeReady(onReady)
    const bridge = onReady.mock.calls[0]![0] as WebviewBridge
    await expect(
      bridge.request('get-page-params', { page: 'test', params: ['theme'] }),
    ).resolves.toEqual({ errcode: 0, errmsg: '', data: { theme: 'light' } })
    expect(fetchMock).not.toHaveBeenCalled()
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
