import { useEffect, useState } from 'react'
import SignupAuthPanel from '@/components/auth/SignupAuthPanel'
import LoginAuthPanel from '@/components/auth/LoginAuthPanel'
import { Button } from '@/components/ui/button'

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

export default function App() {
  const [route, setRoute] = useState(() => getRouteState())

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteState())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (pathname, mode) => {
    const nextPath = mode ? `${pathname}?mode=${mode}` : pathname
    window.history.pushState({}, '', nextPath)
    setRoute(getRouteState())
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
