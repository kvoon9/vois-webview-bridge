/**
 * Where a debug server that mounts `voisBridgeAuth` (see `@vois/webview-bridge/vite`)
 * serves the access token it minted for the debug account.
 *
 * The debug login reads this path on every call, so a server that re-mints on its
 * own schedule keeps a long-lived page in valid tokens.
 */
export const DEBUG_ACCESS_TOKEN_PATH = '/__vois-bridge/access-token'

/**
 * Where the same server accepts an account/password pair to sign in with (see
 * `loginWithDebugCredentials`): it mints on the TCP gateway a browser cannot
 * reach, so the browser hands the credentials over and reads the token back
 * from {@link DEBUG_ACCESS_TOKEN_PATH}.
 */
export const DEBUG_LOGIN_PATH = '/__vois-bridge/login'
