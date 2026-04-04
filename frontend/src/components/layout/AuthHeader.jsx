import { useMemo } from 'react'
import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'

function formatExpiry(session) {
  if (!session?.createdAt || !session?.expiresIn) {
    return 'unknown'
  }

  const expiresAt = Date.parse(session.createdAt) + Number(session.expiresIn) * 1000
  if (!Number.isFinite(expiresAt)) {
    return 'unknown'
  }

  return new Date(expiresAt).toLocaleString()
}

export default function AuthHeader() {
  const { session, user, clearSession } = useAuth()

  const displayName = useMemo(() => {
    if (!session) {
      return 'Guest'
    }

    if (session.provider === 'metamask') {
      return user?.walletAddress || user?.wallet_address || 'Wallet user'
    }

    return user?.email || user?.user_metadata?.name || 'Authenticated user'
  }, [session, user])

  return (
    <header className="mb-6 rounded-3xl border border-border/70 bg-card/90 p-6 text-left shadow-sm backdrop-blur md:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Authentication Console</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Access WalletConnect Payments
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Authenticate with email, Google, or MetaMask to manage wallet-connected payment flows.
          </p>
        </div>

        <nav className="w-full rounded-2xl border border-border/80 bg-background/70 p-4 text-xs text-foreground md:w-[320px]">
          <p className="mb-1 font-medium text-muted-foreground">Session Overview</p>
          <p>User: <span className="font-semibold">{displayName}</span></p>
          <p>Provider: <span className="font-semibold">{session?.provider || 'none'}</span></p>
          <p>Token expires: <span className="font-semibold">{formatExpiry(session)}</span></p>
          {session ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => clearSession('Session cleared from header.')}
              className="mt-3"
            >
              Logout
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
