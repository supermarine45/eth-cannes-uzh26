import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAuthMe, refreshAuthSession, submitAuthOnboarding } from '@/lib/auth'
import { AuthContext } from './auth-context'

const sessionKey = 'auth_session_v1'
const refreshSkewMs = 60 * 1000

function loadStoredSession() {
  try {
    const raw = window.localStorage.getItem(sessionKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistSession(session) {
  window.localStorage.setItem(sessionKey, JSON.stringify(session))
}

function clearPersistedSession() {
  window.localStorage.removeItem(sessionKey)
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0
}

function computeExpiresAt(session) {
  const createdAtMs = Date.parse(session?.createdAt || '')
  const ttlMs = Number(session?.expiresIn) * 1000

  if (!isFinitePositiveNumber(createdAtMs) || !isFinitePositiveNumber(ttlMs)) {
    return null
  }

  return createdAtMs + ttlMs
}

function parseJwtPayload(token) {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) {
    return null
  }

  try {
    const base64Url = token.split('.')[1]
    const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const decoded = window.atob(padded)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function deriveUserFromSession(session) {
  if (!session) {
    return null
  }

  if (session.provider === 'metamask') {
    return session.user ?? null
  }

  const payload = parseJwtPayload(session.accessToken)
  if (!payload) {
    return null
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    user_metadata: payload.user_metadata ?? {},
  }
}

function normalizeAuthSessionPayload(payload, provider = 'email') {
  if (!payload?.access_token) {
    throw new Error('Auth response missing access_token')
  }

  return {
    provider,
    tokenType: payload.token_type || 'bearer',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    createdAt: new Date().toISOString(),
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadStoredSession())
  const [user, setUser] = useState(() => deriveUserFromSession(loadStoredSession()))
  const [profile, setProfile] = useState(null)
  const [walletAddresses, setWalletAddresses] = useState([])
  const [profileStatus, setProfileStatus] = useState(() => (loadStoredSession() ? 'loading' : 'idle'))
  const [authError, setAuthError] = useState('')

  const clearSession = useCallback((reason = '') => {
    clearPersistedSession()
    setSession(null)
    setUser(null)
    setProfile(null)
    setWalletAddresses([])
    setProfileStatus('idle')
    setAuthError(reason)
  }, [])

  const applySession = useCallback((nextSession) => {
    persistSession(nextSession)
    setSession(nextSession)
    setUser(deriveUserFromSession(nextSession))
    setProfile(null)
    setWalletAddresses([])
    setProfileStatus('loading')
    setAuthError('')
  }, [])

  const fetchUser = useCallback(async (targetSession = session) => {
    if (!targetSession?.accessToken) {
      setUser(null)
      setProfile(null)
      setWalletAddresses([])
      setProfileStatus('idle')
      return null
    }

    setProfileStatus('loading')
    const profile = await getAuthMe(targetSession.accessToken)
    const resolvedUser = profile?.user ?? deriveUserFromSession(targetSession)
    setUser(resolvedUser)
    setProfile(profile?.profile ?? null)
    setWalletAddresses(profile?.walletAddresses ?? [])
    setProfileStatus('ready')
    return resolvedUser
  }, [session])

  const saveOnboarding = useCallback(async (payload) => {
    if (!session?.accessToken) {
      throw new Error('No active session found.')
    }

    const response = await submitAuthOnboarding(session.accessToken, payload)
    setProfile(response?.profile ?? null)
    setWalletAddresses(response?.walletAddresses ?? [])
    setProfileStatus('ready')
    if (response?.user) {
      setUser(response.user)
    }
    return response
  }, [session])

  const refreshSession = useCallback(async (targetSession = session) => {
    const activeSession = targetSession ?? session
    if (!activeSession || activeSession.provider === 'metamask') {
      return activeSession
    }

    if (!activeSession.refreshToken) {
      clearSession('Session expired. Please sign in again.')
      return null
    }

    try {
      const refreshed = await refreshAuthSession(activeSession.refreshToken)
      const payload = refreshed?.session ?? refreshed
      const nextSession = normalizeAuthSessionPayload(payload, activeSession.provider)
      applySession(nextSession)
      return nextSession
    } catch (error) {
      clearSession('Session expired and refresh failed. Please sign in again.')
      throw error
    }
  }, [session, applySession, clearSession])

  useEffect(() => {
    if (!session?.accessToken) {
      return
    }

    let isCancelled = false

    const loadProfile = async () => {
      try {
        await fetchUser(session)
      } catch (error) {
        if (!isCancelled) {
          clearSession(error.message)
        }
      }
    }

    void loadProfile()

    return () => {
      isCancelled = true
    }
  }, [session, fetchUser, clearSession])

  useEffect(() => {
    if (!session) {
      return
    }

    const expiresAt = computeExpiresAt(session)
    if (!expiresAt) {
      return
    }

    let refreshTimer = null
    const shouldRefresh = session.provider !== 'metamask' && Boolean(session.refreshToken)
    if (shouldRefresh) {
      const msUntilRefresh = expiresAt - Date.now() - refreshSkewMs
      refreshTimer = window.setTimeout(() => {
        refreshSession(session).catch(() => {
          // refreshSession handles cleanup when refresh fails.
        })
      }, Math.max(msUntilRefresh, 0))
    }

    const logoutTimer = window.setTimeout(() => {
      clearSession('Session expired. You were logged out automatically.')
    }, Math.max(expiresAt - Date.now(), 0))

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }
      window.clearTimeout(logoutTimer)
    }
  }, [session, clearSession, refreshSession])

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      walletAddresses,
      profileStatus,
      onboardingRequired: Boolean(
        session
        && profileStatus !== 'idle'
        && (
          !profile
          || !profile.onboarding_completed_at
          || !profile.date_of_birth
          || !profile.account_type
          || (profile.account_type === 'business' && (!profile.company_name || !profile.business_address))
        )
      ),
      authError,
      applySession,
      clearSession,
      refreshSession,
      fetchUser,
      normalizeAuthSessionPayload,
      saveOnboarding,
    }),
    [session, user, profile, walletAddresses, profileStatus, authError, applySession, clearSession, refreshSession, fetchUser, saveOnboarding],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
