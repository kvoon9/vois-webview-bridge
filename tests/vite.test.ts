// @vitest-environment node

import { createServer, type Server as HttpServer } from 'node:http'
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
  type Socket,
} from 'node:net'

import { afterEach, describe, expect, test } from 'vite-plus/test'

import { DEBUG_ACCESS_TOKEN_PATH } from '../src/debug/access-token-path.ts'
import {
  voisBridgeAuth,
  type BridgeAuthMiddleware,
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

function loginResponseFrame(token: string): Buffer {
  const serviceHead = Uint8Array.from([
    ...uint(1, 1), // login service
    ...uint(2, 5), // login app
    ...uint(3, 1), // response
    ...uint(4, 1), // seq
    ...uint(8, 0), // result code: success
  ])
  const rspLoginApp = Uint8Array.from(text(8, token))
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
 * the connection open, the way a real one does.
 */
async function startGateway(
  token: string,
): Promise<{ host: string; port: number; connections: () => number; sockets: Socket[] }> {
  let connections = 0
  const opened: Socket[] = []
  const server = track(
    createTcpServer((socket: Socket) => {
      connections += 1
      opened.push(socket)
      sockets.push(socket)
      socket.on('data', () => socket.write(loginResponseFrame(token)))
    }),
  )
  const port = await listen(server)
  return { host: '127.0.0.1', port, connections: () => connections, sockets: opened }
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

    await expect(minter.get()).resolves.toBe('minted-token')
    await expect(minter.get()).resolves.toBe('minted-token')
    expect(gateway.connections()).toBe(1)
  })

  test('mints again once the cached token is spent', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 0 })

    await expect(minter.get()).resolves.toBe('minted-token')
    await expect(minter.get()).resolves.toBe('minted-token')
    expect(gateway.connections()).toBe(2)
  })

  test('logs in again when the gateway drops the session', async () => {
    const gateway = await startGateway('minted-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const minter = createAccessTokenMinter({ apiBase, ttlMs: 60_000 })

    await expect(minter.get()).resolves.toBe('minted-token')
    gateway.sockets[0]?.destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect(minter.get()).resolves.toBe('minted-token')
    expect(gateway.connections()).toBe(2)
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

async function requestThrough(
  handler: BridgeAuthMiddleware,
  url: string,
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

  handler({ method: 'GET', url }, response, () => {
    result.handedOver = true
    release()
  })
  await done
  return result
}

describe('voisBridgeAuth', () => {
  test('answers the debug login with the minted token', async () => {
    const gateway = await startGateway('plugin-token')
    const apiBase = await startGatewayApi(gateway.host, gateway.port)
    const handler = middlewareOf(voisBridgeAuth({ apiBase }))

    await expect(requestThrough(handler, DEBUG_ACCESS_TOKEN_PATH)).resolves.toEqual({
      status: 200,
      body: JSON.stringify({ token: 'plugin-token' }),
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
