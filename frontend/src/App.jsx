import { useEffect, useMemo, useState } from 'react'
import SignupAuthPanel from '@/components/auth/SignupAuthPanel'
import LoginAuthPanel from '@/components/auth/LoginAuthPanel'
import OnboardingForm from '@/components/auth/OnboardingForm'
import AuthHeader from '@/components/layout/AuthHeader'
import Dashboard from '@/components/dashboard/Dashboard'
import { Button } from '@/components/ui/button'
import { exchangeOAuthCode } from '@/lib/auth'
import { useAuth } from '@/context/useAuth'

const highlights = [
  {
    title: 'Unified Payment Flows',
    description: 'Placeholder: route users and merchants through one clean multi-step checkout product surface.',
  },
  {
    title: 'Automated Reconciliation',
    description: 'Placeholder: monitor payment state and settlement events in real time from one dashboard.',
  },
  {
    title: 'Built For Scale',
    description: 'Placeholder: support many merchants and chains without multiplying integration complexity.',
  },
]

function getRouteState() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') === 'signup' ? 'signup' : 'login'

  return {
    pathname: window.location.pathname,
    mode,
  }
}

function parseOAuthCallbackSession() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  const code = searchParams.get('code') || hashParams.get('code')
  const accessToken = hashParams.get('access_token') || searchParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token')
  const expiresInRaw = hashParams.get('expires_in') || searchParams.get('expires_in')
  const tokenType = hashParams.get('token_type') || searchParams.get('token_type') || 'bearer'
  const expiresIn = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : undefined

  if (!code) {
    if (!accessToken) {
      return null
    }

    return {
      provider: 'google',
      accessToken,
      refreshToken,
      tokenType,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    }
  }

  return {
    provider: 'google',
    code,
  }
}

function AuthenticatedWorkspace({ route, navigate }) {
  const { profileStatus, onboardingRequired, clearSession } = useAuth()

  if (route.pathname === '/auth/callback' && profileStatus !== 'ready') {
    return (
      <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(40,175,255,0.2),transparent_45%),radial-gradient(circle_at_80%_86%,rgba(255,190,92,0.24),transparent_42%)]" />
        <div className="relative mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 sm:px-6 lg:px-8">
          <div className="w-full rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Completing sign in</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Finalizing your session</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The backend returned an OAuth session. We are loading your profile and onboarding status now.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // If onboarding is not required, show the dashboard
  if (!onboardingRequired) {
    return <Dashboard />
  }

  // Otherwise show the onboarding form
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,190,92,0.26),transparent_40%),radial-gradient(circle_at_84%_14%,rgba(40,175,255,0.18),transparent_42%),radial-gradient(circle_at_50%_84%,rgba(20,189,151,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 animate-drift rounded-full bg-[#ffb95d]/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-3rem] top-44 h-80 w-80 animate-drift-delayed rounded-full bg-[#24a0ff]/20 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="animate-fade-in-up flex items-center justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.22em] text-muted-foreground">Cannes x UZH Payments</p>
            <p className="mt-2 font-display text-lg text-foreground/90">Complete Your Profile</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="px-5" onClick={() => { clearSession('Session cleared.'); navigate('/auth', 'login') }}>Switch Account</Button>
            <Button className="px-5" onClick={() => { clearSession('Session cleared.'); navigate('/auth', 'signup') }}>New Account</Button>
          </div>
        </header>

        <div className="mt-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <AuthHeader />
            </div>

            <div className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur md:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Getting Started</p>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                <p>Step 1: <span className="font-semibold text-foreground">Create your account</span></p>
                <p>Step 2: <span className="font-semibold text-foreground">Complete your profile setup</span></p>
                <p>Step 3: <span className="font-semibold text-foreground">Access your dashboard</span></p>
              </div>
            </div>
          </div>

          <div className="animate-fade-in-up animate-delay-1">
            <OnboardingForm />
          </div>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(() => getRouteState())
  const auth = useAuth()
  const { session, applySession } = auth

  const navigate = (pathname, mode) => {
    const nextPath = mode ? `${pathname}?mode=${mode}` : pathname
    window.history.pushState({}, '', nextPath)
    setRoute(getRouteState())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const callbackSession = useMemo(() => {
    if (route.pathname !== '/auth/callback' || session) {
      return null
    }

    return parseOAuthCallbackSession()
  }, [route.pathname, session])

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteState())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!callbackSession) {
      return
    }

    const handleOAuthCallback = async () => {
      try {
        let nextSession = null

        if (callbackSession.code) {
          const result = await exchangeOAuthCode(callbackSession.code, callbackSession.provider)
          nextSession = auth.normalizeAuthSessionPayload(result.session, callbackSession.provider)
        } else {
          nextSession = auth.normalizeAuthSessionPayload({
            access_token: callbackSession.accessToken,
            refresh_token: callbackSession.refreshToken,
            token_type: callbackSession.tokenType,
            expires_in: callbackSession.expiresIn,
          }, callbackSession.provider)
        }

        applySession(nextSession)
        window.history.replaceState({}, '', '/auth/callback')
      } catch (error) {
        console.error('OAuth code exchange failed:', error)
        window.history.replaceState({}, '', '/')
      }
    }

    handleOAuthCallback()
  }, [callbackSession, applySession, auth])

  if (session) {
    return <AuthenticatedWorkspace route={route} navigate={navigate} />
  }

  if (route.pathname === '/auth') {
    return (
      <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(40,175,255,0.2),transparent_45%),radial-gradient(circle_at_80%_86%,rgba(255,190,92,0.24),transparent_42%)]" />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          <header className="mb-10 flex items-center justify-between animate-fade-in-up">
            <div>
              <p className="font-display text-xs uppercase tracking-[0.22em] text-muted-foreground">Cannes x UZH Payments</p>
              <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
                {route.mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </h1>
            </div>
          </header>

          <section className="animate-fade-in-up animate-delay-1">
            {route.mode === 'signup' ? (
              <SignupAuthPanel onBack={() => navigate('/')} />
            ) : (
              <LoginAuthPanel onBack={() => navigate('/')} />
            )}
          </section>

          <div className="mt-5 animate-fade-in-up animate-delay-2 text-center text-sm text-muted-foreground">
            {route.mode === 'signup' ? 'Already have an account?' : "Don't have an account yet?"}{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => navigate('/auth', route.mode === 'signup' ? 'login' : 'signup')}
            >
              {route.mode === 'signup' ? 'Log in' : 'Sign up'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (route.pathname === '/onboarding') {
    return (
      <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(40,175,255,0.2),transparent_45%),radial-gradient(circle_at_80%_86%,rgba(255,190,92,0.24),transparent_42%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-display text-xs uppercase tracking-[0.22em] text-muted-foreground">Cannes x UZH Payments</p>
              <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Complete onboarding</h1>
            </div>
            <Button variant="outline" onClick={() => navigate('/')}>Back</Button>
          </div>
          <OnboardingForm />
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,190,92,0.26),transparent_40%),radial-gradient(circle_at_84%_14%,rgba(40,175,255,0.18),transparent_42%),radial-gradient(circle_at_50%_84%,rgba(20,189,151,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 animate-drift rounded-full bg-[#ffb95d]/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-3rem] top-44 h-80 w-80 animate-drift-delayed rounded-full bg-[#24a0ff]/20 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="animate-fade-in-up flex items-center justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.22em] text-muted-foreground">Cannes x UZH Payments</p>
            <p className="mt-2 font-display text-lg text-foreground/90">Product Preview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="px-5" onClick={() => navigate('/auth', 'login')}>Login</Button>
            <Button className="px-5" onClick={() => navigate('/auth', 'signup')}>Sign up</Button>
          </div>
        </header>

        <section className="mt-16 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-7">
            <div className="animate-fade-in-up animate-delay-1">
              <p className="mb-3 inline-flex rounded-full border border-border/80 bg-card/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
                Coming Soon
              </p>
              <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Payments Infrastructure
                <span className="block text-[#1d8ef5]">For Modern Commerce</span>
              </h1>
            </div>

            <p className="animate-fade-in-up animate-delay-2 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Placeholder intro copy: this landing page will introduce your product value, explain how merchants and users interact, and guide visitors toward account creation.
            </p>

            <div className="animate-fade-in-up animate-delay-3 flex flex-wrap gap-3">
              <Button size="lg" className="px-7" onClick={() => navigate('/auth', 'signup')}>Get started</Button>
              <Button size="lg" variant="outline" className="px-7">Book demo</Button>
            </div>
          </div>

          <aside className="animate-fade-in-up animate-delay-2 rounded-2xl border border-border/80 bg-card/75 p-6 shadow-[0_14px_40px_rgba(5,20,32,0.1)] backdrop-blur-sm">
            <p className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground">What this product offers</p>
            <div className="mt-5 space-y-4">
              {highlights.map((item, index) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/70 bg-background/70 p-4"
                  style={{ animationDelay: `${180 + index * 130}ms` }}
                >
                  <p className="font-display text-base text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
