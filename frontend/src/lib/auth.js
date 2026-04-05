const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL

const AUTH_SIGNUP_EMAIL_PATH = '/api/auth/signup/email'
const AUTH_LOGIN_EMAIL_PATH = '/api/auth/login/email'
const AUTH_GOOGLE_URL_PATH = '/api/auth/google/url'
const AUTH_WALLET_CHALLENGE_PATH = '/api/auth/wallet/challenge'
const AUTH_WALLET_VERIFY_PATH = '/api/auth/wallet/verify'
const AUTH_ME_PATH = '/api/auth/me'
const AUTH_ONBOARDING_PATH = '/api/auth/onboarding'
const AUTH_REFRESH_PATH = '/api/auth/refresh'

const DEV_AUTH_BASE_URL = 'http://localhost:3000'

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '') ?? ''
}

function trimLeadingSlash(value) {
  return value?.replace(/^\/+/, '') ?? ''
}

function buildUrl(path) {
  const baseUrl = trimTrailingSlash(AUTH_BASE_URL || '')
  const normalizedPath = trimLeadingSlash(path)

  if (!baseUrl) {
    return `/${normalizedPath}`
  }

  return `${baseUrl}/${normalizedPath}`
}

function buildDevFallbackUrl(path) {
  return `${DEV_AUTH_BASE_URL}/${trimLeadingSlash(path)}`
}

async function fetchWithFallbacks(urls, options, fallbackMessage) {
  let lastError = null

  for (const url of urls) {
    try {
      const response = await fetch(url, options)
      if (response.status !== 404) {
        return response
      }

      lastError = { response, url }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError?.response) {
    return lastError.response
  }

  throw new Error(fallbackMessage)
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }

  const primaryUrl = buildUrl(path)
  const devFallbackUrl = buildDevFallbackUrl(path)
  const requestOptions = {
    ...options,
    headers,
  }

  const primaryTargets = [primaryUrl]
  if (!primaryTargets.includes(devFallbackUrl) && primaryUrl !== devFallbackUrl) {
    primaryTargets.push(devFallbackUrl)
  }

  const authResponse = await fetchWithFallbacks(
    primaryTargets,
    requestOptions,
    `Network error calling auth API (${primaryUrl}). Ensure backend is running and reachable from the browser.`,
  )

  if (authResponse.status === 404 && devFallbackUrl !== primaryUrl) {
    const fallbackResponse = await fetchWithFallbacks(
      [devFallbackUrl],
      requestOptions,
      `Network error calling auth API (${devFallbackUrl}). Ensure backend is running and reachable from the browser.`,
    )

    if (fallbackResponse.status !== 404) {
      return await parseAuthResponse(fallbackResponse, primaryUrl)
    }
  }

  return parseAuthResponse(authResponse, primaryUrl)
}

async function parseAuthResponse(response) {
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
    const rawMessage = data?.error ?? data?.message ?? `Auth request failed with status ${response.status}`
    const normalized = String(rawMessage).toLowerCase()

    const message = normalized.includes('auth_user_wallet_addresses_wallet_address_key')
      || (normalized.includes('duplicate key value violates unique constraint') && normalized.includes('wallet_address'))
      ? 'There exists an account with this address, either login or add a different account.'
      : rawMessage

    throw new Error(message)
  }

  return data
}

export function signupWithEmail(payload) {
  return request(AUTH_SIGNUP_EMAIL_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginWithEmail(payload) {
  return request(AUTH_LOGIN_EMAIL_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getGoogleLoginUrl(payload) {
  return request(AUTH_GOOGLE_URL_PATH, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

export function requestWalletChallenge(payload) {
  return request(AUTH_WALLET_CHALLENGE_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function verifyWalletSignature(payload) {
  return request(AUTH_WALLET_VERIFY_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAuthMe(accessToken) {
  return request(AUTH_ME_PATH, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function submitAuthOnboarding(accessToken, payload) {
  return request(AUTH_ONBOARDING_PATH, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
}

export function refreshAuthSession(refreshToken) {
  return request(AUTH_REFRESH_PATH, {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  })
}

export function deleteAuthAccount(accessToken) {
  return request('/api/auth/account', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function exchangeOAuthCode(code, provider = 'google') {
  const exchangePath = `/api/auth/${provider}/callback`
  return request(exchangePath, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}
