/**
 * Where a debug server that mounts `voisBridgeAuth` (see `@vois/webview-bridge/vite`)
 * serves the access token it minted for the debug account.
 *
 * The debug login reads this path on every call, so a server that re-mints on its
 * own schedule keeps a long-lived page in valid tokens.
 */
export const DEBUG_ACCESS_TOKEN_PATH = '/__vois-bridge/access-token'
