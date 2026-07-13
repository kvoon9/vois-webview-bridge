// ── Built-in Vois / Weila app payload types ──

/** Request body for protocol `wechat-app-prepay`. */
export interface WechatPrepay {
  appid: string
  partnerid: string
  prepay_id: string
  noncestr: string
  timestamp: number
  sign: string
  extdata?: string
}

/** Response body for protocol `wechat-app-prepay`. */
export interface WechatPayRes {
  errcode: number
  errmsg: string
  data: {
    wxpaycode: number
    prepayId: string
  }
}

/** Request body for protocol `ios-app-prepay`. */
export interface IOSPrepay {
  product_id: string
  product_name: string
  product_desc: string
  /** Observed unit in realname-auth: fen. */
  amount: number
  currency: string
  order_no?: string
}

/** Response body for protocol `ios-app-prepay` (no nested `data`). */
export interface IOSPayRes {
  errcode: number
  errmsg: string
}

// ── Built-in Vois app protocol map ──

/**
 * Protocol entries provided by the official Vois/Weila app.
 *
 * Import this module (or extend manually) to make these protocols
 * available on `bridge.send()` / `bridge.request()`.
 *
 * ```ts
 * // Recommended (easiest)
 * import '@vois/webview-bridge/vois';
 *
 * // Alternative (explicit)
 * import type { VoisAppProtocolMap } from '@vois/webview-bridge/vois';
 * declare module '@vois/webview-bridge' {
 *   interface BridgeProtocolMap extends VoisAppProtocolMap {}
 * }
 * ```
 */
export interface VoisAppProtocolMap {
  'close-page': {}
  'wechat-app-prepay': { data: WechatPrepay; response: WechatPayRes }
  'ios-app-prepay': { data: IOSPrepay; response: IOSPayRes }
}

// Side-effect augmentation so that a simple import brings in the protocols.
declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap extends VoisAppProtocolMap {}
}
