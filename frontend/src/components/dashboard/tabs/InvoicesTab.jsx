import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

export default function InvoicesTab({ userWallet }) {
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [onChainWarning, setOnChainWarning] = useState(null)
  const [activePaymentId, setActivePaymentId] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null)
  // Fallback: merchant signed in via Google/email (no MetaMask linked to profile)
  const [manualWallet, setManualWallet] = useState('')
  const [manualWalletInput, setManualWalletInput] = useState('')

  const effectiveWallet = userWallet || manualWallet

  const [formData, setFormData] = useState({
    description: '',
    recipientWallet: '',
    amount: '',
    dueDate: '',
  })

  useEffect(() => {
    if (!effectiveWallet) return
    fetchInvoices()
  }, [effectiveWallet])

  const fetchInvoices = async () => {
    if (!effectiveWallet) return
    setFetching(true)
    try {
      const res = await fetch(`${API_BASE}/api/merchant/invoices?wallet=${effectiveWallet}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data)
      }
    } catch {
      // silently fail — on-chain registry may not be configured yet
    } finally {
      setFetching(false)
    }
  }

  const handleGenerateInvoice = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/api/merchant/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUSD: parseFloat(formData.amount),
          merchantWallet: effectiveWallet,
          recipientWallet: formData.recipientWallet,
          description: formData.description,
          dueDate: formData.dueDate || null,
          referenceId: `omni-${Date.now()}`,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice')

      if (data.onChainWarning) setOnChainWarning(data.onChainWarning)
      else setOnChainWarning(null)

      // Prepend optimistically, then re-fetch from chain to get on-chain state
      setInvoices((prev) => [
        {
          id: prev.length,
          paymentId: data.paymentId,
          gatewayUrl: data.gatewayUrl,
          description: formData.description,
          recipient: formData.recipientWallet,
          amountUSD: parseFloat(formData.amount),
          dueDate: formData.dueDate ? Math.floor(new Date(formData.dueDate).getTime() / 1000) : null,
          status: 'Pending',
          createdAt: Math.floor(Date.now() / 1000),
          onChain: !!(data.onChain && !data.onChain.error),
        },
        ...prev,
      ])

      setFormData({ description: '', recipientWallet: '', amount: '', dueDate: '' })
      setShowGenerateForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pollStatus = async (paymentId) => {
    setActivePaymentId(paymentId)
    setPaymentStatus('checking...')
    try {
      const res = await fetch(`${API_BASE}/api/merchant/invoice/${paymentId}/status`)
      const data = await res.json()
      setPaymentStatus(data.status)
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.paymentId === paymentId ? { ...inv, status: data.isFinal ? data.status : inv.status } : inv
        )
      )
    } catch {
      setPaymentStatus('error')
    }
  }

  const formatDate = (ts) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const statusColor = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'paid' || s === 'succeeded') return 'bg-green-100 text-green-700'
    if (s === 'failed' || s === 'expired' || s === 'cancelled') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Invoices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate payment links stored on <span className="font-medium text-foreground">Flare Coston2</span>.
          </p>
        </div>
        <Button onClick={() => setShowGenerateForm(!showGenerateForm)}>
          {showGenerateForm ? 'Cancel' : 'Generate Invoice'}
        </Button>
      </div>

      {/* Wallet fallback for email/Google users */}
      {!userWallet && !manualWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-700">No wallet linked to your account. Enter your merchant wallet address to load invoices.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualWalletInput}
              onChange={(e) => setManualWalletInput(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring/40"
            />
            <Button
              onClick={() => setManualWallet(manualWalletInput.trim())}
              disabled={!/^0x[a-fA-F0-9]{40}$/.test(manualWalletInput.trim())}
            >
              Load
            </Button>
          </div>
        </div>
      )}

      {/* Generate Invoice Form */}
      {showGenerateForm && (
        <form onSubmit={handleGenerateInvoice} className="rounded-xl border border-border bg-background p-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What are you billing for?"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Recipient Wallet Address</label>
            <input
              type="text"
              required
              value={formData.recipientWallet}
              onChange={(e) => setFormData({ ...formData, recipientWallet: e.target.value })}
              placeholder="0x... (recipient's wallet address)"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">Invoice will appear in their Bills tab on this platform.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Amount (USD)</label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || !effectiveWallet}>
            {loading ? 'Creating invoice...' : 'Create Invoice → Store on Flare Coston2'}
          </Button>
        </form>
      )}

      {onChainWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          ⚠️ {onChainWarning}
        </div>
      )}

      {/* Invoice List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground">Sent Invoices</h3>
          <div className="flex items-center gap-3">
            {fetching && <span className="text-xs text-muted-foreground">Loading from chain...</span>}
            {effectiveWallet && (
              <button onClick={fetchInvoices} className="text-xs text-primary hover:underline">Refresh</button>
            )}
          </div>
        </div>

        {invoices.length > 0 ? (
          invoices.map((invoice, idx) => (
            <div key={invoice.paymentId || idx} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-xs text-muted-foreground">{invoice.paymentId}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                    {invoice.onChain && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">On-chain</span>
                    )}
                  </div>
                  {invoice.description && <p className="mt-1 text-sm text-foreground">{invoice.description}</p>}
                  {invoice.recipient && (
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">To: {invoice.recipient}</p>
                  )}
                  {invoice.dueDate && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Due: {formatDate(invoice.dueDate)}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">Created: {formatDate(invoice.createdAt)}</p>
                </div>
                <p className="text-lg font-semibold text-foreground">${Number(invoice.amountUSD).toFixed(2)}</p>
              </div>

              {invoice.gatewayUrl && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-mono text-muted-foreground truncate">{invoice.gatewayUrl}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(invoice.gatewayUrl)}
                    className="text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Copy
                  </button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap items-center">
                {invoice.gatewayUrl && (
                  <a href={invoice.gatewayUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline">
                    Open payment page
                  </a>
                )}
                <span className="text-muted-foreground">·</span>
                <button onClick={() => pollStatus(invoice.paymentId)}
                  className="text-xs font-medium text-primary hover:underline">
                  Check status
                </button>
                {activePaymentId === invoice.paymentId && paymentStatus && (
                  <span className="text-xs text-muted-foreground">→ {paymentStatus}</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {effectiveWallet ? 'No invoices yet. Generate one to get started.' : 'Enter your wallet address above to load invoices.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
