import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

export default function LedgerTab({ userWallet }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [manualWallet, setManualWallet] = useState('')
  const [manualWalletInput, setManualWalletInput] = useState('')

  const effectiveWallet = userWallet || manualWallet

  useEffect(() => {
    if (!effectiveWallet) return
    fetchLedger()
  }, [effectiveWallet])

  const fetchLedger = async () => {
    if (!effectiveWallet) return
    setLoading(true)
    try {
      // Fetch both sent (merchant) and received (bills) invoices in parallel
      const [sentRes, receivedRes] = await Promise.all([
        fetch(`${API_BASE}/api/merchant/invoices?wallet=${effectiveWallet}`),
        fetch(`${API_BASE}/api/bills?wallet=${effectiveWallet}`),
      ])

      const sent = sentRes.ok ? await sentRes.json() : []
      const received = receivedRes.ok ? await receivedRes.json() : []

      // Tag each entry with direction
      const sentTagged = sent.map((inv) => ({ ...inv, direction: 'sent' }))
      const receivedTagged = received.map((inv) => ({ ...inv, direction: 'received' }))

      // Merge and sort by createdAt descending
      const merged = [...sentTagged, ...receivedTagged].sort((a, b) => b.createdAt - a.createdAt)
      setEntries(merged)
    } catch {
      // registry not configured yet
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ts) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statusColor = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'paid') return 'text-green-600'
    if (s === 'expired' || s === 'cancelled') return 'text-red-600'
    return 'text-amber-600'
  }

  const totalSent = entries
    .filter((e) => e.direction === 'sent' && e.status === 'Paid')
    .reduce((sum, e) => sum + Number(e.amountUSD), 0).toFixed(2)

  const totalReceived = entries
    .filter((e) => e.direction === 'received' && e.status === 'Paid')
    .reduce((sum, e) => sum + Number(e.amountUSD), 0).toFixed(2)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Transaction Ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All invoice activity from <span className="font-medium text-foreground">Flare Coston2</span> — sent and received.
        </p>
      </div>

      {/* Wallet fallback for email/Google users */}
      {!userWallet && !manualWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-700">No wallet linked. Enter your wallet address to load your ledger.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualWalletInput}
              onChange={(e) => setManualWalletInput(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={() => setManualWallet(manualWalletInput.trim())}
              disabled={!/^0x[a-fA-F0-9]{40}$/.test(manualWalletInput.trim())}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Load
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {effectiveWallet && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">Total Invoiced (paid)</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">${totalSent}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">Total Paid Out</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">${totalReceived}</p>
          </div>
        </div>
      )}

      {/* Ledger entries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground">Activity</h3>
          <div className="flex items-center gap-3">
            {loading && <span className="text-xs text-muted-foreground">Loading from chain...</span>}
            {effectiveWallet && (
              <button onClick={fetchLedger} className="text-xs text-primary hover:underline">Refresh</button>
            )}
          </div>
        </div>

        {entries.length > 0 ? (
          entries.map((entry, idx) => (
            <div key={`${entry.paymentId}-${entry.direction}-${idx}`}
              className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg
                    ${entry.direction === 'sent' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    {entry.direction === 'sent' ? '↗' : '↙'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground capitalize">
                        {entry.direction === 'sent' ? 'Invoice Sent' : 'Invoice Received'}
                      </p>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        Flare Coston2
                      </span>
                    </div>
                    {entry.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                    )}
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {entry.direction === 'sent'
                        ? `To: ${entry.recipient || entry.recipient}`
                        : `From: ${entry.merchant}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    {entry.direction === 'sent' ? '+' : '-'}${Number(entry.amountUSD).toFixed(2)} USDC
                  </p>
                  <p className={`mt-1 text-xs font-medium capitalize ${statusColor(entry.status)}`}>
                    {entry.status}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : !loading ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {effectiveWallet ? 'No transactions yet.' : 'Enter your wallet address above to view activity.'}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
