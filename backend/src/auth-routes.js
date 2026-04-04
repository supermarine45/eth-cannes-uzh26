const crypto = require('crypto')
const express = require('express')
const { ethers } = require('ethers')

const router = express.Router()

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function getOptionalEnv(name, fallback = '') {
  const value = process.env[name]
  return value && value.trim() !== '' ? value : fallback
}

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '') ?? ''
}

function trimLeadingSlash(value) {
  return value?.replace(/^\/+/, '') ?? ''
}

function normalizeAddress(value) {
  const normalized = String(value || '').trim()
  if (!ethers.isAddress(normalized)) {
    throw new Error('Provide a valid Ethereum address.')
  }

  return ethers.getAddress(normalized).toLowerCase()
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function parseDurationToSeconds(value, fallbackSeconds) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return fallbackSeconds
  }

  const trimmed = value.trim().toLowerCase()
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10)
  }

  const match = trimmed.match(/^(\d+)([smhd])$/)
  if (!match) {
    return fallbackSeconds
  }

  const amount = Number.parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's':
      return amount
    case 'm':
      return amount * 60
    case 'h':
      return amount * 60 * 60
    case 'd':
      return amount * 60 * 60 * 24
    default:
      return fallbackSeconds
  }
}

function signJwt(payload, secret, ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const issuedAt = Math.floor(Date.now() / 1000)
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`
  const signature = crypto.createHmac('sha256', secret).update(unsignedToken).digest()

  return `${unsignedToken}.${base64UrlEncode(signature)}`
}

function verifyJwt(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format.')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = crypto.createHmac('sha256', secret).update(unsignedToken).digest()
  const receivedSignature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  if (expectedSignature.length !== receivedSignature.length || !crypto.timingSafeEqual(expectedSignature, receivedSignature)) {
    throw new Error('Invalid token signature.')
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload))
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    throw new Error('Token expired.')
  }

  return payload
}

function buildSupabaseBaseUrl() {
  return trimTrailingSlash(getRequiredEnv('SUPABASE_URL'))
}

function buildAuthUrl(path) {
  return `${buildSupabaseBaseUrl()}/auth/v1${path}`
}

function buildRestUrl(path) {
  return `${buildSupabaseBaseUrl()}/rest/v1/${trimLeadingSlash(path)}`
}

async function supabaseRequest(path, { method = 'GET', body, accessToken, serviceRole = false, headers = {} } = {}) {
  const apiKey = serviceRole ? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY') : getRequiredEnv('SUPABASE_ANON_KEY')
  const response = await fetch(path, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken || apiKey}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
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
    const message = data?.error_description || data?.error || data?.message || `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

async function supabaseAuthRequest(path, options = {}) {
  return supabaseRequest(buildAuthUrl(path), options)
}

async function supabaseRestRequest(path, options = {}) {
  return supabaseRequest(buildRestUrl(path), { ...options, serviceRole: true })
}

function normalizeWalletAddresses(walletAddresses) {
  if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    return []
  }

  const seen = new Set()
  return walletAddresses.map((entry, index) => {
    const address = normalizeAddress(typeof entry === 'string' ? entry : entry?.address)

    if (seen.has(address)) {
      throw new Error(`Duplicate wallet address: ${address}`)
    }

    seen.add(address)

    return {
      wallet_address: address,
      label: typeof entry?.label === 'string' && entry.label.trim() !== '' ? entry.label.trim() : null,
      is_primary: Boolean(entry?.isPrimary ?? entry?.is_primary ?? index === 0),
    }
  })
}

function validateOnboardingInput(body) {
  const fullName = String(body?.fullName || '').trim()
  const dateOfBirth = String(body?.dateOfBirth || '').trim()
  const accountType = String(body?.accountType || '').trim() || 'individual'
  const companyName = String(body?.companyName || '').trim()
  const businessAddress = String(body?.businessAddress || '').trim()

  if (!fullName) {
    throw new Error('fullName is required.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error('dateOfBirth must use YYYY-MM-DD format.')
  }

  if (accountType !== 'individual' && accountType !== 'business') {
    throw new Error('accountType must be individual or business.')
  }

  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`)
  if (!Number.isFinite(dob.getTime())) {
    throw new Error('dateOfBirth is invalid.')
  }

  const today = new Date()
  const threshold = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()))
  if (dob > threshold) {
    throw new Error('You must be at least 18 years old to continue.')
  }

  if (accountType === 'business') {
    if (!companyName) {
      throw new Error('companyName is required for business accounts.')
    }

    if (!businessAddress) {
      throw new Error('businessAddress is required for business accounts.')
    }
  }

  return {
    fullName,
    dateOfBirth,
    accountType,
    companyName: companyName || null,
    businessAddress: businessAddress || null,
  }
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new Error('Authorization header is required.')
  }

  return match[1].trim()
}

async function getSupabaseUser(accessToken) {
  return supabaseAuthRequest('/user', {
    method: 'GET',
    accessToken,
  })
}

async function getProfileByPrincipal(principalId) {
  const data = await supabaseRestRequest(`auth_user_profiles?principal_id=eq.${encodeURIComponent(principalId)}&select=*`, {
    method: 'GET',
  })

  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

async function getWalletAddressesByProfileId(profileId) {
  const data = await supabaseRestRequest(`auth_user_wallet_addresses?profile_id=eq.${encodeURIComponent(profileId)}&select=*`, {
    method: 'GET',
  })

  return Array.isArray(data) ? data : []
}

async function upsertProfile({ principalId, authProvider, fullName, dateOfBirth, accountType, companyName, businessAddress, email }) {
  const rows = await supabaseRestRequest('auth_user_profiles?on_conflict=principal_id', {
    method: 'POST',
    body: [{
      principal_id: principalId,
      auth_provider: authProvider,
      full_name: fullName,
      date_of_birth: dateOfBirth,
      account_type: accountType,
      company_name: companyName,
      business_address: businessAddress,
      email: email || null,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }],
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  })

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : getProfileByPrincipal(principalId)
}

async function replaceWalletAddresses(profileId, walletAddresses) {
  await supabaseRestRequest(`auth_user_wallet_addresses?profile_id=eq.${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  })

  if (walletAddresses.length === 0) {
    return []
  }

  const rows = await supabaseRestRequest('auth_user_wallet_addresses', {
    method: 'POST',
    body: walletAddresses.map((entry) => ({
      profile_id: profileId,
      wallet_address: entry.wallet_address,
      label: entry.label,
      is_primary: entry.is_primary,
      updated_at: new Date().toISOString(),
    })),
    headers: {
      Prefer: 'return=representation',
    },
  })

  return Array.isArray(rows) ? rows : []
}

function buildOnboardingRequired(profile) {
  return !profile
    || !profile.onboarding_completed_at
    || !profile.date_of_birth
    || !profile.account_type
    || (profile.account_type === 'business' && (!profile.company_name || !profile.business_address))
}

function buildUserResponse({ user, provider, walletAddress }) {
  if (provider === 'metamask') {
    return {
      id: walletAddress,
      walletAddress,
      wallet_address: walletAddress,
      email: null,
      provider: 'metamask',
      user_metadata: {},
    }
  }

  return {
    id: user.id,
    email: user.email,
    provider: user.app_metadata?.provider || provider || 'email',
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {},
  }
}

function buildOAuthUrl(redirectTo) {
  const authorizeUrl = new URL(buildAuthUrl('/authorize'))
  const state = crypto.randomBytes(16).toString('hex')
  
  authorizeUrl.searchParams.set('provider', 'google')
  authorizeUrl.searchParams.set('redirect_to', redirectTo || getOptionalEnv('GOOGLE_REDIRECT_TO', 'http://localhost:5173/auth/callback'))
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('state', state)
  
  return authorizeUrl.toString()
}

router.post('/signup/email', async (req, res) => {
  try {
    const { email, password, metadata } = req.body ?? {}
    if (typeof email !== 'string' || email.trim() === '') {
      throw new Error('email is required')
    }

    if (typeof password !== 'string' || password.length < 6) {
      throw new Error('password must be at least 6 characters')
    }

    const data = await supabaseAuthRequest('/signup', {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
        options: {
          data: metadata && typeof metadata === 'object' ? metadata : {},
        },
      },
    })

    res.json(data)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/login/email', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || email.trim() === '') {
      throw new Error('email is required')
    }

    if (typeof password !== 'string' || password.trim() === '') {
      throw new Error('password is required')
    }

    const session = await supabaseAuthRequest('/token?grant_type=password', {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
      },
    })

    res.json({ session })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body ?? {}
    if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      throw new Error('refreshToken is required')
    }

    const session = await supabaseAuthRequest('/token?grant_type=refresh_token', {
      method: 'POST',
      body: {
        refresh_token: refreshToken.trim(),
      },
    })

    res.json({ session })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/google/url', async (req, res) => {
  try {
    const redirectTo = typeof req.body?.redirectTo === 'string' && req.body.redirectTo.trim() !== ''
      ? req.body.redirectTo.trim()
      : getOptionalEnv('GOOGLE_REDIRECT_TO', 'http://localhost:5173/auth/callback')

    res.json({
      url: buildOAuthUrl(redirectTo),
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body ?? {}
    if (typeof code !== 'string' || code.trim() === '') {
      throw new Error('Authorization code is required')
    }

    // Exchange the code for a session using Supabase token endpoint
    const session = await supabaseAuthRequest('/token?grant_type=authorization_code', {
      method: 'POST',
      body: {
        code: code.trim(),
      },
    })

    res.json({ session })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/wallet/challenge', async (req, res) => {
  try {
    const address = normalizeAddress(req.body?.address)
    const chainId = Number.parseInt(String(req.body?.chainId || ''), 10)
    if (!Number.isFinite(chainId) || chainId <= 0) {
      throw new Error('chainId is required')
    }

    const nonce = crypto.randomBytes(16).toString('hex')
    const appName = getOptionalEnv('AUTH_APP_NAME', 'WalletConnect Pay')
    const issuedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + parseDurationToSeconds(getOptionalEnv('WALLET_CHALLENGE_TTL_MINUTES', '10'), 10 * 60) * 1000).toISOString()
    const message = `${appName} wants you to sign in with your Ethereum account:\n${address}\n\nNonce: ${nonce}\nChain ID: ${chainId}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`

    await supabaseRestRequest('auth_wallet_challenges', {
      method: 'POST',
      body: [{
        wallet_address: address,
        nonce,
        message,
        expires_at: expiresAt,
      }],
      headers: {
        Prefer: 'return=representation',
      },
    })

    res.json({ address, nonce, message, chainId, expiresAt })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/wallet/verify', async (req, res) => {
  try {
    const address = normalizeAddress(req.body?.address)
    const nonce = String(req.body?.nonce || '').trim()
    const signature = String(req.body?.signature || '').trim()

    if (!nonce) {
      throw new Error('nonce is required')
    }

    if (!signature) {
      throw new Error('signature is required')
    }

    const challengeRows = await supabaseRestRequest(`auth_wallet_challenges?wallet_address=eq.${encodeURIComponent(address)}&nonce=eq.${encodeURIComponent(nonce)}&used_at=is.null&select=*`, {
      method: 'GET',
    })

    const challenge = Array.isArray(challengeRows) && challengeRows.length > 0 ? challengeRows[0] : null
    if (!challenge) {
      throw new Error('Challenge not found or already used.')
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new Error('Challenge expired.')
    }

    const recoveredAddress = ethers.verifyMessage(challenge.message, signature).toLowerCase()
    if (recoveredAddress !== address) {
      throw new Error('Signature does not match the requested wallet address.')
    }

    await supabaseRestRequest(`auth_wallet_challenges?id=eq.${challenge.id}`, {
      method: 'PATCH',
      body: {
        used_at: new Date().toISOString(),
      },
      headers: {
        Prefer: 'return=minimal',
      },
    })

    await supabaseRestRequest('wallet_users?on_conflict=wallet_address', {
      method: 'POST',
      body: [{
        wallet_address: address,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
    })

    const secret = getRequiredEnv('WALLET_AUTH_TOKEN_SECRET')
    const ttlSeconds = parseDurationToSeconds(getOptionalEnv('WALLET_AUTH_TOKEN_TTL', '7d'), 7 * 24 * 60 * 60)
    const accessToken = signJwt({
      sub: address,
      walletAddress: address,
      authProvider: 'metamask',
      email: null,
    }, secret, ttlSeconds)

    res.json({
      accessToken,
      tokenType: 'bearer',
      expiresIn: ttlSeconds,
      user: buildUserResponse({ provider: 'metamask', walletAddress: address }),
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/me', async (req, res) => {
  try {
    const accessToken = getBearerToken(req)
    let user = null
    let provider = 'email'

    try {
      user = await getSupabaseUser(accessToken)
      provider = user.app_metadata?.provider || 'email'
    } catch {
      const walletPayload = verifyJwt(accessToken, getRequiredEnv('WALLET_AUTH_TOKEN_SECRET'))
      provider = 'metamask'
      user = {
        id: walletPayload.sub,
        email: null,
        app_metadata: { provider: 'metamask' },
        user_metadata: {},
        walletAddress: walletPayload.walletAddress || walletPayload.sub,
      }
    }

    const principalId = provider === 'metamask' ? `wallet:${String(user.walletAddress || user.id).toLowerCase()}` : user.id
    const profile = await getProfileByPrincipal(principalId)
    const walletAddresses = profile ? await getWalletAddressesByProfileId(profile.id) : []

    res.json({
      user: buildUserResponse({ user, provider, walletAddress: user.walletAddress || user.id }),
      profile,
      walletAddresses,
      onboardingRequired: buildOnboardingRequired(profile),
    })
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})

router.post('/onboarding', async (req, res) => {
  try {
    const accessToken = getBearerToken(req)
    let user = null
    let provider = 'email'

    try {
      user = await getSupabaseUser(accessToken)
      provider = user.app_metadata?.provider || 'email'
    } catch {
      const walletPayload = verifyJwt(accessToken, getRequiredEnv('WALLET_AUTH_TOKEN_SECRET'))
      provider = 'metamask'
      user = {
        id: walletPayload.sub,
        email: null,
        app_metadata: { provider: 'metamask' },
        user_metadata: {},
        walletAddress: walletPayload.walletAddress || walletPayload.sub,
      }
    }

    const parsed = validateOnboardingInput(req.body)
    const walletAddresses = normalizeWalletAddresses(req.body?.walletAddresses)
    if (walletAddresses.length === 0) {
      throw new Error('walletAddresses must include at least one wallet.')
    }

    const principalId = provider === 'metamask' ? `wallet:${String(user.walletAddress || user.id).toLowerCase()}` : user.id
    const profile = await upsertProfile({
      principalId,
      authProvider: provider,
      fullName: parsed.fullName,
      dateOfBirth: parsed.dateOfBirth,
      accountType: parsed.accountType,
      companyName: parsed.companyName,
      businessAddress: parsed.businessAddress,
      email: user.email || req.body?.email || null,
    })

    const linkedWallets = await replaceWalletAddresses(profile.id, walletAddresses)
    const refreshedProfile = await getProfileByPrincipal(principalId)

    res.json({
      user: buildUserResponse({ user, provider, walletAddress: user.walletAddress || user.id }),
      profile: refreshedProfile || profile,
      walletAddresses: linkedWallets,
      onboardingRequired: false,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

module.exports = {
  router,
}