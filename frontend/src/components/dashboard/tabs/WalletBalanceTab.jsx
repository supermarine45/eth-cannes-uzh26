import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/useAuth'

function formatNativeBalance(rawHex) {
  const value = BigInt(rawHex || '0x0')
  const base = 10n ** 18n
  const whole = value / base
  const fraction = value % base

  if (fraction === 0n) {
    return `${whole.toString()} ETH`
  }

  const trimmedFraction = fraction.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '')
  return `${whole.toString()}${trimmedFraction ? `.${trimmedFraction}` : ''} ETH`
}

function maskWalletAddress(address) {
  const value = String(address || '').trim()
  if (value.length <= 11) {
    return value
  }

  return `${value.slice(0, 6)}...${value.slice(-5)}`
}

export default function WalletBalanceTab() {
  const { walletAddresses } = useAuth()
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chainId, setChainId] = useState(null)
  const [copiedAddress, setCopiedAddress] = useState('')

  const handleCopyAddress = async (walletAddress) => {
    if (!walletAddress) {
      return
    }

    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopiedAddress(walletAddress)
      window.setTimeout(() => {
        setCopiedAddress((current) => (current === walletAddress ? '' : current))
      }, 1600)
    } catch {
      setError('Unable to copy wallet address. Please allow clipboard permission.')
    }
  }

  useEffect(() => {
    let isCancelled = false

    const loadBalances = async () => {
      if (!walletAddresses || walletAddresses.length === 0) {
        if (!isCancelled) {
          setBalances({})
          setError('')
          setLoading(false)
        }
        return
      }

      const provider = window.ethereum
      if (!provider) {
        if (!isCancelled) {
          setBalances({})
          setError('No wallet provider detected. Install or unlock MetaMask to load balances.')
          setLoading(false)
        }
        return
      }

      if (!isCancelled) {
        setLoading(true)
        setError('')
      }

      try {
        const nextBalances = {}
        const chainIdHex = await provider.request({ method: 'eth_chainId' })
        const parsedChainId = Number.parseInt(chainIdHex, 16)
        if (!isCancelled) {
          setChainId(Number.isFinite(parsedChainId) ? parsedChainId : null)
        }

        for (const wallet of walletAddresses) {
          const walletAddress = wallet.wallet_address || wallet.address
          if (!walletAddress) {
            continue
          }

          try {
            const rawBalance = await provider.request({
              method: 'eth_getBalance',
              params: [walletAddress, 'latest'],
            })
            nextBalances[walletAddress] = formatNativeBalance(rawBalance)
          } catch {
            nextBalances[walletAddress] = 'Unavailable'
          }
        }

        if (!isCancelled) {
          setBalances(nextBalances)
        }
      } catch (balanceError) {
        if (!isCancelled) {
          setBalances({})
          setError(balanceError.message || 'Unable to load wallet balances.')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void loadBalances()

    return () => {
      isCancelled = true
    }
  }, [walletAddresses])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Wallet Balances</h2>
        <p className="mt-1 text-sm text-muted-foreground">View and manage your cryptocurrency balances across connected wallets.</p>
        {chainId ? <p className="mt-1 text-xs text-muted-foreground">Active chain: {chainId}</p> : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading wallet information...</p>
        </div>
      ) : walletAddresses && walletAddresses.length > 0 ? (
        <div className="space-y-4">
          {walletAddresses.map((wallet) => {
            const walletAddress = wallet.wallet_address || wallet.address

            return (
              <div key={wallet.id || walletAddress} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-medium text-foreground">{maskWalletAddress(walletAddress)}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleCopyAddress(walletAddress)}>
                        {copiedAddress === walletAddress ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    {wallet.label && <p className="mt-1 text-xs text-muted-foreground">{wallet.label}</p>}
                    {wallet.is_primary && (
                      <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        Primary Wallet
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{balances[walletAddress] || 'Unavailable'}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No wallets connected yet. Add a wallet in Settings to get started.</p>
        </div>
      )}
    </div>
  )
}
