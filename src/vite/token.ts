import { connect, type Socket } from 'node:net'

import { DEFAULT_DEBUG_CREDENTIALS } from '../debug/credentials.ts'
import {
  buildHeartbeatFrame,
  buildLoginFrame,
  LOGIN_HEADER_SIZE,
  readLoginResult,
  type DebugCredentials,
} from '../debug/login.ts'
import { md5 } from '../debug/md5.ts'

/**
 * Server-side access-token minting, the half a browser cannot do. Node only.
 *
 * The app never logs in on a fixed address: it asks `POST /v2/gateway-server` for
 * the gateway node that serves the account and signs in there over plain TCP.
 * Tokens minted on the WebSocket gateway (`web.voischat.com`) instead are rejected
 * by the `/v1` and `/v2` HTTP APIs with `31 授权失效`, which is what a desktop
 * debug session used to run into. `node:net` is the only way to reach that socket,
 * so `voisBridgeAuth` mints the token here and hands it to the page.
 */

/** The API that hands out gateway addresses; the app calls the same endpoint. */
const DEFAULT_API_BASE = 'https://api.voischat.cn'
/** The app's own `BuildConfig` pair, which also signs the HTTP queries. */
const APP_ID = '102070'
const APP_KEY = 'f956a4edc886d8402807a60f89a4a626'
/** A safety net on top of the live session, which is what a token really follows. */
const DEFAULT_TOKEN_TTL_MS = 30 * 60 * 1000
const LOGIN_TIMEOUT_MS = 15000
/** The app asks the gateway for 40s and heartbeats every 70s; 30s is comfortably inside. */
const HEARTBEAT_INTERVAL_MS = 30000

export interface GatewayAddress {
  host: string
  port: number
}

export interface AccessTokenMinterOptions {
  /** The account to sign in with; the fixed debug account by default. */
  credentials?: DebugCredentials
  /** API origin used for the gateway lookup. */
  apiBase?: string
  /** App credentials; the app's own pair by default. */
  appId?: string
  appKey?: string
  /** How long a session is served before a fresh login runs, on top of socket loss. */
  ttlMs?: number
}

export interface AccessTokenMinter {
  /** A usable token, minting or re-minting when the session behind it is gone. */
  get(): Promise<string>
  /**
   * Sign in as a different account right away and resolve with that session.
   *
   * The credentials become the minter's own, so every later re-mint (TTL, dropped
   * socket) stays on this account until another `login` swaps it again.
   */
  login(credentials: DebugCredentials): Promise<{ token: string; userId?: number }>
}

export interface GatewaySession {
  token: string
  /** The account the token belongs to; native exposes the same value as `login-id`. */
  userId?: number
  /**
   * The live sign-in socket. A gateway token is valid only while the socket that
   * asked for it stays open — closing it kills the token within about a minute —
   * so the caller owns it from here.
   */
  socket: Socket
}

interface GatewayResponse {
  errcode?: number
  errmsg?: string
  data?: { ip1?: string; port?: number }
}

/** Ask the API which gateway node serves this account. */
async function readGateway(
  apiBase: string,
  appId: string,
  appKey: string,
  credentials: DebugCredentials,
): Promise<GatewayAddress> {
  // Same shape as every other `/v2` call the app makes: appid, a future `et`, sign.
  const et = String(Math.floor(Date.now() / 1000) + 300)
  const url = new URL('/v2/gateway-server', apiBase)
  url.searchParams.set('appid', appId)
  url.searchParams.set('et', et)
  url.searchParams.set('sign', md5(et + appKey).slice(12, 20))

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'normal',
      account: credentials.account,
      country_code: credentials.countryCode,
    }),
  })
  if (!response.ok) throw new Error(`网关地址请求失败: HTTP ${response.status}`)

  const body = (await response.json()) as GatewayResponse
  if (body.errcode !== 0) {
    throw new Error(`网关地址请求失败: ${body.errcode} ${body.errmsg ?? ''}`.trim())
  }
  const { ip1, port } = body.data ?? {}
  if (!ip1 || !port) throw new Error('网关地址响应缺少 ip1/port')
  return { host: ip1, port }
}

/** Sign in on a gateway node over plain TCP and hand back the open session. */
export function loginOverTcp(
  address: GatewayAddress,
  credentials: DebugCredentials,
  timeoutMs = LOGIN_TIMEOUT_MS,
): Promise<GatewaySession> {
  return new Promise((resolve, reject) => {
    const socket = connect(address)
    let pending = Buffer.alloc(0)
    let settled = false

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(error)
    }
    const succeed = (session: Omit<GatewaySession, 'socket'>): void => {
      if (settled) return
      settled = true
      socket.setTimeout(0)
      resolve({ ...session, socket })
    }

    socket.setTimeout(timeoutMs, () => fail(new Error(`等待网关响应超时 (${timeoutMs}ms)`)))
    socket.on('error', (error) => {
      fail(new Error(`无法连接网关 ${address.host}:${address.port}: ${error.message}`))
    })
    socket.on('connect', () => {
      socket.write(
        buildLoginFrame(credentials.account, credentials.password, credentials.countryCode),
      )
    })
    socket.on('data', (chunk) => {
      // The socket is never switched to an encoding, so bytes arrive as buffers.
      pending = Buffer.concat([pending, chunk as Buffer])

      while (pending.length >= LOGIN_HEADER_SIZE) {
        const total = pending.readInt32BE(0)
        if (total < LOGIN_HEADER_SIZE) {
          fail(new Error(`网关响应帧长度无效: ${total}`))
          return
        }
        if (pending.length < total) return

        const payload = pending.subarray(LOGIN_HEADER_SIZE, total)
        pending = pending.subarray(total)
        try {
          const login = readLoginResult(payload)
          if (login) {
            succeed(login)
            return
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
          return
        }
      }
    })
  })
}

/**
 * Keep one gateway session and serve the token it carries.
 *
 * The gateway token lives and dies with its socket, so the session stays open and
 * heartbeats; losing it forgets the token, which makes the next caller log in
 * again. `ttlMs` only recycles a session that has lived long enough on its own.
 * Concurrent callers share the in-flight login, and a failed login is forgotten so
 * the next caller retries.
 */
export function createAccessTokenMinter(options: AccessTokenMinterOptions = {}): AccessTokenMinter {
  let credentials = options.credentials ?? DEFAULT_DEBUG_CREDENTIALS
  const apiBase = options.apiBase ?? DEFAULT_API_BASE
  const appId = options.appId ?? APP_ID
  const appKey = options.appKey ?? APP_KEY
  const ttlMs = options.ttlMs ?? DEFAULT_TOKEN_TTL_MS

  let session: (GatewaySession & { expiresAt: number; timer: NodeJS.Timeout }) | null = null
  let pending: Promise<GatewaySession & { expiresAt: number; timer: NodeJS.Timeout }> | null = null

  function closeSession(): void {
    if (!session) return
    clearInterval(session.timer)
    session.socket.destroy()
    session = null
  }

  async function mint() {
    closeSession()

    const address = await readGateway(apiBase, appId, appKey, credentials)
    const opened = await loginOverTcp(address, credentials)
    const timer = setInterval(() => {
      try {
        opened.socket.write(buildHeartbeatFrame())
      } catch {
        closeSession()
      }
    }, HEARTBEAT_INTERVAL_MS)
    // A dropped socket takes the token with it, so it must not be served again.
    opened.socket.on('close', closeSession)
    opened.socket.on('error', closeSession)
    // The session keeps running for the server's sake; its timer must not hold the
    // process up.
    timer.unref()

    session = { ...opened, expiresAt: Date.now() + ttlMs, timer }
    return session
  }

  /** Mint with whatever `credentials` holds, sharing one in-flight login. */
  function run(): Promise<GatewaySession & { expiresAt: number; timer: NodeJS.Timeout }> {
    pending ??= mint().finally(() => {
      pending = null
    })
    return pending
  }

  return {
    get(): Promise<string> {
      if (session && session.expiresAt > Date.now()) return Promise.resolve(session.token)
      return run().then((opened) => opened.token)
    },
    login(next: DebugCredentials): Promise<{ token: string; userId?: number }> {
      credentials = next
      return run().then(({ token, userId }) => ({ token, userId }))
    },
  }
}
