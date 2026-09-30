// @vitest-environment node

import { createServer, type Server as HttpServer } from 'node:http'
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
  type Socket,
} from 'node:net'

import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { DEBUG_ACCESS_TOKEN_PATH } from '../src/debug/access-token-path.ts'
import {
  voisBridgeAuth,
  type BridgeAuthMiddleware,
  type BridgeAuthRequest,
  type VitePluginLike,
} from '../src/vite/index.ts'
import { createAccessTokenMinter, loginOverTcp } from '../src/vite/token.ts'

/**
 * The gateway answers the same wire format the app reads: a 16 byte frame header
 * around protobuf, with the token in `RspLoginApp.Token` (LoginMessage 13 → 8).
 */
function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest > 127) {
    out.push((rest & 127) | 128)
    rest = Math.floor(rest / 128)
  }
  out.push(rest)
  return out
}
const tag = (field: number, wire: number): number[] => varint((field << 3) | wire)
const bytes = (field: number, payload: Uint8Array): number[] => [
  ...tag(field, 2),
  ...varint(payload.length),
  ...payload,
]
const uint = (field: number, value: number): number[] => [...tag(field, 0), ...varint(value)]
const text = (field: number, value: string): number[] =>
  bytes(field, new TextEncoder().encode(value))

function loginResponseFrame(token: string, userId?: number): Buffer {
  const serviceHead = Uint8Array.from([
    ...uint(1, 1), // login service
    ...uint(2, 5), // login app
    ...uint(3, 1), // response
    ...uint(4, 1), // seq
    ...uint(8, 0), // result code: success
  ])
  // `User` (field 2) with the id in field 1, the same place readLoginResult reads it
  const user = userId === undefined ? [] : bytes(2, Uint8Array.from(uint(1, userId)))
  const rspLoginApp = Uint8Array.from([...text(8, token), ...user])
  const loginMessage = Uint8Array.from(bytes(13, rspLoginApp))
  const body = Uint8Array.from([...bytes(1, serviceHead), ...bytes(3, loginMessage)])

  const frame = Buffer.alloc(16 + body.length)
  frame.writeInt32BE(frame.length, 0)
  frame.writeUInt16BE(15, 8)
  frame.writeUInt16BE((1 << 8) | 5, 10)
  frame.writeUInt16BE(1, 12)
  Buffer.from(body).copy(frame, 16)
  return frame
}

/** Anything the harness can shut down: an HTTP or TCP server. */
type TrackedServer = HttpServer | TcpServer

const servers: TrackedServer[] = []
const sockets: Socket[] = []
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy()
  for (const server of servers.splice(0)) server.close()
})

function track<T extends TrackedServer>(server: T): T {
  servers.push(server)
  return server
}

function listen(server: TrackedServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

/**
 * A gateway node that answers every connection with one login frame and then keeps
 * the connection open, the way a real one does. A token factory answers per
 * connection, so a test can tell sessions apart; `userId` rides every answer.
 */
async function startGateway(
  token: string | (() => string),
  userId?: number,
): Promise<{
  host: string
  port: number
  connections: () => number
  sockets: Socket[]
  frames: () => Buffer[]
}> {
  let connections = 0
  const opened: Socket[] = []
  const received: Buffer[] = []
  const server = track(
    createTcpServer((socket: Socket) => {
      connections += 1
      opened.push(socket)
      sockets.push(socket)
      socket.on('data', (chunk: Buffer) => {
        received.push(chunk)
        socket.write(loginResponseFrame(typeof token === 'function' ? token() : token, userId))
      })
    }),
  )
  const port = await listen(server)
  return {
    host: '127.0.0.1',
    port,
    connections: () => connections,
    sockets: opened,
    frames: () => received,
  }
}

/** The API that hands out that node's address. */
async function startGatewayApi(host: string, port: number): Promise<string> {
  const server = track(
    createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ errcode: 0, errmsg: '', data: { ip1: host, ip2: host, port } }))
    }),
  )
  const apiPort = await listen(server)
  return `http://127.0.0.1:${apiPort}`
}

describe('loginOverTcp', () => {
  test('resolves with the token the gateway answers and keeps the socket', async () => {
    const gateway = await startGateway('tcp-token')

    const session = await loginOverTcp(gateway, {
      account: 'a',
      password: 'b',
      countryCode: '86',
    })

    expect(session.token).toBe('tcp-token')
    expect(session.socket.destroyed).toBe(false)
    session.socket.destroy()
  })

  test('rejects when the gateway answers nothing', async () => {
    const server = track(createTcpServer((socket: Socket) => socket.destroy()))
    const port = await listen(server)

    await expect(
      loginOverTcp(
        { host: '127.0.0.1', port },
        { account: 'a', password: 'b', countryCode: '86' },
        1000,
      ),
    ).rejects.toThrow()
  })
})

describe('createAccessTokenMinter', () => {
  test('mints once and serves the cached token until its ttl runs out', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 60_000 })

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    expect(gateway.connections()).toBe(1)
  })

  test('mints again once the cached token is spent', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 0 })

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    expect(gateway.connections()).toBe(2)
  })

  test('logs in again when the gateway drops the session', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 60_000 })

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    gateway.sockets[0]?.destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    expect(gateway.connections()).toBe(2)
  })

  test('keeps the swapped credentials when the session has to re-mint', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 60_000 })

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    await expect(
      minter.login({ account: 'user-account', password: 'user-pass', countryCode: '86' }),
    ).resolves.toEqual({ token: 'minted-token', userId: undefined })
    gateway.sockets[1]?.destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect(minter.get()).resolves.toEqual({ token: 'minted-token' })
    // The re-mint after the drop still signs in as the swapped account, not the default.
    const last = gateway.frames()[gateway.frames().length - 1]
    expect(last?.includes(Buffer.from('user-account'))).toBe(true)
    expect(last?.includes(Buffer.from('16675441248'))).toBe(false)
  })
})

function middlewareOf(plugin: VitePluginLike): BridgeAuthMiddleware {
  const handlers: BridgeAuthMiddleware[] = []
  const register = { use: (handler: BridgeAuthMiddleware) => handlers.push(handler) }
  plugin.configureServer({ middlewares: register })
  plugin.configurePreviewServer({ middlewares: register })
  const handler = handlers[0]
  if (!handler) throw new Error('plugin registered no middleware')
  return handler
}

/** A request whose body reaches listeners attached during the same tick, like Connect's. */
function bodyRequest(url: string, method: string, body: string): BridgeAuthRequest {
  const listeners = new Map<string, ((chunk?: Buffer) => void)[]>()
  const request: BridgeAuthRequest = {
    method,
    url,
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
    },
    destroy() {},
  }
  queueMicrotask(() => {
    for (const listener of listeners.get('data') ?? []) listener(Buffer.from(body))
    for (const listener of listeners.get('end') ?? []) listener()
  })
  return request
}

async function requestThrough(
  handler: BridgeAuthMiddleware,
  url: string,
  init: { method?: string; body?: string } = {},
): Promise<{ status: number; body: string; handedOver: boolean }> {
  let release = (): void => {}
  const done = new Promise<void>((resolve) => {
    release = resolve
  })
  const result = { status: 0, body: '', handedOver: false }
  const response = {
    get statusCode() {
      return result.status
    },
    set statusCode(value: number) {
      result.status = value
    },
    setHeader() {},
    end(body?: string) {
      result.body = body ?? ''
      release()
    },
  }

  const request =
    init.body === undefined
      ? { method: init.method ?? 'GET', url }
      : bodyRequest(url, init.method ?? 'POST', init.body)
  handler(request, response, () => {
    result.handedOver = true
    release()
  })
  await done
  return result
}

describe('voisBridgeAuth', () => {
  test('declares itself `pre` so no SPA fallback answers its endpoints first', () => {
    // Load-bearing: plugin hooks are sorted by enforce before they are called, and
    // the debug plugin's preview HTML middleware is also `pre` and answers every
    // dotless GET with index.html.
    expect(voisBridgeAuth().enforce).toBe('pre')
  })

  test('mints at mount so the first page read meets a live session', async () => {
    const gateway = await startGateway('warm-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)

    voisBridgeAuth({ apiBase }).configureServer({ middlewares: { use: () => {} } })

    await vi.waitFor(() => expect(gateway.connections()).toBe(1))
  })

  test('answers the debug login with the minted token and its account', async () => {
    const gateway = await startGateway('plugin-token', 441)
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const handler = middlewareOf(voisBridgeAuth({ apiBase }))

    await expect(requestThrough(handler, DEBUG_ACCESS_TOKEN_PATH)).resolves.toEqual({
      status: 200,
      body: JSON.stringify({ token: 'plugin-token', userId: 441 }),
      handedOver: false,
    })
  })

  test('leaves other requests to the server', async () => {
    const handler = middlewareOf(voisBridgeAuth({ apiBase: 'http://127.0.0.1:1' }))

    await expect(requestThrough(handler, '/index.html')).resolves.toMatchObject({
      handedOver: true,
    })
  })

  test('reports a gateway failure instead of failing the page', async () => {
    const handler = middlewareOf(voisBridgeAuth({ apiBase: 'http://127.0.0.1:1' }))

    await expect(requestThrough(handler, DEBUG_ACCESS_TOKEN_PATH)).resolves.toMatchObject({
      status: 502,
      handedOver: false,
    })
  })
})

describe('voisBridgeAuth login endpoint', () => {
  test('signs in with the posted credentials and adopts the session', async () => {
    let connections = 0
    const gateway = await startGateway(() => `token-${++connections}`, 441)
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const handler = middlewareOf(voisBridgeAuth({ apiBase }))

    // A page that never logged in mints the configured account first.
    await expect(requestThrough(handler, DEBUG_ACCESS_TOKEN_PATH)).resolves.toMatchObject({
      status: 200,
      body: JSON.stringify({ token: 'token-1', userId: 441 }),
    })

    const login = await requestThrough(handler, '/__vois-bridge/login', {
      method: 'POST',
      body: JSON.stringify({
        account: 'user-account',
        password: 'user-pass',
        countryCode: '86',
      }),
    })
    expect(login).toMatchObject({ status: 200, handedOver: false })
    expect(JSON.parse(login.body)).toEqual({ token: 'token-2', userId: 441 })
    // The login frame carries the account itself, so the swap really signed in as it.
    expect(gateway.frames().some((frame) => frame.includes(Buffer.from('user-account')))).toBe(true)

    // Every later read serves the logged-in session without a new connection.
    await expect(requestThrough(handler, DEBUG_ACCESS_TOKEN_PATH)).resolves.toMatchObject({
      status: 200,
      body: JSON.stringify({ token: 'token-2', userId: 441 }),
    })
    expect(gateway.connections()).toBe(2)
  })

  test('rejects a malformed body', async () => {
    const handler = middlewareOf(voisBridgeAuth({ apiBase: 'http://127.0.0.1:1' }))

    await expect(
      requestThrough(handler, '/__vois-bridge/login', { method: 'POST', body: 'not json' }),
    ).resolves.toMatchObject({ status: 400, handedOver: false })
  })

  test('reports the gateway rejection message', async () => {
    const handler = middlewareOf(voisBridgeAuth({ apiBase: 'http://127.0.0.1:1' }))

    await expect(
      requestThrough(handler, '/__vois-bridge/login', {
        method: 'POST',
        body: JSON.stringify({ account: 'a', password: 'b' }),
      }),
    ).resolves.toMatchObject({ status: 502, handedOver: false })
  })

  test('refuses anything but POST', async () => {
    const handler = middlewareOf(voisBridgeAuth({ apiBase: 'http://127.0.0.1:1' }))

    await expect(requestThrough(handler, '/__vois-bridge/login')).resolves.toMatchObject({
      status: 405,
      handedOver: false,
    })
  })
})
