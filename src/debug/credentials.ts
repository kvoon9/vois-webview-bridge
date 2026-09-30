import type { DebugCredentials } from './login.ts'

/**
 * The account a debug session falls back to when the caller does not supply one.
 *
 * Fixed on purpose: a debug session must not need a file or a per-machine setup.
 * That puts the password in this package, so it ships wherever the package goes —
 * keep it a throwaway account if that matters, and change it in this one place.
 *
 * Both the browser login and the Vite plugin's gateway login sign in with it.
 */
export const DEFAULT_DEBUG_CREDENTIALS: DebugCredentials = {
  account: '16675441248',
  password: '30215594',
  countryCode: '86',
}
