// ── Protocol map ──

/**
 * Convenience helper for declaring protocol entries when extending the map.
 *
 * Shapes (the actual values stored in BridgeProtocolMap):
 * - `{}`                        → send, no payload
 * - `{ data: D }`               → send, with payload
 * - `{ data: D; response: R }`  → request, with payload + response
 */
export type BridgeFn<D = never, R = never> = R extends never
  ? D extends never
    ? {}
    : { data: D }
  : { data: D; response: R }

/**
 * Protocol catalog: map wire `type` strings to protocol entry shapes.
 *
 * This interface is **empty by default**. You extend it via module augmentation
 * (the only supported way to register protocols — no runtime registration).
 *
 * Primary usage — define your own protocols:
 *
 * ```ts
 * import type { BridgeFn } from '@vois/webview-bridge';
 *
 * declare module '@vois/webview-bridge' {
 *   interface BridgeProtocolMap {
 *     'share-text': BridgeFn<{ title: string; text: string }>;
 *     'log-event': BridgeFn<{ name: string }>;
 *     'my-custom': BridgeFn<MyData, MyResponse>;
 *   }
 * }
 * ```
 *
 * To opt into the built-in Vois/Weila app protocols, import the separate entry:
 * ```ts
 * import '@vois/webview-bridge/vois';
 * ```
 */
export interface BridgeProtocolMap {}

// ── Public type helpers ──

/**
 * Union of known "send" (no response) protocol keys.
 * Unknown strings are allowed via the `(string & {})` escape hatch.
 */
export type BridgeSendType = keyof BridgeProtocolMap extends never
  ? string
  : // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      | keyof {
          [K in keyof BridgeProtocolMap as 'response' extends keyof BridgeProtocolMap[K]
            ? never
            : K]: true
        }
      | (string & {})

/**
 * Union of known "request" (has response) protocol keys.
 * Unknown strings are allowed via the `(string & {})` escape hatch.
 */
export type BridgeRequestType = keyof BridgeProtocolMap extends never
  ? string
  : // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      | keyof {
          [K in keyof BridgeProtocolMap as 'response' extends keyof BridgeProtocolMap[K]
            ? K
            : never]: true
        }
      | (string & {})

/** Extract the response type for a given protocol key (unknown for open/unknown keys). */
export type ProtocolResponse<T extends string> = T extends keyof BridgeProtocolMap
  ? BridgeProtocolMap[T] extends { response: infer R }
    ? R
    : never
  : unknown

/**
 * Call signature for send/request based on the protocol entry shape.
 * - No `data` key in entry → second arg optional (and should be omitted or undefined).
 * - Has `data` key → second arg required with the declared payload type.
 * - Unknown key (open) → second arg optional unknown.
 */
export type ProtocolCallParams<T extends string> = T extends keyof BridgeProtocolMap
  ? BridgeProtocolMap[T] extends { data: infer D }
    ? [type: T, data: D]
    : [type: T, data?: undefined]
  : [type: T, data?: unknown]
