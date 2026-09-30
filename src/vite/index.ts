import { DEBUG_ACCESS_TOKEN_PATH } from '../debug/access-token-path.ts'
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
}

/** The slice of Connect's request this middleware reads. */
export interface BridgeAuthRequest {
  method?: string
  url?: string
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

export function voisBridgeAuth(options: VoisBridgeAuthOptions = {}): VitePluginLike {
  const path = options.path ?? DEBUG_ACCESS_TOKEN_PATH
  const minter = createAccessTokenMinter(options)

  const handler: BridgeAuthMiddleware = (request, response, next) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    if (pathname !== path) return next()
    if (request.method !== 'GET') {
      respond(response, 405, { error: 'Method Not Allowed' })
      return
    }

    minter.get().then(
      (token) => respond(response, 200, { token }),
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
