const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL

const AUTH_SIGNUP_EMAIL_PATH = import.meta.env.VITE_AUTH_SIGNUP_EMAIL_PATH ?? '/api/auth/signup/email'
const AUTH_LOGIN_EMAIL_PATH = import.meta.env.VITE_AUTH_LOGIN_EMAIL_PATH ?? '/api/auth/login/email'
const AUTH_GOOGLE_URL_PATH = import.meta.env.VITE_AUTH_GOOGLE_URL_PATH ?? '/api/auth/google/url'
const AUTH_WALLET_CHALLENGE_PATH = import.meta.env.VITE_AUTH_WALLET_CHALLENGE_PATH ?? '/api/auth/wallet/challenge'
const AUTH_WALLET_VERIFY_PATH = import.meta.env.VITE_AUTH_WALLET_VERIFY_PATH ?? '/api/auth/wallet/verify'
const AUTH_ME_PATH = import.meta.env.VITE_AUTH_ME_PATH ?? '/api/auth/me'
const AUTH_ONBOARDING_PATH = import.meta.env.VITE_AUTH_ONBOARDING_PATH ?? '/api/auth/onboarding'
const AUTH_REFRESH_PATH = import.meta.env.VITE_AUTH_REFRESH_PATH ?? '/api/auth/refresh'

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

function buildSameOriginUrl(path) {
  const normalizedPath = trimLeadingSlash(path)
  return `/${normalizedPath}`
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  }

  const primaryUrl = buildUrl(path)
  const sameOriginUrl = buildSameOriginUrl(path)
  let response

  try {
    response = await fetch(primaryUrl, {
      ...options,
      headers,
    })
  } catch {
    const canRetryViaProxy = Boolean(AUTH_BASE_URL) && primaryUrl !== sameOriginUrl

    if (canRetryViaProxy) {
      try {
        response = await fetch(sameOriginUrl, {
          ...options,
          headers,
        })
      } catch {
        throw new Error(
          `Network error calling auth API (${primaryUrl}). Ensure backend is running and allow requests from the frontend origin.`,
        )
      }
    } else {
      throw new Error(
        `Network error calling auth API (${primaryUrl}). Ensure backend is running and reachable from the browser.`,
      )
    }
  }

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
    const message = data?.error ?? data?.message ?? `Auth request failed with status ${response.status}`
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
