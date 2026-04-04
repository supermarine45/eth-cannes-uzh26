import { useState } from 'react'
import JsonViewer from '@/components/shared/JsonViewer'
import { Button } from '@/components/ui/button'
import {
  getGoogleLoginUrl,
  loginWithEmail,
  requestWalletChallenge,
  signupWithEmail,
  verifyWalletSignature,
} from '@/lib/auth'
import { useAuth } from '@/context/useAuth'

const shell = 'rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur md:p-7'
const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40'
function getBestInjectedProvider() {
  if (!window.ethereum) {
    return null
  }

  const providers = Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0
    ? window.ethereum.providers
    : [window.ethereum]

  return providers.find((provider) => provider?.isMetaMask) ?? null
}

export default function AuthPanel() {
  const { session, user, applySession, clearSession, fetchUser, normalizeAuthSessionPayload } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingAction, setLoadingAction] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const runAction = async (actionName, fn) => {
    setLoadingAction(actionName)
    setError('')
    setResult(null)

    try {
      await fn()
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleSignup = async () => {
    await runAction('signup', async () => {
      const data = await signupWithEmail({
        email: email.trim(),
        password,
      })

      if (data?.session?.access_token) {
        const nextSession = normalizeAuthSessionPayload(data.session, 'email')
        applySession(nextSession)
        await fetchUser(nextSession)
      }

      setResult(data)
    })
  }

  const handleEmailLogin = async () => {
    await runAction('login', async () => {
      const data = await loginWithEmail({
        email: email.trim(),
        password,
      })

      const nextSession = normalizeAuthSessionPayload(data.session, 'email')
      applySession(nextSession)
      await fetchUser(nextSession)
      setResult(data)
    })
  }

  const handleGoogleLogin = async () => {
    await runAction('google', async () => {
      const redirectTo = `${window.location.origin}/auth/callback`
      const data = await getGoogleLoginUrl({ redirectTo })
      if (!data?.url) {
        throw new Error('Google login URL was not returned by backend.')
      }

      window.location.href = data.url
    })
  }

  const handleMetamaskLogin = async () => {
    await runAction('metamask', async () => {
      const provider = getBestInjectedProvider()
      if (!provider) {
        throw new Error('MetaMask is required. Please install or unlock MetaMask to continue.')
      }

      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const walletAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : ''
      const chainIdHex = await provider.request({ method: 'eth_chainId' })
      const connectedChainId = Number.parseInt(chainIdHex, 16)

      if (!walletAddress) {
        throw new Error('Wallet address not available. Connect MetaMask first.')
      }

      const challenge = await requestWalletChallenge({
        address: walletAddress,
        chainId: connectedChainId,
      })

      let signature = ''
      try {
        signature = await provider.request({
          method: 'personal_sign',
          params: [challenge.message, walletAddress],
        })
      } catch {
        signature = await provider.request({
          method: 'personal_sign',
          params: [walletAddress, challenge.message],
        })
      }

      const verified = await verifyWalletSignature({
        address: walletAddress,
        nonce: challenge.nonce,
        signature,
      })

      applySession({
        provider: 'metamask',
        tokenType: verified.tokenType,
        accessToken: verified.accessToken,
        expiresIn: verified.expiresIn,
        user: verified.user,
        createdAt: new Date().toISOString(),
      })
      await fetchUser({ provider: 'metamask', user: verified.user, accessToken: verified.accessToken })
      setResult(verified)
    })
  }

  const handleGetProfile = async () => {
    await runAction('profile', async () => {
      if (!session?.accessToken) {
        throw new Error('No active session token found.')
      }

      if (session.provider === 'metamask') {
        setResult({
          message: 'MetaMask session token is backend-issued; no Supabase /me profile to fetch.',
          user,
        })
        return
      }

      const meUser = await fetchUser(session)
      const me = { user: meUser }
      setResult(me)
    })
  }

  const handleLogout = () => {
    clearSession('Session cleared from auth panel.')
    setResult({ message: 'Local session cleared.' })
    setError('')
  }

  return (
    <section className={shell}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Authentication Methods</p>
          <h2 className="mt-2 text-left text-2xl font-semibold tracking-tight text-foreground">Login with Email, Google, or MetaMask</h2>
          <p className="mt-2 max-w-2xl text-left text-sm text-muted-foreground">Use your Supabase backend endpoints to sign up, sign in, and persist session tokens locally in the browser.</p>
        </div>
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {session ? `Active: ${session.provider}` : 'No active session'}
        </span>
      </div>

      <form className="mt-4 grid gap-4 text-left md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label className={label} htmlFor="authEmail">Email (Gmail works)</label>
          <input
            id="authEmail"
            className={input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@gmail.com"
          />
        </div>

        <div>
          <label className={label} htmlFor="authPassword">Password</label>
          <input
            id="authPassword"
            type="password"
            className={input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="your password"
          />
        </div>

        <div className="md:col-span-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button
            type="button"
            onClick={handleSignup}
            variant="secondary"
            disabled={loadingAction !== ''}
          >
            {loadingAction === 'signup' ? 'Signing up...' : 'Sign up with Email'}
          </Button>

          <Button
            type="button"
            onClick={handleEmailLogin}
            disabled={loadingAction !== ''}
          >
            {loadingAction === 'login' ? 'Logging in...' : 'Login with Email'}
          </Button>

          <Button
            type="button"
            onClick={handleGoogleLogin}
            variant="outline"
            disabled={loadingAction !== ''}
          >
            {loadingAction === 'google' ? 'Redirecting...' : 'Login with Google'}
          </Button>

          <Button
            type="button"
            onClick={handleMetamaskLogin}
            variant="outline"
            disabled={loadingAction !== ''}
          >
            {loadingAction === 'metamask' ? 'Signing...' : 'Login with MetaMask'}
          </Button>

          <Button
            type="button"
            onClick={handleGetProfile}
            variant="secondary"
            disabled={loadingAction !== ''}
          >
            {loadingAction === 'profile' ? 'Loading...' : 'Get Profile'}
          </Button>

          <Button
            type="button"
            onClick={handleLogout}
            variant="destructive"
            disabled={loadingAction !== ''}
          >
            Clear Session
          </Button>
        </div>
      </form>

      <p className="mt-4 text-left text-xs text-muted-foreground">MetaMask sign-in requests wallet access directly from the browser extension.</p>

      {session ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-left text-xs text-foreground">
          Active session provider: <span className="font-semibold">{session.provider}</span>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive">{error}</p> : null}
      {result ? <JsonViewer value={result} /> : null}
    </section>
  )
}
