const ENS_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL
const ENS_NAME_PATTERN = /^[a-z0-9]+\.cannes$/

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '') ?? ''
}

function trimLeadingSlash(value) {
  return value?.replace(/^\/+/, '') ?? ''
}

function buildUrl(path) {
  const baseUrl = trimTrailingSlash(ENS_BASE_URL || '')
  const normalizedPath = trimLeadingSlash(path)

  if (!baseUrl) {
    return `/${normalizedPath}`
  }

  return `${baseUrl}/${normalizedPath}`
}

async function request(path) {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
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
    const message = data?.error ?? data?.message ?? `ENS request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

export function normalizeCannesEnsName(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (!ENS_NAME_PATTERN.test(normalized)) {
    throw new Error('ENS name must end with .cannes and use only letters or numbers before the suffix.')
  }

  return normalized
}

export function getEnsPayees({ walletAddress, offset = 0, limit = 10 } = {}) {
  const query = new URLSearchParams()
  query.set('offset', String(offset))
  query.set('limit', String(limit))

  if (walletAddress) {
    query.set('wallet', walletAddress)
  }

  return request(`/api/ens/payees?${query.toString()}`)
}

export function searchEnsProfile(query, { walletAddress } = {}) {
  const normalizedQuery = String(query || '').trim()
  const searchParams = new URLSearchParams({ query: normalizedQuery })

  if (walletAddress) {
    searchParams.set('wallet', walletAddress)
  }

  return request(`/api/ens/search?${searchParams.toString()}`)
}
