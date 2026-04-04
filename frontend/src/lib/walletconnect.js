const WALLET_CONNECT_BASE_URL = import.meta.env.VITE_WALLETCONNECT_BASE_URL
const WALLET_CONNECT_API_KEY = import.meta.env.VITE_WALLETCONNECT_API_KEY

const WALLET_CONNECT_INSPECT_LINK_PATH = import.meta.env.VITE_WALLETCONNECT_INSPECT_LINK_PATH ?? '/api/walletconnect/inspect-link'
const WALLET_CONNECT_PAYMENT_OPTIONS_PATH = import.meta.env.VITE_WALLETCONNECT_PAYMENT_OPTIONS_PATH ?? '/api/walletconnect/payment-options'
const WALLET_CONNECT_PAYMENT_ACTIONS_PATH = import.meta.env.VITE_WALLETCONNECT_PAYMENT_ACTIONS_PATH ?? '/api/walletconnect/payment-actions'
const WALLET_CONNECT_CONFIRM_PAYMENT_PATH = import.meta.env.VITE_WALLETCONNECT_CONFIRM_PAYMENT_PATH ?? '/api/walletconnect/confirm-payment'
const WALLET_CONNECT_HEALTH_PATH = import.meta.env.VITE_WALLETCONNECT_HEALTH_PATH ?? '/health'

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '') ?? ''
}

function trimLeadingSlash(value) {
  return value?.replace(/^\/+/, '') ?? ''
}

function buildUrl(path) {
  if (!WALLET_CONNECT_BASE_URL) {
    throw new Error('Missing VITE_WALLETCONNECT_BASE_URL in frontend environment.')
  }

  const baseUrl = trimTrailingSlash(WALLET_CONNECT_BASE_URL)
  const normalizedPath = trimLeadingSlash(path)
  return `${baseUrl}/${normalizedPath}`
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(WALLET_CONNECT_API_KEY ? { Authorization: `Bearer ${WALLET_CONNECT_API_KEY}` } : {}),
    ...(options.headers ?? {}),
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  })

  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    const message = data?.error ?? data?.message ?? `WalletConnect request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

export async function inspectPaymentLink(payload) {
  return request(WALLET_CONNECT_INSPECT_LINK_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getPaymentOptions(payload) {
  return request(WALLET_CONNECT_PAYMENT_OPTIONS_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getPaymentActions(payload) {
  return request(WALLET_CONNECT_PAYMENT_ACTIONS_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function confirmPayment(payload) {
  return request(WALLET_CONNECT_CONFIRM_PAYMENT_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getWalletConnectHealth() {
  return request(WALLET_CONNECT_HEALTH_PATH, {
    method: 'GET',
  })
}
