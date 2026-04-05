import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''
const FREQUENCY_OPTIONS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export default function InvoicesTab({ userWallet }) {
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [onChainWarning, setOnChainWarning] = useState(null)
  const [activePaymentId, setActivePaymentId] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [manualWallet, setManualWallet] = useState('')
  const [manualWalletInput, setManualWalletInput] = useState('')
  const [invoiceFlags, setInvoiceFlags] = useState({}) // { paymentId: [flag, ...] }

  const effectiveWallet = userWallet || manualWallet

  const [formData, setFormData] = useState({
    paymentType: 'one-time',
    description: '',
    recipientWallet: '',
    amount: '',
    dueDate: '',
    frequency: 'monthly',
    endDate: '',
  })

  useEffect(() => {
    if (!effectiveWallet) return
    fetchInvoices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWallet])

  const fetchInvoices = async () => {
    if (!effectiveWallet) return
    setFetching(true)
    try {
      const [invoiceRes, subscriptionRes] = await Promise.all([
        fetch(`${API_BASE}/api/merchant/invoices?wallet=${effectiveWallet}`),
        fetch(`${API_BASE}/api/merchant/subscriptions?wallet=${effectiveWallet}`),
      ])

      const invoiceData = invoiceRes.ok ? await invoiceRes.json() : []
      const subscriptionData = subscriptionRes.ok ? await subscriptionRes.json() : []

      const toMillis = (value) => {
        if (!value) return 0
        if (typeof value === 'number') return value > 1e12 ? value : value * 1000
        const parsed = new Date(value).getTime()
        return Number.isNaN(parsed) ? 0 : parsed
      }

      // Fetch all flags for this merchant's invoices in one call
      const flagRes = await fetch(`${API_BASE}/api/merchant/invoices/flags?wallet=${effectiveWallet}`)
      if (flagRes.ok) {
        const allFlags = await flagRes.json()
        const grouped = {}
        for (const flag of allFlags) {
          if (!grouped[flag.paymentId]) grouped[flag.paymentId] = []
          grouped[flag.paymentId].push(flag)
        }
        setInvoiceFlags(grouped)
      }

      setInvoices(
        [...invoiceData, ...subscriptionData]
          .map((entry) => ({
            ...entry,
            createdAt: entry.createdAt ?? entry.created_at,
            isSubscription: Boolean(entry.isSubscription || entry.frequency),
          }))
          .sort((left, right) => {
            const leftTime = toMillis(left.createdAt)
            const rightTime = toMillis(right.createdAt)
            return rightTime - leftTime
          })
      )
    } catch {
      // silently fail
    } finally {
      setFetching(false)
    }
  }

  const handleGenerateInvoice = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const minDate = getMinDate()
    const maxDate = getMaxDate()

    // Validate dates based on payment type
    if (formData.paymentType === 'one-time') {
      if (formData.dueDate && (formData.dueDate < minDate || formData.dueDate > maxDate)) {
        setError(`Due date must be between today (${minDate}) and Dec 31, 2099`)
        setLoading(false)
        return
      }
    } else {
      // Subscription validation
      if (!formData.dueDate || formData.dueDate < minDate || formData.dueDate > maxDate) {
        setError(`Start date required and must be between today and Dec 31, 2099`)
        setLoading(false)
        return
      }
      if (formData.endDate && (formData.endDate < formData.dueDate || formData.endDate > maxDate)) {
        setError(`End date must be after start date`)
        setLoading(false)
        return
      }
    }

    try {
      const endpoint = formData.paymentType === 'one-time' ? '/api/merchant/invoice' : '/api/merchant/subscription'
      const payload = formData.paymentType === 'one-time'
        ? {
            amountUSD: parseFloat(formData.amount),
            merchantWallet: effectiveWallet.trim(),
            recipientWallet: formData.recipientWallet.trim(),
            description: formData.description,
            dueDate: formData.dueDate || null,
            referenceId: `omni-${Date.now()}`,
          }
        : {
            merchantWallet: effectiveWallet.trim(),
            subscriberWallet: formData.recipientWallet.trim(),
            description: formData.description,
            amountUSD: parseFloat(formData.amount),
            frequency: formData.frequency,
            startDate: formData.dueDate,
            endDate: formData.endDate || null,
          }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')

      if (formData.paymentType === 'one-time') {
        if (data.onChainWarning) setOnChainWarning(data.onChainWarning)
        else setOnChainWarning(null)

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
      } else {
        setInvoices((prev) => [
          {
            id: prev.length,
            subscriptionId: data.subscriptionId,
            description: formData.description,
            recipient: formData.recipientWallet,
            amountUSD: parseFloat(formData.amount),
            frequency: formData.frequency,
            startDate: Math.floor(new Date(formData.dueDate).getTime() / 1000),
            endDate: formData.endDate ? Math.floor(new Date(formData.endDate).getTime() / 1000) : null,
            status: 'Active',
            createdAt: Math.floor(Date.now() / 1000),
            isSubscription: true,
          },
          ...prev,
        ])
        setOnChainWarning(null)
      }

      setFormData({
        paymentType: 'one-time',
        description: '',
        recipientWallet: '',
        amount: '',
        dueDate: '',
        frequency: 'monthly',
        endDate: '',
      })
      setShowGenerateForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (invoice) => {
    if (!window.confirm(`Cancel this ${invoice.isSubscription ? 'subscription' : 'invoice'} for $${Number(invoice.amountUSD).toFixed(2)}? This cannot be undone.`)) return

    try {
      if (invoice.isSubscription) {
        const res = await fetch(`${API_BASE}/api/merchant/subscription/${invoice.subscriptionId}`, { method: 'DELETE' })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Cancel failed') }
      } else {
        const res = await fetch(`${API_BASE}/api/merchant/invoice/${invoice.paymentId}`, { method: 'DELETE' })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Cancel failed') }
      }
      setInvoices(prev => prev.map(inv => {
        if (invoice.isSubscription && inv.subscriptionId === invoice.subscriptionId) return { ...inv, status: 'cancelled' }
        if (!invoice.isSubscription && inv.paymentId === invoice.paymentId) return { ...inv, status: 'Cancelled' }
        return inv
      }))
    } catch (err) {
      alert(`Failed to cancel: ${err.message}`)
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
    const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const statusColor = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'paid' || s === 'succeeded' || s === 'active') return 'bg-green-100 text-green-700'
    if (s === 'failed' || s === 'expired' || s === 'cancelled') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  const getMinDate = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today.toISOString().split('T')[0]
  }

  const getMaxDate = () => {
    return '2099-12-31'
  }

  const isDateValid = () => {
    const minDate = getMinDate()
    const maxDate = getMaxDate()

    if (formData.paymentType === 'one-time') {
      if (!formData.dueDate) return true
      return formData.dueDate >= minDate && formData.dueDate <= maxDate
    } else {
      if (!formData.dueDate || formData.dueDate < minDate || formData.dueDate > maxDate) return false
      if (formData.endDate && (formData.endDate < formData.dueDate || formData.endDate > maxDate)) return false
      return true
    }
  }

  const isFormValid = () => {
    return (
      formData.recipientWallet &&
      formData.amount &&
      parseFloat(formData.amount) > 0 &&
      isDateValid() &&
      (formData.paymentType === 'one-time' || formData.frequency)
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Invoices & Subscriptions</h2>
        <Button onClick={() => setShowGenerateForm(!showGenerateForm)}>
          {showGenerateForm ? 'Cancel' : 'Generate'}
        </Button>
      </div>

      {!userWallet && !manualWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-700">No wallet linked. Enter your merchant wallet address.</p>
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

      {showGenerateForm && (
        <form onSubmit={handleGenerateInvoice} className="rounded-xl border border-border bg-background p-6 space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="paymentType"
                value="one-time"
                checked={formData.paymentType === 'one-time'}
                onChange={(e) => setFormData({ ...formData, paymentType: e.target.value })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-foreground">One-time Invoice</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="paymentType"
                value="subscription"
                checked={formData.paymentType === 'subscription'}
                onChange={(e) => setFormData({ ...formData, paymentType: e.target.value })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-foreground">Subscription (Recurring)</span>
            </label>
          </div>

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
            <label className="mb-2 block text-sm font-medium text-foreground">Recipient Wallet</label>
            <input
              type="text"
              required
              value={formData.recipientWallet}
              onChange={(e) => setFormData({ ...formData, recipientWallet: e.target.value })}
              placeholder="0x..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">Will appear in their Bills tab.</p>
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

            {formData.paymentType === 'one-time' ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Due Date (Optional)</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  min={getMinDate()}
                  max={getMaxDate()}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
                />
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Frequency</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
                >
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <option key={freq} value={freq}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {formData.paymentType === 'subscription' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Start Date</label>
                <input
                  type="date"
                  required
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  min={getMinDate()}
                  max={getMaxDate()}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">End Date (Optional)</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.dueDate || getMinDate()}
                  max={getMaxDate()}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || !effectiveWallet || !isFormValid()}>
            {loading ? 'Creating...' : `Create ${formData.paymentType === 'one-time' ? 'Invoice' : 'Subscription'}`}
          </Button>
        </form>
      )}

      {onChainWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
           {onChainWarning}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground">Sent Items</h3>
          <div className="flex items-center gap-3">
            {fetching && <span className="text-xs text-muted-foreground">Loading...</span>}
            {effectiveWallet && (
              <button onClick={fetchInvoices} className="text-xs text-primary hover:underline">Refresh</button>
            )}
          </div>
        </div>

        {invoices.length > 0 ? (
          invoices.map((invoice, idx) => (
            <div key={invoice.paymentId || invoice.subscriptionId || idx} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-xs text-muted-foreground">
                      {invoice.isSubscription ? invoice.subscriptionId : invoice.paymentId}
                    </p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                    {invoice.isSubscription && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {invoice.frequency}
                      </span>
                    )}
                    {invoice.onChain && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">On-chain</span>
                    )}
                  </div>
                  {invoice.description && <p className="mt-1 text-sm text-foreground">{invoice.description}</p>}
                  {invoice.recipient && <p className="mt-0.5 text-xs text-muted-foreground font-mono">To: {invoice.recipient}</p>}
                  {invoice.isSubscription ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(invoice.startDate)}
                      {invoice.endDate && ` → ${formatDate(invoice.endDate)}`}
                    </p>
                  ) : (
                    invoice.dueDate && <p className="mt-0.5 text-xs text-muted-foreground">Due: {formatDate(invoice.dueDate)}</p>
                  )}
                  {invoice.isSubscription && invoice.nextExecutionAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Next run: {formatDate(invoice.nextExecutionAt)}</p>
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

              {/* Flags from users */}
              {!invoice.isSubscription && invoiceFlags[invoice.paymentId]?.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-amber-700">
                    {invoiceFlags[invoice.paymentId].length} flag{invoiceFlags[invoice.paymentId].length > 1 ? 's' : ''} raised by recipient
                  </p>
                  {invoiceFlags[invoice.paymentId].map(flag => (
                    <p key={flag.id} className="text-xs text-amber-700">
                      <span className="font-mono">{flag.flaggerWallet.slice(0, 8)}…</span>
                      {' — '}{flag.reason}
                      <span className="text-amber-500 ml-1">
                        · {new Date(flag.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                {!invoice.isSubscription && (
                  <>
                    <button onClick={() => pollStatus(invoice.paymentId)}
                      className="text-xs font-medium text-primary hover:underline">
                      Check status
                    </button>
                    {activePaymentId === invoice.paymentId && paymentStatus && (
                      <span className="text-xs text-muted-foreground">→ {paymentStatus}</span>
                    )}
                  </>
                )}
                {!['cancelled', 'Cancelled', 'Paid', 'paid', 'completed'].includes(invoice.status) && (
                  <button
                    onClick={() => handleCancel(invoice)}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    Cancel {invoice.isSubscription ? 'subscription' : 'invoice'}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {effectiveWallet ? 'No items yet.' : 'Enter wallet address above.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
