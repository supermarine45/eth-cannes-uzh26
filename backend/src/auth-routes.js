const crypto = require('crypto')
const express = require('express')
const { ethers } = require('ethers')
const { createEnsCommerceRegistry } = require('../ens-commerce')
const { normalizeCannesEnsName } = require('./ens-name')

const router = express.Router()
const ensRegistry = createEnsCommerceRegistry()

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

function normalizeAccountType(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) {
    return 'individual'
  }

  if (normalized === 'business' || normalized === 'merchant') {
    return 'business'
  }

  if (normalized === 'individual') {
    return 'individual'
  }

  throw new Error('accountType must be individual, business, or merchant.')
}

function isBusinessAccountType(value) {
  return normalizeAccountType(value) === 'business'
}

function logAuthEvent(eventName, details = {}) {
  const timestamp = new Date().toISOString()
  console.info(`[auth] ${eventName}`, JSON.stringify({ timestamp, ...details }))
}

function summarizeProfile(profile) {
  if (!profile) {
    return null
  }

  return {
    id: profile.id,
    principal_id: profile.principal_id,
    auth_provider: profile.auth_provider,
    full_name: profile.full_name,
    ens_name: profile.ens_name,
    account_type: profile.account_type,
    company_name: profile.company_name,
    business_address: profile.business_address,
    email: profile.email,
    onboarding_completed_at: profile.onboarding_completed_at,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }
}

function summarizeWalletAddress(entry) {
  if (!entry) {
    return null
  }

  return {
    id: entry.id,
    profile_id: entry.profile_id,
    wallet_address: entry.wallet_address,
    label: entry.label,
    is_primary: entry.is_primary,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }
}

function mapOnboardingErrorMessage(error) {
  const rawMessage = String(error?.message || '').toLowerCase()

  const isWalletUniqueViolation = rawMessage.includes('auth_user_wallet_addresses_wallet_address_key')
    || (rawMessage.includes('duplicate key value violates unique constraint')
      && rawMessage.includes('wallet_address'))

  if (isWalletUniqueViolation) {
    return 'There exists an account with this address, either login or add a different account.'
  }

  return error?.message || 'Onboarding failed.'
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

function buildAuthAdminUrl(path) {
  return `${buildSupabaseBaseUrl()}/auth/v1/admin${path}`
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
    const message = data?.error_description || data?.error || data?.msg || data?.message || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.statusCode = response.status
    error.details = data
    throw error
  }

  return data
}

async function supabaseAuthRequest(path, options = {}) {
  return supabaseRequest(buildAuthUrl(path), options)
}

async function supabaseAdminAuthRequest(path, options = {}) {
  return supabaseRequest(buildAuthAdminUrl(path), { ...options, serviceRole: true })
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
    const address = normalizeAddress(
      typeof entry === 'string' ? entry : (entry?.address ?? entry?.walletAddress ?? entry?.wallet_address),
    )

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

function validateOnboardingInput(body, provider = 'email') {
  const fullName = String(body?.fullName || '').trim()
  const dateOfBirth = String(body?.dateOfBirth || '').trim()
  const accountType = normalizeAccountType(body?.accountType ?? body?.account_type)
  const companyName = String(body?.companyName ?? body?.company_name ?? '').trim()
  const businessAddress = String(body?.businessAddress ?? body?.business_address ?? '').trim()
  const ensName = normalizeCannesEnsName(body?.ensName ?? body?.ens_name)
  const appPassword = String(body?.appPassword ?? body?.app_password ?? '').trim()

  if (provider !== 'metamask' && !fullName) {
    throw new Error('fullName is required.')
  }

  if ((provider === 'google' || provider === 'metamask') && appPassword.length < 8) {
    throw new Error('Password is required and must be at least 8 characters for Google/MetaMask accounts.')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error('dateOfBirth must use YYYY-MM-DD format.')
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
      throw new Error('companyName is required for business or merchant accounts.')
    }

    if (!businessAddress) {
      throw new Error('businessAddress is required for business or merchant accounts.')
    }
  }

  if (!ensName) {
    throw new Error('ensName is required.')
  }

  return {
    fullName: fullName || null,
    dateOfBirth,
    accountType,
    companyName: companyName || null,
    businessAddress: businessAddress || null,
    ensName: ensName || null,
    appPassword: appPassword || null,
  }
}

function hashAppPassword(password) {
  const normalizedPassword = String(password || '').trim()
  if (!normalizedPassword) {
    return null
  }

  const salt = crypto.randomBytes(16)
  const keyLength = 64
  const hash = crypto.scryptSync(normalizedPassword, salt, keyLength)

  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
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

async function deleteProfileByPrincipal(principalId) {
  await supabaseRestRequest(`auth_user_profiles?principal_id=eq.${encodeURIComponent(principalId)}`, {
    method: 'DELETE',
  })
}

async function deleteWalletTrackingRows(walletAddresses) {
  const uniqueWalletAddresses = Array.from(
    new Set(
      walletAddresses
        .map((walletAddress) => String(walletAddress || '').trim().toLowerCase())
        .filter((walletAddress) => /^0x[a-f0-9]{40}$/.test(walletAddress)),
    ),
  )

  for (const walletAddress of uniqueWalletAddresses) {
    await supabaseRestRequest(`wallet_users?wallet_address=eq.${encodeURIComponent(walletAddress)}`, {
      method: 'DELETE',
    })

    await supabaseRestRequest(`auth_wallet_challenges?wallet_address=eq.${encodeURIComponent(walletAddress)}`, {
      method: 'DELETE',
    })
  }
}

async function upsertProfile({ principalId, authProvider, fullName, dateOfBirth, accountType, companyName, businessAddress, email, ensName, appPasswordHash }) {
  const existingProfile = await getProfileByPrincipal(principalId)
  const nextEnsName = ensName ?? existingProfile?.ens_name ?? null

  if (!nextEnsName) {
    throw new Error('ensName is required.')
  }

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
      ens_name: nextEnsName,
      email: email || null,
      app_password_hash: appPasswordHash,
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

function getPrimaryWalletAddress(walletAddresses) {
  if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    throw new Error('walletAddresses must include at least one wallet.')
  }

  return walletAddresses.find((entry) => entry.is_primary)?.wallet_address || walletAddresses[0].wallet_address
}

function isOnlyOwnerRevert(error) {
  const message = String(error?.reason || error?.message || '').toLowerCase()
  return message.includes('only owner')
}

async function syncEnsProfileOnchain({ ownerAddress, ensName }) {
  try {
    const existingProfile = await ensRegistry.getProfile(ownerAddress)
    const hasExistingProfile = existingProfile?.owner && existingProfile.owner !== ethers.ZeroAddress

    if (!hasExistingProfile) {
      return ensRegistry.registerProfile(ownerAddress, ensName, null, '')
    }

    return ensRegistry.updateProfile(ownerAddress, ensName, existingProfile.ensNode, existingProfile.profileURI || '', existingProfile.active)
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('profile not found')) {
      return ensRegistry.registerProfile(ownerAddress, ensName, null, '')
    }

    if (isOnlyOwnerRevert(error)) {
      throw new Error('On-chain ENS sync failed: backend signer is not the ENS registry owner. Set SOLIDITY_ENS_PRIVATE_KEY to the contract owner key or transfer registry ownership to the backend signer.')
    }

    throw error
  }
}

function normalizeProfileForFrontend(profile) {
  if (!profile) {
    return null
  }

  const accountType = normalizeAccountType(profile.account_type)
  const isMerchant = accountType === 'business'

  return {
    ...profile,
    app_password_hash: undefined,
    account_type: accountType,
    accountType,
    isMerchant,
    merchantProfile: isMerchant,
  }
}

function buildOnboardingRequired(profile) {
  return !profile
    || !profile.onboarding_completed_at
    || !profile.date_of_birth
    || !profile.account_type
    || (isBusinessAccountType(profile.account_type) && (!profile.company_name || !profile.business_address))
}

function isRegisteredProfile(profile, provider) {
  if (!profile || !profile.onboarding_completed_at) {
    return false
  }

  if ((provider === 'google' || provider === 'metamask') && !profile.app_password_hash) {
    return false
  }

  return true
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
  
  authorizeUrl.searchParams.set('provider', 'google')
  authorizeUrl.searchParams.set('redirect_to', redirectTo || getOptionalEnv('GOOGLE_REDIRECT_TO', 'http://localhost:5173/auth/callback'))
  authorizeUrl.searchParams.set('response_type', 'code')
  
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

    logAuthEvent('signup.email.request', {
      email: email.trim().toLowerCase(),
      metadataKeys: metadata && typeof metadata === 'object' ? Object.keys(metadata) : [],
    })

    // Use admin API to create user and bypass email verification
    const adminData = await supabaseAdminAuthRequest('/users', {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
        user_metadata: metadata && typeof metadata === 'object' ? metadata : {},
        email_confirm: true, // Auto-confirm email to avoid rate limiting on verification emails
      },
    })

    // Now get a session for this user using the standard auth endpoint
    const sessionData = await supabaseAuthRequest('/token?grant_type=password', {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
      },
    })

    logAuthEvent('signup.email.response', {
      email: email.trim().toLowerCase(),
      hasSession: Boolean(sessionData?.access_token),
      hasUser: Boolean(adminData?.id),
      provider: 'email',
      userId: adminData?.id || null,
    })

    res.json({
      session: sessionData || null,
      user: adminData || null,
    })
  } catch (error) {
    logAuthEvent('signup.email.error', {
      email: req.body?.email ? req.body.email.trim().toLowerCase() : 'unknown',
      errorMessage: error.message,
      statusCode: error.statusCode,
      errorDetails: error.details,
    })
    const statusCode = error.statusCode || 400
    res.status(statusCode).json({ error: error.message })
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

    logAuthEvent('login.email.request', {
      email: email.trim().toLowerCase(),
    })

    const session = await supabaseAuthRequest('/token?grant_type=password', {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
      },
    })

    logAuthEvent('login.email.response', {
      email: email.trim().toLowerCase(),
      hasAccessToken: Boolean(session?.access_token),
      userId: session?.user?.id || null,
      provider: session?.user?.app_metadata?.provider || 'email',
    })

    res.json({ session })
  } catch (error) {
    const statusCode = error.statusCode || 400
    res.status(statusCode).json({ error: error.message })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body ?? {}
    if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      throw new Error('refreshToken is required')
    }

    logAuthEvent('token.refresh.request', {
      tokenLength: refreshToken.trim().length,
    })

    const session = await supabaseAuthRequest('/token?grant_type=refresh_token', {
      method: 'POST',
      body: {
        refresh_token: refreshToken.trim(),
      },
    })

    logAuthEvent('token.refresh.response', {
      hasAccessToken: Boolean(session?.access_token),
      userId: session?.user?.id || null,
      provider: session?.user?.app_metadata?.provider || 'email',
    })

    res.json({ session })
  } catch (error) {
    const statusCode = error.statusCode || 400
    res.status(statusCode).json({ error: error.message })
  }
})

router.post('/google/url', async (req, res) => {
  try {
    const redirectTo = typeof req.body?.redirectTo === 'string' && req.body.redirectTo.trim() !== ''
      ? req.body.redirectTo.trim()
      : getOptionalEnv('GOOGLE_REDIRECT_TO', 'http://localhost:5173/auth/callback')

    logAuthEvent('google.url.request', {
      redirectTo,
    })

    const url = buildOAuthUrl(redirectTo)

    logAuthEvent('google.url.response', {
      redirectTo,
      hasUrl: Boolean(url),
    })

    res.json({
      url,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body ?? {}
    const mode = req.body?.mode === 'signup' ? 'signup' : 'login'
    if (typeof code !== 'string' || code.trim() === '') {
      throw new Error('Authorization code is required')
    }

    logAuthEvent('google.callback.request', {
      codeLength: code.trim().length,
    })

    // Exchange the code for a session using Supabase token endpoint
    const session = await supabaseAuthRequest('/token?grant_type=authorization_code', {
      method: 'POST',
      body: {
        code: code.trim(),
      },
    })

    logAuthEvent('google.callback.response', {
      hasAccessToken: Boolean(session?.access_token),
      userId: session?.user?.id || null,
      provider: session?.user?.app_metadata?.provider || 'google',
      mode,
    })

    if (mode === 'login') {
      const principalId = session?.user?.id
      const profile = principalId ? await getProfileByPrincipal(principalId) : null
      if (!isRegisteredProfile(profile, 'google')) {
        const loginError = new Error('Account not registered. Please sign up first.')
        loginError.statusCode = 403
        throw loginError
      }
    }

    res.json({ session })
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message })
  }
})

router.post('/wallet/challenge', async (req, res) => {
  try {
    const address = normalizeAddress(req.body?.address)
    const chainId = Number.parseInt(String(req.body?.chainId || ''), 10)
    if (!Number.isFinite(chainId) || chainId <= 0) {
      throw new Error('chainId is required')
    }

    logAuthEvent('wallet.challenge.request', {
      address,
      chainId,
    })

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

    logAuthEvent('wallet.challenge.created', {
      address,
      chainId,
      nonce,
      expiresAt,
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
    const mode = req.body?.mode === 'signup' ? 'signup' : 'login'

    if (!nonce) {
      throw new Error('nonce is required')
    }

    if (!signature) {
      throw new Error('signature is required')
    }

    logAuthEvent('wallet.verify.request', {
      address,
      nonce,
    })

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

    if (mode === 'login') {
      const existingProfile = await getProfileByPrincipal(`wallet:${address}`)
      if (!isRegisteredProfile(existingProfile, 'metamask')) {
        const loginError = new Error('Account not registered. Please sign up first.')
        loginError.statusCode = 403
        throw loginError
      }
    }

    logAuthEvent('wallet.verify.signed', {
      address,
      nonce,
      challengeId: challenge.id,
    })

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

    logAuthEvent('wallet.verify.user_upserted', {
      address,
      walletUsersTable: 'public.wallet_users',
      lastLoginAt: new Date().toISOString(),
    })

    const secret = getRequiredEnv('WALLET_AUTH_TOKEN_SECRET')
    const ttlSeconds = parseDurationToSeconds(getOptionalEnv('WALLET_AUTH_TOKEN_TTL', '7d'), 7 * 24 * 60 * 60)
    const accessToken = signJwt({
      sub: address,
      walletAddress: address,
      authProvider: 'metamask',
      email: null,
    }, secret, ttlSeconds)

    logAuthEvent('wallet.verify.response', {
      address,
      tokenType: 'bearer',
      expiresIn: ttlSeconds,
      hasAccessToken: Boolean(accessToken),
    })

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

      logAuthEvent('me.supabase_user', {
        provider,
        userId: user.id,
        email: user.email || null,
      })
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

      logAuthEvent('me.wallet_user', {
        provider,
        userId: user.id,
        walletAddress: user.walletAddress || user.id,
      })
    }

    const principalId = provider === 'metamask' ? `wallet:${String(user.walletAddress || user.id).toLowerCase()}` : user.id
    const profile = await getProfileByPrincipal(principalId)
    const normalizedProfile = normalizeProfileForFrontend(profile)
    const walletAddresses = profile ? await getWalletAddressesByProfileId(profile.id) : []

    logAuthEvent('me.response', {
      principalId,
      provider,
      profile: summarizeProfile(normalizedProfile),
      walletAddressCount: walletAddresses.length,
      onboardingRequired: buildOnboardingRequired(normalizedProfile),
    })

    res.json({
      user: buildUserResponse({ user, provider, walletAddress: user.walletAddress || user.id }),
      profile: normalizedProfile,
      walletAddresses,
      onboardingRequired: buildOnboardingRequired(normalizedProfile),
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

      logAuthEvent('onboarding.supabase_user', {
        provider,
        userId: user.id,
        email: user.email || null,
      })
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

      logAuthEvent('onboarding.wallet_user', {
        provider,
        userId: user.id,
        walletAddress: user.walletAddress || user.id,
      })
    }

    const parsed = validateOnboardingInput(req.body, provider)
    const walletAddresses = normalizeWalletAddresses(req.body?.walletAddresses ?? req.body?.wallet_addresses)
    if (walletAddresses.length === 0) {
      throw new Error('walletAddresses must include at least one wallet.')
    }
    const primaryWalletAddress = getPrimaryWalletAddress(walletAddresses)
    const shouldSyncEnsOnchain = req.body?.syncEnsOnchain === true

    logAuthEvent('onboarding.request', {
      provider,
      principalHint: provider === 'metamask' ? `wallet:${String(user.walletAddress || user.id).toLowerCase()}` : user.id,
      fullName: parsed.fullName,
      accountType: parsed.accountType,
      walletAddressCount: walletAddresses.length,
      primaryWalletAddress,
      syncEnsOnchain: shouldSyncEnsOnchain,
    })

    if (shouldSyncEnsOnchain) {
      const chainProfile = await syncEnsProfileOnchain({
        ownerAddress: primaryWalletAddress,
        ensName: parsed.ensName,
      })

      logAuthEvent('onboarding.ens_synced', {
        provider,
        ownerAddress: primaryWalletAddress,
        ensName: parsed.ensName,
        txHash: chainProfile?.txHash || chainProfile?.transactionHash || null,
      })
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
      ensName: parsed.ensName,
      appPasswordHash: hashAppPassword(parsed.appPassword),
    })

    const linkedWallets = await replaceWalletAddresses(profile.id, walletAddresses)
    const refreshedProfile = await getProfileByPrincipal(principalId)
    const normalizedProfile = normalizeProfileForFrontend(refreshedProfile || profile)

    logAuthEvent('onboarding.response', {
      provider,
      principalId,
      profile: summarizeProfile(normalizedProfile),
      linkedWallets: linkedWallets.map(summarizeWalletAddress),
    })

    res.json({
      user: buildUserResponse({ user, provider, walletAddress: user.walletAddress || user.id }),
      profile: normalizedProfile,
      walletAddresses: linkedWallets,
      onboardingRequired: false,
    })
  } catch (error) {
    res.status(400).json({ error: mapOnboardingErrorMessage(error) })
  }
})

router.delete('/account', async (req, res) => {
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

    const walletAddress = user.walletAddress || user.id
    const principalId = provider === 'metamask' ? `wallet:${String(walletAddress).toLowerCase()}` : user.id
    const profile = await getProfileByPrincipal(principalId)
    const walletAddresses = profile ? await getWalletAddressesByProfileId(profile.id) : []
    const linkedWalletAddresses = walletAddresses.map((entry) => entry.wallet_address).filter(Boolean)

    if (provider === 'metamask') {
      linkedWalletAddresses.push(walletAddress)
    }

    if (profile) {
      await deleteProfileByPrincipal(principalId)
    }

    await deleteWalletTrackingRows(linkedWalletAddresses)

    if (provider !== 'metamask') {
      try {
        await supabaseAdminAuthRequest(`/users/${encodeURIComponent(user.id)}`, {
          method: 'DELETE',
        })
      } catch (adminDeleteError) {
        if (adminDeleteError.statusCode !== 404) {
          throw adminDeleteError
        }
      }
    }

    res.json({ ok: true })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

module.exports = {
  router,
}