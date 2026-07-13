import { BridgeProtocolError } from '../errors.ts'
import type {
  BridgeRequestType,
  BridgeSendType,
  ProtocolCallParams,
  ProtocolResponse,
} from '../protocol.ts'
import type { NativeCall, WebviewBridge } from '../types.ts'

/**
 * WebView bridge (JS → native).
 *
 * Instances exist only after the native channel is ready and are handed to
 * {@link onBridgeReady} listeners. There is no half-ready public instance.
 */
export class Bridge implements WebviewBridge {
  private constructor(private readonly nativeCall: NativeCall) {}

  /** @internal */
  static create(nativeCall: NativeCall): Bridge {
    return new Bridge(nativeCall)
  }

  /** Fire-and-forget: JS → native, no response. */
  send<T extends BridgeSendType>(...args: ProtocolCallParams<T>): void
  send(type: string, data?: unknown): void {
    this.nativeCall(type, data ?? {})
  }

  /** Request/response: JS → native, waits for a parsed JSON response (no timeout). */
  request<T extends BridgeRequestType>(...args: ProtocolCallParams<T>): Promise<ProtocolResponse<T>>
  request(type: string, data?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.nativeCall(type, data ?? {}, (raw) => {
        try {
          resolve(JSON.parse(raw))
        } catch {
          reject(new BridgeProtocolError())
        }
      })
    })
  }
}
