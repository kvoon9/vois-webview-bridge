import { DEBUG_ACCESS_TOKEN_PATH, DEBUG_LOGIN_PATH } from '../debug/access-token-path.ts'
import type { DebugCredentials } from '../debug/login.ts'
import { createAccessTokenMinter, type AccessTokenMinterOptions } from './token.ts'

/**
 * Vite plugin that mints the debug account's access token for the page.
 *
 * Mount it in a dev or preview server, and `getDebugAccessToken` from
 * `@vois/webview-bridge/debug` picks the token up automatically:
 *
 * ```ts
 * import { voisBridgeAuth } from '@vois/webview-bridge/vite'
 *
 * export default defineConfig({
 *   plugins: [voisBridgeAuth()],
 * })
 * ```
 *
 * Both hooks are wired with no `apply` gate: the middleware only exists while a
 * dev or preview server asks for it, so a build never carries it.
 */

export interface VoisBridgeAuthOptions extends AccessTokenMinterOptions {
  /** Path the page fetches; defaults to the one the debug login reads. */
  path?: string
  /** Path the page posts account credentials to; defaults to the shared login path. */
  loginPath?: string
}

/** The slice of Connect's request this middleware reads. */
export interface BridgeAuthRequest {
  method?: string
  url?: string
  /** Streams the request body; Connect provides it, tests fake it. */
  on?(event: 'data' | 'end' | 'error', listener: (chunk?: Buffer) => void): void
  destroy?(): void
}
/** The slice of Connect's response this middleware writes. */
export interface BridgeAuthResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}
/** The middleware this plugin mounts; exported so a harness can drive it directly. */
export type BridgeAuthMiddleware = (
  request: BridgeAuthRequest,
  response: BridgeAuthResponse,
  next: () => void,
) => void
interface ConnectServer {
  use(handler: BridgeAuthMiddleware): void
}
/** Structural stand-in for Vite's `DevServer`/`PreviewServer`. */
export interface ViteServerLike {
  middlewares: ConnectServer
}
export interface VitePluginLike {
  name: string
  configureServer(server: ViteServerLike): void
  configurePreviewServer(server: ViteServerLike): void
}

function respond(response: BridgeAuthResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

/** Credentials are tiny; anything bigger is not a login but noise or abuse. */
const MAX_LOGIN_BODY_BYTES = 8 * 1024

function readBody(request: BridgeAuthRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!request.on) {
      reject(new Error('请求体不可读'))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk = Buffer.alloc(0)) => {
      size += chunk.length
      if (size > MAX_LOGIN_BODY_BYTES) {
        request.destroy?.()
        reject(new Error('登录请求体过大'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', (error) =>
      reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}

/** A credentials payload is `{account, password, countryCode?}`, all strings. */
function parseCredentials(body: string): DebugCredentials | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { account, password, countryCode } = parsed as Record<string, unknown>
  if (typeof account !== 'string' || account.trim() === '') return null
  if (typeof password !== 'string' || password === '') return null
  if (countryCode !== undefined && (typeof countryCode !== 'string' || countryCode.trim() === ''))
    return null
  return {
    account: account.trim(),
    password,
    countryCode: countryCode?.trim() || '0',
  }
}

export function voisBridgeAuth(options: VoisBridgeAuthOptions = {}): VitePluginLike {
  const path = options.path ?? DEBUG_ACCESS_TOKEN_PATH
  const loginPath = options.loginPath ?? DEBUG_LOGIN_PATH
  const minter = createAccessTokenMinter(options)

  /**
   * Sign in with caller-supplied credentials. A debug server is LAN-local
   * tooling and already mints for the fixed account, so the login endpoint only
   * widens who can hold a session; the password itself is never logged.
   */
  async function handleLogin(
    request: BridgeAuthRequest,
    response: BridgeAuthResponse,
  ): Promise<void> {
    try {
      const credentials = parseCredentials(await readBody(request))
      if (!credentials) {
        respond(response, 400, { error: '登录请求格式不正确' })
        return
      }
      const { token, userId } = await minter.login(credentials)
      respond(response, 200, { token, userId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[vois-webview-bridge] 登录失败: ${message}`)
      respond(response, 502, { error: message })
    }
  }

  const handler: BridgeAuthMiddleware = (request, response, next) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    if (pathname === loginPath) {
      if (request.method !== 'POST') {
        respond(response, 405, { error: 'Method Not Allowed' })
        return
      }
      void handleLogin(request, response)
      return
    }
    if (pathname !== path) return next()
    if (request.method !== 'GET') {
      respond(response, 405, { error: 'Method Not Allowed' })
      return
    }

    minter.get().then(
      ({ token, userId }) => respond(response, 200, { token, userId }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[vois-webview-bridge] 铸造 access token 失败: ${message}`)
        respond(response, 502, { error: message })
      },
    )
  }

  return {
    name: 'vois-webview-bridge-auth',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
