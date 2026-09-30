import { md5 } from './md5.ts'

/**
 * Weila login wire format, shared by the WebSocket debug login and the Node
 * gateway login (`src/vite/token.ts`).
 *
 * The layout is load-bearing: a 16 byte frame header, then protobuf, then
 * `MD5(et + appKey)` as the signature.
 */

/** Frame header length; the WebSocket and TCP gateways frame messages the same way. */
export const LOGIN_HEADER_SIZE = 16
/** The frame header's own service id is a constant; the real one rides in the command. */
const FRAME_SERVICE_ID = 15
const SERVICE_LOGIN = 1
const CMD_LOGIN_APP = 0x05
const CMD_HEARTBEAT = 0x04
const COMMAND_REQUEST = 0

const WSS = 'wss://web.voischat.com:8080'
const APP_ID = '102070'
const APP_KEY = 'f956a4edc886d8402807a60f89a4a626'
const CLIENT_TYPE = 0x81 // CLIENT_WINDOWS: a separate session slot, never the phone's.
const PDU_VERSION = 4

const RESULT_MESSAGES = new Map([
  [20, '参数错误'],
  [24, 'APP 版本太旧'],
  [26, '认证无效 (appId/appKey 或签名不对)'],
  [36, '应用未授权'],
  [100, '用户 IP 被封'],
  [101, '用户被封号'],
  [102, '密码错误次数太多'],
  [103, '在线用户达到系统容量'],
  [104, '验证码无效'],
  [105, '账号或密码错误'],
])

// protobuf encoding: varint and length-prefixed are the only wire types in play
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

function bytes(field: number, payload: Uint8Array): number[] {
  if (payload.length === 0) return []
  return [...tag(field, 2), ...varint(payload.length), ...payload]
}

const encoder = new TextEncoder()

function text(field: number, value: string | undefined): number[] {
  return value ? bytes(field, encoder.encode(value)) : []
}

function uint(field: number, value: number | undefined): number[] {
  return value === undefined ? [] : [...tag(field, 0), ...varint(value)]
}

interface DecodedMessage {
  first(field: number): number | Uint8Array | undefined
  nested(field: number): DecodedMessage | undefined
}

function decode(buffer: Uint8Array): DecodedMessage {
  const fields = new Map<number, (number | Uint8Array)[]>()
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  const push = (field: number, value: number | Uint8Array): void => {
    const existing = fields.get(field)
    if (existing) existing.push(value)
    else fields.set(field, [value])
  }

  let at = 0
  const readVarint = (): number => {
    let value = 0
    let shift = 0
    for (;;) {
      const byte = buffer[at++]!
      value += (byte & 127) * 2 ** shift
      if ((byte & 128) === 0) return value
      shift += 7
    }
  }

  while (at < buffer.length) {
    const key = readVarint()
    const field = key >> 3
    const wire = key & 7
    if (wire === 0) {
      push(field, readVarint())
    } else if (wire === 2) {
      const size = readVarint()
      push(field, buffer.subarray(at, at + size))
      at += size
    } else if (wire === 5) {
      push(field, view.getUint32(at, true))
      at += 4
    } else if (wire === 1) {
      at += 8
    } else {
      throw new Error(`未知的 protobuf wire type: ${wire}`)
    }
  }

  const first = (field: number): number | Uint8Array | undefined => fields.get(field)?.[0]

  return {
    first,
    nested(field) {
      const value = first(field)
      return value instanceof Uint8Array ? decode(value) : undefined
    },
  }
}

// `Uint8Array<ArrayBuffer>` rather than the default `ArrayBufferLike`: `send` needs a BufferSource.
function encodeFrame(body: Uint8Array, commandId = CMD_LOGIN_APP): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(LOGIN_HEADER_SIZE + body.length)
  const view = new DataView(frame.buffer)
  view.setInt32(0, frame.length)
  view.setInt16(4, 0)
  view.setInt16(6, 0)
  view.setInt16(8, FRAME_SERVICE_ID)
  view.setInt16(10, (SERVICE_LOGIN << 8) | commandId)
  view.setInt16(12, 1)
  view.setInt16(14, 0)
  frame.set(body, LOGIN_HEADER_SIZE)
  return frame
}
/** The wire format is public so a test can pin the byte layout without a live login. */
export function buildLoginFrame(
  account: string,
  password: string,
  countryCode: string,
): Uint8Array<ArrayBuffer> {
  const et = String(Math.floor(Date.now() / 1000) + 60)
  const signature = JSON.stringify({ et, app_id: APP_ID, sign: md5(et + APP_KEY) })

  const reqLoginApp = Uint8Array.from([
    ...text(1, signature),
    ...text(2, account),
    ...text(3, countryCode),
    ...text(4, md5(password)),
    ...uint(5, CLIENT_TYPE),
    ...uint(6, 1), // 在线
    ...uint(9, PDU_VERSION),
  ])

  const loginMessage = Uint8Array.from(bytes(12, reqLoginApp))
  const serviceHead = Uint8Array.from([
    ...uint(1, SERVICE_LOGIN),
    ...uint(2, CMD_LOGIN_APP),
    ...uint(3, COMMAND_REQUEST),
    ...uint(4, 1),
  ])

  return encodeFrame(Uint8Array.from([...bytes(1, serviceHead), ...bytes(3, loginMessage)]))
}

/**
 * `ReqHeartbeat` (LoginMessage 4). A gateway token lives only as long as the
 * socket that asked for it, so a session that stays open has to keep talking.
 */
export function buildHeartbeatFrame(intervalSeconds = 40): Uint8Array<ArrayBuffer> {
  const reqHeartbeat = Uint8Array.from(uint(2, intervalSeconds))
  const loginMessage = Uint8Array.from(bytes(4, reqHeartbeat))
  const serviceHead = Uint8Array.from([
    ...uint(1, SERVICE_LOGIN),
    ...uint(2, CMD_HEARTBEAT),
    ...uint(3, COMMAND_REQUEST),
    ...uint(4, 1),
  ])

  return encodeFrame(
    Uint8Array.from([...bytes(1, serviceHead), ...bytes(3, loginMessage)]),
    CMD_HEARTBEAT,
  )
}

export interface DebugLogin {
  readonly token: string
  /** The account the token belongs to; native exposes the same value as `login-id`. */
  readonly userId?: number
}

/**
 * Read the login answer out of one message payload, or `null` when the frame
 * carries something else. A rejected login throws with the server's reason.
 */
export function readLoginResult(payload: Uint8Array): DebugLogin | null {
  const service = decode(payload)
  const rspLoginApp = service.nested(3)?.nested(13)
  if (!rspLoginApp) return null

  const code = Number(service.nested(1)?.first(8) ?? 0)
  if (code !== 0) {
    throw new Error(`登录失败: resultCode=${code} (${RESULT_MESSAGES.get(code) ?? '未知错误'})`)
  }

  const token = rspLoginApp.first(8)
  if (!(token instanceof Uint8Array) || token.length === 0) {
    throw new Error('服务器没有返回 token')
  }
  return {
    token: new TextDecoder().decode(token),
    userId: Number(rspLoginApp.nested(2)?.first(1)) || undefined,
  }
}

export interface DebugCredentials {
  readonly account: string
  readonly password: string
  /** '0' for a Weila number, otherwise the dialling code. */
  readonly countryCode: string
}

/** Log in and resolve with the access-token the server issues. */
export function loginForToken(
  credentials: DebugCredentials,
  timeoutMs = 15000,
): Promise<DebugLogin> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WSS)
    socket.binaryType = 'arraybuffer'

    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`等待服务器响应超时 (${timeoutMs}ms)`))
    }, timeoutMs)

    const fail = (error: Error): void => {
      clearTimeout(timer)
      socket.close()
      reject(error)
    }

    let pending = new Uint8Array(0)

    socket.addEventListener('open', () => {
      socket.send(
        buildLoginFrame(credentials.account, credentials.password, credentials.countryCode),
      )
    })
    socket.addEventListener('error', () => fail(new Error(`无法连接 ${WSS}`)))
    socket.addEventListener('close', (event) => {
      if (event.code !== 1000) fail(new Error(`连接被关闭: ${event.code} ${event.reason}`))
    })

    socket.addEventListener('message', (event) => {
      // SAFETY: binaryType is set before any frame arrives, so data is an ArrayBuffer.
      const chunk = new Uint8Array(event.data as ArrayBuffer)
      const merged = new Uint8Array(pending.length + chunk.length)
      merged.set(pending)
      merged.set(chunk, pending.length)
      pending = merged

      while (pending.length >= LOGIN_HEADER_SIZE) {
        const total = new DataView(pending.buffer, pending.byteOffset).getInt32(0)
        if (total < LOGIN_HEADER_SIZE || pending.length < total) return
        const payload = pending.subarray(LOGIN_HEADER_SIZE, total)

        try {
          const login = readLoginResult(payload)
          if (login) {
            clearTimeout(timer)
            socket.close(1000)
            resolve(login)
            return
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
          return
        }
        // A frame that is not the login answer (a kick notice, say) is skipped.
        pending = pending.subarray(total)
      }
    })
  })
}
