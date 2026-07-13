import { isSupportBridge, onBridgeReady, type WebviewBridge } from '@vois/webview-bridge'

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const typeEl = document.querySelector<HTMLInputElement>('#type')!
const dataEl = document.querySelector<HTMLTextAreaElement>('#data')!
const logEl = document.querySelector<HTMLPreElement>('#log')!
const sendBtn = document.querySelector<HTMLButtonElement>('#send')!
const requestBtn = document.querySelector<HTMLButtonElement>('#request')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!

// Preset buttons
const presetCloseBtn = document.querySelector<HTMLButtonElement>('#preset-close')!
const presetWechatBtn = document.querySelector<HTMLButtonElement>('#preset-wechat')!
const presetIosBtn = document.querySelector<HTMLButtonElement>('#preset-ios')!

// Sample data for common scenarios (realistic values)
const SAMPLE_CLOSE_PAGE = {}

const SAMPLE_WECHAT_PREPAY = {
  appid: 'wx1234567890abcdef',
  partnerid: '1234567890',
  prepay_id: 'wx2026071312345678901234567890',
  noncestr: 'randomnonce123456',
  timestamp: 1752400000,
  sign: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  extdata: 'playground-test',
}

const SAMPLE_IOS_PREPAY = {
  product_id: 'vip_monthly',
  product_name: 'VIP会员-月度',
  product_desc: '解锁全部高级功能',
  amount: 1990,
  currency: 'CNY',
  order_no: 'ORD202607130001',
}

function now(): string {
  return new Date().toISOString().slice(11, 23)
}

function log(message: string): void {
  const line = `[${now()}] ${message}`
  logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line
  logEl.scrollTop = logEl.scrollHeight
}

function setStatus(text: string, kind: 'ok' | 'err' | 'neutral' = 'neutral'): void {
  statusEl.textContent = text
  statusEl.classList.remove('ok', 'err')
  if (kind === 'ok') {
    statusEl.classList.add('ok')
  } else if (kind === 'err') {
    statusEl.classList.add('err')
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

function parseData(): unknown {
  const raw = dataEl.value.trim()
  if (raw === '') {
    return {}
  }
  return JSON.parse(raw) as unknown
}

function getType(): string {
  const type = typeEl.value.trim()
  if (!type) {
    throw new Error('type is required')
  }
  return type
}

function applyToForm(type: string, data: unknown): void {
  typeEl.value = type
  dataEl.value = JSON.stringify(data, null, 2)
}

function performSend(type: string, data: unknown): void {
  if (!bridge) {
    log('send error: bridge not ready — wait for onBridgeReady')
    return
  }
  log(`send(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
  bridge.send(type, data)
  log('send dispatched (fire-and-forget)')
}

async function performRequest(type: string, data: unknown): Promise<void> {
  if (!bridge) {
    log('request error: bridge not ready — wait for onBridgeReady')
    return
  }
  log(`request(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
  try {
    const result = await bridge.request(type, data)
    log(`response: ${JSON.stringify(result, null, 2)}`)
  } catch (error) {
    log(`request error: ${formatError(error)}`)
  }
}

let bridge: WebviewBridge | null = null

log(`isSupportBridge() → ${isSupportBridge()}`)

if (!isSupportBridge()) {
  setStatus('bridge not supported in this environment', 'err')
  log('skip onBridgeReady — degrade UI')
} else {
  setStatus('waiting for bridge…')
  log('onBridgeReady(…)')

  onBridgeReady((readyBridge) => {
    bridge = readyBridge
    setStatus('bridge ready', 'ok')
    log('onBridgeReady(bridge)')
  })
}

sendBtn.addEventListener('click', () => {
  try {
    if (!bridge) {
      throw new Error('bridge not ready — wait for onBridgeReady')
    }
    const type = getType()
    const data = parseData()
    log(`send(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
    bridge.send(type, data)
    log('send dispatched (fire-and-forget)')
  } catch (error) {
    log(`send error: ${formatError(error)}`)
  }
})

requestBtn.addEventListener('click', () => {
  void (async () => {
    try {
      if (!bridge) {
        throw new Error('bridge not ready — wait for onBridgeReady')
      }
      const type = getType()
      const data = parseData()
      log(`request(${JSON.stringify(type)}, ${JSON.stringify(data)})`)
      const result = await bridge.request(type, data)
      log(`response: ${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      log(`request error: ${formatError(error)}`)
    }
  })()
})

clearBtn.addEventListener('click', () => {
  logEl.textContent = ''
})

// Preset scenario buttons — one-click testing with realistic sample data
presetCloseBtn.addEventListener('click', () => {
  applyToForm('close-page', SAMPLE_CLOSE_PAGE)
  performSend('close-page', SAMPLE_CLOSE_PAGE)
})

presetWechatBtn.addEventListener('click', () => {
  applyToForm('wechat-app-prepay', SAMPLE_WECHAT_PREPAY)
  void performRequest('wechat-app-prepay', SAMPLE_WECHAT_PREPAY)
})

presetIosBtn.addEventListener('click', () => {
  applyToForm('ios-app-prepay', SAMPLE_IOS_PREPAY)
  void performRequest('ios-app-prepay', SAMPLE_IOS_PREPAY)
})
