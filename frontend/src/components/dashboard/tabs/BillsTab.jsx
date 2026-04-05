import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

const BASE_CHAIN_ID = '0x2105'
const USDC_BASE   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_DECIMALS = 6

// All tokens we support scanning + routing through on Base
const SUPPORTED_TOKENS = [
  { symbol: 'USDC', isNative: false, address: USDC_BASE,                                     decimals: 6  },
  { symbol: 'ETH',  isNative: true,  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'WETH', isNative: false, address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'DAI',  isNative: false, address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  { symbol: 'cbETH',isNative: false, address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
]

// ─── helpers ────────────────────────────────────────────────────────────────

function encodeUSDCTransfer(toAddress, amountUSD) {
  const selector  = 'a9059cbb'
  const paddedTo  = toAddress.slice(2).toLowerCase().padStart(64, '0')
  const amountRaw = BigInt(Math.round(amountUSD * 10 ** USDC_DECIMALS))
  return `0x${selector}${paddedTo}${amountRaw.toString(16).padStart(64, '0')}`
}

async function getERC20Balance(tokenAddress, walletAddress) {
  const data   = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
  const result = await window.ethereum.request({
    method: 'eth_call',
    params: [{ to: tokenAddress, data }, 'latest'],
  })
  return BigInt(result || '0x0')
}

function formatAmt(rawBigInt, decimals, places = 6) {
  const div  = 10n ** BigInt(decimals)
  const whole = rawBigInt / div
  const frac  = (rawBigInt % div).toString().padStart(decimals, '0').slice(0, places).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

async function ensureBase() {
  const chain = await window.ethereum.request({ method: 'eth_chainId' })
  if (chain === BASE_CHAIN_ID) return
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID }] })
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }],
      })
    } else throw new Error('Switch MetaMask to Base network.')
  }
}

// Scan balances for all supported tokens, returns [{ symbol, balance (string), raw (BigInt) }]
async function scanAllBalances(walletAddress) {
  const results = await Promise.allSettled(
    SUPPORTED_TOKENS.map(async (t) => {
      let raw
      if (t.isNative) {
        const hex = await window.ethereum.request({ method: 'eth_getBalance', params: [walletAddress, 'latest'] })
        raw = BigInt(hex)
      } else {
        raw = await getERC20Balance(t.address, walletAddress)
      }
      return { symbol: t.symbol, raw, balance: formatAmt(raw, t.decimals) }
    })
  )
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
}

// ─── component ──────────────────────────────────────────────────────────────

export default function BillsTab({ userWallet }) {
  const [bills, setBills]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [txResults, setTxResults] = useState({})

  // Wallet fallback for Google/email users
  const [manualWallet, setManualWallet]           = useState('')
  const [manualWalletInput, setManualWalletInput] = useState('')
  const effectiveWallet = userWallet || manualWallet

  // Per-bill smart-route state
  // routeState[paymentId] = { status: 'idle'|'scanning'|'ready'|'error', ranked: [], error, selectedToken, walletFrom }
  const [routeState, setRouteState] = useState({})

  useEffect(() => { if (effectiveWallet) fetchBills() }, [effectiveWallet])

  const fetchBills = async () => {
    if (!effectiveWallet) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/bills?wallet=${effectiveWallet}`)
      if (res.ok) setBills(await res.json())
    } catch { /* registry not configured */ }
    finally { setLoading(false) }
  }

  // ── Smart Route: scan balances + fetch ranked quotes for one bill ──────────
  const handleSmartRoute = async (bill) => {
    if (!window.ethereum) { alert('MetaMask not detected.'); return }

    const stateKey = bill.isSubscription ? (bill.lastPaymentId || bill.subscriptionId) : bill.paymentId
    setRouteState(prev => ({ ...prev, [stateKey]: { status: 'scanning', ranked: [], error: null } }))

    try {
      const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' })

      // 1. Scan all token balances in parallel
      const balances = await scanAllBalances(from)
      const nonZero  = balances.filter(b => b.raw > 0n)

      if (nonZero.length === 0) {
        throw new Error('No token balances found in your wallet.')
      }

      // 2. Ask backend to quote all available tokens and rank them
      const res = await fetch(`${API_BASE}/api/checkout/best-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceUSD: bill.amountUSD,
          userWallet: from,
          tokens: nonZero.map(b => ({ symbol: b.symbol, balance: b.balance })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Route fetch failed')

      // Auto-select recommended token
      const recommended = data.ranked.find(r => r.recommended)
      const selected    = recommended?.token || data.ranked[0]?.token || 'USDC'

      setRouteState(prev => ({
        ...prev,
        [stateKey]: { status: 'ready', ranked: data.ranked, error: null, selectedToken: selected, walletFrom: from },
      }))
    } catch (err) {
      setRouteState(prev => ({ ...prev, [stateKey]: { status: 'error', ranked: [], error: err.message } }))
    }
  }

  const selectRouteToken = (stateKey, token) => {
    setRouteState(prev => ({
      ...prev,
      [stateKey]: { ...prev[stateKey], selectedToken: token },
    }))
  }

  // ── Pay ───────────────────────────────────────────────────────────────────
  const handlePay = async (bill) => {
    if (!window.ethereum) { alert('MetaMask not detected.'); return }

    const stateKey     = bill.isSubscription ? (bill.lastPaymentId || bill.subscriptionId) : bill.paymentId
    const rs           = routeState[stateKey]
    const selectedToken = rs?.selectedToken || 'USDC'
    const selectedRoute = rs?.ranked?.find(r => r.token === selectedToken)

    setPayingId(stateKey)
    setTxResults(prev => ({ ...prev, [stateKey]: null }))

    try {
      const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      await ensureBase()

      let txHash

      if (selectedToken === 'USDC' || selectedRoute?.isDirect) {
        // Direct USDC transfer
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: USDC_BASE, data: encodeUSDCTransfer(bill.merchant, bill.amountUSD), chainId: BASE_CHAIN_ID }],
        })
      } else {
        // Uniswap swap — use the pre-built transaction from best-route
        let swapTx = selectedRoute?.transaction

        // Re-fetch if no pre-built tx (user selected without running smart route)
        if (!swapTx) {
          const res = await fetch(`${API_BASE}/api/checkout/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceUSD: bill.amountUSD, userWallet: from, token: selectedToken }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Could not get swap quote')
          swapTx = data.transaction
        }

        // Final balance check before sending
        const tokenMeta  = SUPPORTED_TOKENS.find(t => t.symbol === selectedToken)
        let rawBalance
        if (tokenMeta.isNative) {
          rawBalance = BigInt(await window.ethereum.request({ method: 'eth_getBalance', params: [from, 'latest'] }))
        } else {
          rawBalance = await getERC20Balance(tokenMeta.address, from)
        }
        const neededFloat = parseFloat(selectedRoute?.tokenInAmount || '0')
        const neededRaw   = BigInt(Math.ceil(neededFloat * 10 ** tokenMeta.decimals))
        if (rawBalance < neededRaw) {
          throw new Error(
            `Insufficient ${selectedToken}. Have ${formatAmt(rawBalance, tokenMeta.decimals)}, need ~${selectedRoute?.tokenInAmount}. Choose another token.`
          )
        }

        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: swapTx.to, data: swapTx.data, value: swapTx.value || '0x0', chainId: BASE_CHAIN_ID }],
        })
      }

      // Mark Paid on Coston2
      const invoiceId = bill.isSubscription ? bill.lastPaymentId : bill.paymentId
      try {
        await fetch(`${API_BASE}/api/merchant/invoice/${invoiceId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Paid' }),
        })
      } catch { /* non-critical */ }

      setTxResults(prev => ({ ...prev, [stateKey]: { hash: txHash, token: selectedToken } }))
      setBills(prev => prev.map(b => {
        if (bill.isSubscription && b.subscriptionId === bill.subscriptionId) return { ...b, status: 'Paid' }
        if (!bill.isSubscription && b.paymentId === bill.paymentId) return { ...b, status: 'Paid' }
        return b
      }))
    } catch (err) {
      setTxResults(prev => ({ ...prev, [stateKey]: { error: err.message } }))
    } finally {
      setPayingId(null)
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  // Handles both Unix timestamps (invoices) and ISO date strings (subscriptions)
  const fmtDate = (val) => {
    if (!val) return '—'
    const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const statusColor = (s) => {
    const v = (s || '').toLowerCase()
    if (v === 'paid') return 'bg-green-100 text-green-700'
    if (v === 'active') return 'bg-green-100 text-green-700'
    if (v === 'expired' || v === 'cancelled' || v === 'failed') return 'bg-red-100 text-red-700'
    if (v === 'completed') return 'bg-gray-100 text-gray-600'
    return 'bg-amber-100 text-amber-700' // Pending, scheduled, processing
  }

  const displayStatus = (bill) => {
    if (bill.isSubscription) {
      if (bill.status === 'scheduled') return 'Upcoming'
      if (bill.status === 'active' && bill.lastPaymentId) return 'Payment Due'
      if (bill.status === 'active') return 'Active'
    }
    return bill.status || 'Pending'
  }

  // Invoices: Pending = unpaid. Subscriptions: scheduled/active = ongoing obligation
  const activeBills   = bills.filter(b => b.isSubscription ? ['scheduled','active','processing'].includes((b.status||'').toLowerCase()) : b.status === 'Pending')
  const completedBills = bills.filter(b => b.isSubscription ? b.status === 'completed' : b.status === 'Paid')
  const totalPending  = activeBills.reduce((s, b) => s + Number(b.amountUSD), 0).toFixed(2)
  const totalPaid     = completedBills.reduce((s, b) => s + Number(b.amountUSD), 0).toFixed(2)

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices on <span className="font-medium text-foreground">Flare Coston2</span>.
          OmniCheckout finds the cheapest payment route across your tokens via Uniswap.
        </p>
      </div>

      {/* Wallet fallback */}
      {!userWallet && !manualWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-700">No wallet linked. Enter your address to view bills.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualWalletInput}
              onChange={e => setManualWalletInput(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring/40"
            />
            <Button onClick={() => setManualWallet(manualWalletInput.trim())} disabled={!/^0x[a-fA-F0-9]{40}$/.test(manualWalletInput.trim())}>
              Load
            </Button>
          </div>
        </div>
      )}

      {!effectiveWallet ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">Enter your wallet address above to view bills.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Active / Pending</p>
              <p className="mt-2 text-2xl font-semibold">${totalPending}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Paid / Completed</p>
              <p className="mt-2 text-2xl font-semibold">${totalPaid}</p>
            </div>
          </div>

          {/* Bill list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">Incoming Invoices</h3>
              <div className="flex items-center gap-3">
                {loading && <span className="text-xs text-muted-foreground">Loading from chain...</span>}
                <button onClick={fetchBills} className="text-xs text-primary hover:underline">Refresh</button>
              </div>
            </div>

            {bills.length > 0 ? bills.map((bill, idx) => {
              const stateKey  = bill.isSubscription ? (bill.lastPaymentId || bill.subscriptionId) : bill.paymentId
              const billKey   = bill.isSubscription ? (bill.subscriptionId || `sub-${idx}`) : (bill.paymentId || `inv-${idx}`)
              const txResult  = txResults[stateKey]
              const isPaying  = payingId === stateKey
              const rs        = routeState[stateKey] || { status: 'idle', ranked: [], selectedToken: 'USDC' }
              const selToken  = rs.selectedToken || 'USDC'
              const selRoute  = rs.ranked?.find(r => r.token === selToken)
              const payDisabled = isPaying
                || (rs.status === 'scanning')
                || (selRoute && !selRoute.sufficient && !selRoute.isDirect)

              return (
                <div key={billKey} className="rounded-xl border border-border bg-background p-4 space-y-4">

                  {/* Header — shared between invoice and subscription */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(bill.status)}`}>{displayStatus(bill)}</span>
                        {bill.isSubscription
                          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Subscription</span>
                          : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Flare Coston2</span>
                        }
                        {bill.isSubscription && bill.frequency && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 capitalize">{bill.frequency}</span>
                        )}
                      </div>
                      {bill.description && <p className="text-sm text-foreground">{bill.description}</p>}
                      <p className="text-xs text-muted-foreground font-mono">From: {bill.merchant}</p>
                      {bill.isSubscription ? (
                        <>
                          {bill.nextExecutionAt && <p className="text-xs text-muted-foreground">Next payment: {fmtDate(bill.nextExecutionAt)}</p>}
                          {bill.startDate && <p className="text-xs text-muted-foreground">Started: {fmtDate(bill.startDate)}</p>}
                          {bill.endDate && <p className="text-xs text-muted-foreground">Ends: {fmtDate(bill.endDate)}</p>}
                        </>
                      ) : (
                        <>
                          {bill.dueDate && <p className="text-xs text-muted-foreground">Due: {fmtDate(bill.dueDate)}</p>}
                          <p className="text-xs text-muted-foreground">Created: {fmtDate(bill.createdAt)}</p>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">${Number(bill.amountUSD).toFixed(2)} USDC</p>
                      {bill.isSubscription && <p className="text-xs text-muted-foreground">per {bill.frequency}</p>}
                    </div>
                  </div>

                  {/* Subscription info / payment section */}
                  {bill.isSubscription && !bill.lastPaymentId && (
                    <div className="rounded-lg bg-purple-50 border border-purple-100 px-3 py-2 text-xs text-purple-700 space-y-0.5">
                      <p>This subscription is upcoming. Recurring payments will be processed automatically by the merchant.</p>
                      {bill.lastError && (
                        <p className="text-red-600">Last error: {bill.lastError}</p>
                      )}
                    </div>
                  )}

                  {/* Smart route + pay — for one-time invoices AND subscriptions with lastPaymentId */}
                  {((bill.isSubscription && bill.lastPaymentId) || (!bill.isSubscription && bill.status === 'Pending')) && !txResult?.hash && (
                    <div className="space-y-3">

                      {rs.status === 'idle' && (
                        <Button variant="outline" className="w-full text-sm" onClick={() => handleSmartRoute(bill)}>
                          Find Cheapest Payment Route
                        </Button>
                      )}

                      {rs.status === 'scanning' && (
                        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                          Scanning wallet balances and fetching Uniswap quotes...
                        </div>
                      )}

                      {rs.status === 'error' && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 space-y-2">
                          <p>{rs.error}</p>
                          <button onClick={() => handleSmartRoute(bill)} className="text-primary hover:underline">Try again</button>
                        </div>
                      )}

                      {rs.status === 'ready' && rs.ranked.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Payment routes — sorted by cheapest effective cost
                          </p>

                          {rs.ranked.map((route, i) => {
                            const isSelected   = selToken === route.token
                            const isRecommended = route.recommended
                            const isSufficient  = route.sufficient

                            return (
                              <button
                                key={route.token}
                                onClick={() => isSufficient && selectRouteToken(stateKey, route.token)}
                                disabled={!isSufficient}
                                className={`w-full text-left rounded-xl border p-3 transition-all ${
                                  isSelected
                                    ? 'border-primary bg-primary/5'
                                    : isSufficient
                                      ? 'border-border hover:border-primary/60 bg-background'
                                      : 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {/* Rank indicator */}
                                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                    }`}>
                                      {i + 1}
                                    </span>
                                    <span className="font-semibold text-sm text-foreground">{route.token}</span>
                                    {isRecommended && (
                                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                        Best
                                      </span>
                                    )}
                                    {!isSufficient && (
                                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                                        Insufficient
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-foreground">
                                      ~{Number(route.tokenInAmount).toFixed(6)} {route.token}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      ≈ ${Number(route.effectiveCostUSD).toFixed(4)} total
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                  <span>Balance: {route.userBalance} {route.token}</span>
                                  {route.gasFeeUSD && <span>Gas: ~${Number(route.gasFeeUSD).toFixed(4)}</span>}
                                  {route.isDirect
                                    ? <span className="text-blue-600">Direct transfer</span>
                                    : <span className="text-purple-600">Uniswap swap → USDC</span>
                                  }
                                  <span className={Number(route.premium).toFixed(4) === '0.0000' ? 'text-green-600' : ''}>
                                    Premium: +${Number(route.premium).toFixed(4)}
                                  </span>
                                </div>
                              </button>
                            )
                          })}

                          <button onClick={() => handleSmartRoute(bill)} className="text-xs text-primary hover:underline">
                            Refresh quotes
                          </button>
                        </div>
                      )}

                      {/* Pay button */}
                      <Button
                        className="w-full"
                        disabled={payDisabled}
                        onClick={() => handlePay(bill)}
                      >
                        {isPaying
                          ? 'Waiting for MetaMask...'
                          : rs.status === 'scanning'
                            ? 'Scanning routes...'
                            : rs.status === 'idle'
                              ? 'Pay $' + Number(bill.amountUSD).toFixed(2) + ' USDC'
                              : selRoute?.isDirect
                                ? `Pay $${Number(bill.amountUSD).toFixed(2)} USDC (direct)`
                                : selRoute
                                  ? `Swap ~${Number(selRoute.tokenInAmount).toFixed(6)} ${selToken} → USDC`
                                  : `Pay with ${selToken}`
                        }
                      </Button>
                    </div>
                  )}

                  {/* Success / error — for invoices and subscription payments */}
                  {txResult?.hash && (
                    <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                      Paid with {txResult.token}!{' '}
                      <a href={`https://basescan.org/tx/${txResult.hash}`} target="_blank" rel="noopener noreferrer" className="font-mono underline">
                        View on Basescan
                      </a>
                    </div>
                  )}
                  {txResult?.error && <p className="text-xs text-red-500">{txResult.error}</p>}
                </div>
              )
            }) : !loading ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
                <p className="text-sm text-muted-foreground">No bills yet. Invoices sent to your wallet will appear here.</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
