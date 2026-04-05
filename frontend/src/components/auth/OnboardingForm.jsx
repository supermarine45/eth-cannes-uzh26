import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/useAuth'
import { normalizeCannesEnsName, registerEnsProfileWithMetaMask } from '@/lib/ens'

const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40'

function getBestInjectedProvider() {
  if (!window.ethereum) {
    return null
  }

  if (window.ethereum?.isMetaMask) {
    return window.ethereum
  }

  const providers = Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0
    ? window.ethereum.providers
    : [window.ethereum]

  return providers.find((provider) => provider?.isMetaMask)
    ?? providers.find((provider) => typeof provider?.request === 'function')
    ?? null
}

const TOKEN_CONFIG_BY_CHAIN = {
  1: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  ],
  11155111: [
    { symbol: 'USDC', address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', decimals: 6 },
    { symbol: 'WETH', address: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', decimals: 18 },
  ],
}

function formatUnitsFromBigInt(rawValue, decimals = 18, precision = 6) {
  const value = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue)
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base

  if (fraction === 0n) {
    return whole.toString()
  }

  const padded = fraction.toString().padStart(decimals, '0').slice(0, precision)
  const trimmed = padded.replace(/0+$/, '')
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString()
}

async function readErc20Balance(provider, tokenAddress, walletAddress) {
  const methodSelector = '70a08231'
  const encodedAddress = walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const data = `0x${methodSelector}${encodedAddress}`

  const result = await provider.request({
    method: 'eth_call',
    params: [{ to: tokenAddress, data }, 'latest'],
  })

  if (!result || result === '0x') {
    return 0n
  }

  return BigInt(result)
}

async function fetchWalletBalances(provider, walletAddress, chainIdNumber) {
  const nativeHex = await provider.request({
    method: 'eth_getBalance',
    params: [walletAddress, 'latest'],
  })
  const nativeBalance = BigInt(nativeHex || '0x0')
  const nativeSymbol = chainIdNumber === 137 ? 'MATIC' : 'ETH'

  const balances = [{
    symbol: nativeSymbol,
    amount: formatUnitsFromBigInt(nativeBalance, 18),
    raw: nativeBalance,
  }]

  const tokenConfig = TOKEN_CONFIG_BY_CHAIN[chainIdNumber] ?? []
  for (const token of tokenConfig) {
    try {
      const rawBalance = await readErc20Balance(provider, token.address, walletAddress)
      balances.push({
        symbol: token.symbol,
        amount: formatUnitsFromBigInt(rawBalance, token.decimals),
        raw: rawBalance,
      })
    } catch {
      balances.push({
        symbol: token.symbol,
        amount: 'unavailable',
        raw: null,
      })
    }
  }

  return balances
}

function normalizeAddress(value) {
  const trimmed = String(value || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error('Enter a valid Ethereum wallet address.')
  }

  return trimmed.toLowerCase()
}

function sanitizeCannesUsername(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized
    // .replace(/\.cannes$/i, '')
    .split('.')[0]
    .replace(/[^a-z0-9]/g, '')
}

function resolvePrefillName({ profile, session, user }) {
  if (profile?.full_name) {
    return profile.full_name
  }

  const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name
  if (metadataName) {
    return metadataName
  }

  if (session?.provider === 'metamask') {
    const walletAddress = session?.user?.walletAddress || user?.walletAddress
    if (walletAddress) {
      return `Wallet user ${String(walletAddress).slice(0, 8)}`
    }
  }

  return ''
}

function validateAdultDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date of birth must use YYYY-MM-DD format.')
  }

  const dob = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(dob.getTime())) {
    throw new Error('Date of birth is invalid.')
  }

  const today = new Date()
  const threshold = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()))
  if (dob > threshold) {
    throw new Error('You must be at least 18 years old to continue.')
  }
}

export default function OnboardingForm() {
  const { session, user, profile, walletAddresses, saveOnboarding } = useAuth()
  const isMetaMaskSignup = session?.provider === 'metamask'
  const requiresAppPassword = session?.provider === 'google' || session?.provider === 'metamask'
  const [fullName, setFullName] = useState('')
  const [emailAddress, setEmailAddress] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [confirmAppPassword, setConfirmAppPassword] = useState('')
  const [ensUsername, setEnsUsername] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [accountType, setAccountType] = useState('individual')
  const [companyName, setCompanyName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [walletAddressInput, setWalletAddressInput] = useState('')
  const [walletLabelInput, setWalletLabelInput] = useState('')
  const [wallets, setWallets] = useState([])
  const [walletsHydrated, setWalletsHydrated] = useState(false)
  const [balances, setBalances] = useState([])
  const [balanceChainId, setBalanceChainId] = useState(null)
  const [balanceAddress, setBalanceAddress] = useState('')
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [balanceError, setBalanceError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadBalances = async (provider, walletAddress) => {
    setIsLoadingBalances(true)
    setBalanceError('')

    try {
      const chainIdHex = await provider.request({ method: 'eth_chainId' })
      const chainIdNumber = Number.parseInt(chainIdHex, 16)
      const nextBalances = await fetchWalletBalances(provider, walletAddress, chainIdNumber)
      setBalanceChainId(chainIdNumber)
      setBalanceAddress(walletAddress.toLowerCase())
      setBalances(nextBalances)
    } catch (balanceLoadError) {
      setBalances([])
      setBalanceError(balanceLoadError.message || 'Unable to load wallet balances.')
    } finally {
      setIsLoadingBalances(false)
    }
  }

  useEffect(() => {
    if (profile && !walletsHydrated) {
      setFullName(isMetaMaskSignup ? '' : resolvePrefillName({ profile, session, user }))
      setEmailAddress(String(profile.email || user?.email || session?.user?.email || '').trim())
      setDateOfBirth(profile.date_of_birth ?? '')
      setEnsUsername((profile.ensUsername ?? ''))
      setAccountType(profile.account_type ?? 'individual')
      setCompanyName(profile.company_name ?? '')
      setBusinessAddress(profile.business_address ?? '')
      setWallets(
        (walletAddresses ?? []).map((entry, index) => ({
          address: entry.wallet_address,
          label: entry.label ?? '',
          isPrimary: Boolean(entry.is_primary) || index === 0,
        })),
      )
      setWalletsHydrated(true)
      return
    }

    if (!profile && !walletsHydrated && session?.provider === 'metamask' && session?.user?.walletAddress) {
      setWallets([
        {
          address: String(session.user.walletAddress).toLowerCase(),
          label: 'Connected wallet',
          isPrimary: true,
        },
      ])
      setEmailAddress(String(user?.email || session?.user?.email || '').trim())
      setWalletsHydrated(true)
    }
    if (!profile && !walletsHydrated) {
      setFullName(isMetaMaskSignup ? '' : resolvePrefillName({ profile, session, user }))
      if (!isMetaMaskSignup) {
        setEmailAddress(String(user?.email || session?.user?.email || '').trim())
      }
      setWalletsHydrated(true)
    }
  }, [isMetaMaskSignup, profile, walletAddresses, session, user, walletsHydrated])

  const addWallet = (address, labelValue = '', makePrimary = false) => {
    const normalized = normalizeAddress(address)
    setWallets((current) => {
      if (current.some((entry) => entry.address === normalized)) {
        return current.map((entry) => ({
          ...entry,
          isPrimary: makePrimary ? entry.address === normalized : entry.isPrimary,
        }))
      }

      const next = current.map((entry) => ({
        ...entry,
        isPrimary: makePrimary ? false : entry.isPrimary,
      }))

      next.push({
        address: normalized,
        label: labelValue.trim(),
        isPrimary: makePrimary || next.length === 0,
      })

      return next
    })
  }

  const handleConnectWallet = async () => {
    setError('')
    setBalanceError('')
    const provider = getBestInjectedProvider()
    if (!provider) {
      setError('MetaMask is required. Please install or unlock MetaMask to continue.')
      return
    }

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const walletAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : ''
      if (!walletAddress) {
        throw new Error('No wallet address was returned by the connected wallet.')
      }

      addWallet(walletAddress, 'Connected wallet', true)
      await loadBalances(provider, walletAddress)
    } catch (walletError) {
      setError(walletError.message)
    }
  }

  const handleAddWallet = () => {
    setError('')
    try {
      addWallet(walletAddressInput, walletLabelInput, wallets.length === 0)
      setWalletAddressInput('')
      setWalletLabelInput('')
    } catch (walletError) {
      setError(walletError.message)
    }
  }

  const handleRemoveWallet = (address) => {
    setWallets((current) => current.filter((entry) => entry.address !== address))
  }

  const handleSetPrimary = (address) => {
    setWallets((current) => current.map((entry) => ({
      ...entry,
      isPrimary: entry.address === address,
    })))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (!isMetaMaskSignup && !fullName.trim()) {
        throw new Error('Name is required.')
      }

      if (isMetaMaskSignup && !emailAddress.trim()) {
        throw new Error('Email address is required for MetaMask signups.')
      }

      if (requiresAppPassword) {
        if (!appPassword || appPassword.length < 8) {
          throw new Error('Password must be at least 8 characters.')
        }

        if (appPassword !== confirmAppPassword) {
          throw new Error('Password confirmation does not match.')
        }
      }

      validateAdultDateOfBirth(dateOfBirth)

      if (accountType === 'business') {
        if (!companyName.trim()) {
          throw new Error('Company name is required for business accounts.')
        }

        if (!businessAddress.trim()) {
          throw new Error('Business address is required for business accounts.')
        }
      }

      if (wallets.length === 0) {
        throw new Error('Connect at least one wallet address before continuing.')
      }

      const normalizedEnsName = normalizeCannesEnsName(ensName)
      const primaryWallet = wallets.find((entry) => entry.isPrimary)?.address || wallets[0]?.address

      if (!primaryWallet) {
        throw new Error('Primary wallet is required to register ENS on-chain.')
      }

      const injectedProvider = getBestInjectedProvider()
      if (!injectedProvider) {
        throw new Error('No injected wallet provider found. Install/unlock MetaMask and reload this page to register ENS on-chain.')
      }

      await injectedProvider.request({ method: 'eth_requestAccounts' })

      // Register ENS profile via MetaMask
      if (normalizedEnsName) {
        await registerEnsProfileWithMetaMask({
          ethereumProvider: injectedProvider,
          ensName: normalizedEnsName,
          profileURI: '',
          expectedOwnerAddress: primaryWallet,
        })
      }

      await saveOnboarding({
        syncEnsOnchain: false,
        authProvider: session?.provider,
        fullName: isMetaMaskSignup ? null : fullName,
        dateOfBirth,
        ensName: normalizedEnsName,
        accountType,
        companyName: accountType === 'business' ? companyName : null,
        businessAddress: accountType === 'business' ? businessAddress : null,
        email: isMetaMaskSignup ? emailAddress.trim() : (user?.email || session?.user?.email || emailAddress.trim() || null),
        appPassword: requiresAppPassword ? appPassword : null,
        walletAddresses: wallets.map((entry, index) => ({
          address: entry.address,
          label: entry.label,
          isPrimary: entry.isPrimary || index === 0,
        })),
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur md:p-7">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">First-time setup</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Complete your profile</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Add the details you want stored in Supabase and connect the wallet addresses you want linked to this account.
        </p>
      </div>

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        {isMetaMaskSignup ? (
          <div>
            <label className={label} htmlFor="emailAddress">Email address</label>
            <input
              id="emailAddress"
              type="email"
              className={input}
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
        ) : (
          <div>
            <label className={label} htmlFor="fullName">Name</label>
            <input id="fullName" className={input} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Jane Doe" />
          </div>
        )}

        <div>
          <label className={label} htmlFor="dateOfBirth">Date of birth</label>
          <input id="dateOfBirth" type="date" className={input} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </div>

        <div>
          <label className={label} htmlFor="ensName">Cool Username</label>
          <div className="relative">
            <input
              id="ensName"
              className={`${input} pr-24`}
              value={ensUsername}
              onChange={(event) => setEnsUsername(sanitizeCannesUsername(event.target.value))}
              placeholder="username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
            {ensUsername ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                .cannes
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Must!!</p>
        </div>

        {requiresAppPassword ? (
          <>
            <div>
              <label className={label} htmlFor="appPassword">Password</label>
              <input
                id="appPassword"
                type="password"
                className={input}
                value={appPassword}
                onChange={(event) => setAppPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">Used as your app password for this account.</p>
            </div>

            <div>
              <label className={label} htmlFor="confirmAppPassword">Confirm password</label>
              <input
                id="confirmAppPassword"
                type="password"
                className={input}
                value={confirmAppPassword}
                onChange={(event) => setConfirmAppPassword(event.target.value)}
                placeholder="Re-enter password"
                minLength={8}
                required
              />
            </div>
          </>
        ) : null}

        <div className="md:col-span-2">
          <label className={label}>Account type</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={accountType === 'individual' ? 'default' : 'outline'}
              onClick={() => setAccountType('individual')}
            >
              Individual
            </Button>
            <Button
              type="button"
              variant={accountType === 'business' ? 'default' : 'outline'}
              onClick={() => setAccountType('business')}
            >
              Business
            </Button>
          </div>
          
        </div>

        {accountType === 'business' ? (
          <>
            <div>
              <label className={label} htmlFor="companyName">Company name</label>
              <input
                id="companyName"
                className={input}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Acme Payments Ltd"
              />
            </div>

            <div>
              <label className={label} htmlFor="businessAddress">Business address</label>
              <input
                id="businessAddress"
                className={input}
                value={businessAddress}
                onChange={(event) => setBusinessAddress(event.target.value)}
                placeholder="Street, City, Country"
              />
            </div>
          </>
        ) : null}

        <div className="md:col-span-2 rounded-2xl border border-border bg-muted/25 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Wallet addresses</h3>
              <p className="text-sm text-muted-foreground">Connect the wallets you want linked to this profile.</p>
            </div>
            <Button type="button" variant="outline" onClick={handleConnectWallet}>
              Connect Wallet
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              className={input}
              value={walletAddressInput}
              onChange={(event) => setWalletAddressInput(event.target.value)}
              placeholder="0x..."
            />
            <input
              className={input}
              value={walletLabelInput}
              onChange={(event) => setWalletLabelInput(event.target.value)}
              placeholder="Label, e.g. trading wallet"
            />
            <Button type="button" variant="secondary" onClick={handleAddWallet}>
              Add Address
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wallet addresses added yet.</p>
            ) : wallets.map((entry) => (
              <div key={entry.address} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-mono text-sm text-foreground">{entry.address}</p>
                  <p className="text-xs text-muted-foreground">{entry.label || 'Wallet address'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.isPrimary ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Primary</span>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => handleSetPrimary(entry.address)}>
                      Make primary
                    </Button>
                  )}
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleRemoveWallet(entry.address)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Connected wallet balances</p>
              {isLoadingBalances ? <span className="text-xs text-muted-foreground">Refreshing...</span> : null}
            </div>
            {balanceAddress ? (
              <p className="mb-3 font-mono text-xs text-muted-foreground">{balanceAddress} {balanceChainId ? `(chain ${balanceChainId})` : ''}</p>
            ) : null}
            {balanceError ? <p className="text-xs text-destructive">{balanceError}</p> : null}
            {!balanceError && balances.length === 0 ? (
              <p className="text-xs text-muted-foreground">Connect MetaMask to load balances.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {balances.map((entry) => (
                  <div key={entry.symbol} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{entry.symbol}</p>
                    <p className="text-sm font-semibold text-foreground">{entry.amount}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error ? (
          <p className="md:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving profile...' : 'Complete setup'}
          </Button>
        </div>
      </form>
    </section>
  )
}
