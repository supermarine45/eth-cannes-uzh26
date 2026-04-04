import { useEffect, useState } from 'react'
import { useAuth } from '@/context/useAuth'

export default function WalletBalanceTab() {
  const { walletAddresses, profile } = useAuth()
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate balance loading
    setLoading(false)
  }, [walletAddresses])

  const primaryWallet = walletAddresses?.find((w) => w.is_primary) || walletAddresses?.[0]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Wallet Balances</h2>
        <p className="mt-1 text-sm text-muted-foreground">View and manage your cryptocurrency balances across connected wallets.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading wallet information...</p>
        </div>
      ) : walletAddresses && walletAddresses.length > 0 ? (
        <div className="space-y-4">
          {walletAddresses.map((wallet) => (
            <div key={wallet.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium text-foreground">{wallet.wallet_address}</p>
                  {wallet.label && <p className="mt-1 text-xs text-muted-foreground">{wallet.label}</p>}
                  {wallet.is_primary && (
                    <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      Primary Wallet
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Balance loading</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No wallets connected yet. Add a wallet in Settings to get started.</p>
        </div>
      )}
    </div>
  )
}
