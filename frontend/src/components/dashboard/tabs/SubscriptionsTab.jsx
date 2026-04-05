import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''
const FREQUENCY_OPTIONS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export default function SubscriptionsTab({ userWallet }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  
  // Fallback: merchant signed in via Google/email (no MetaMask linked to profile)
  const [manualWallet, setManualWallet] = useState('')
  const [manualWalletInput, setManualWalletInput] = useState('')

  const effectiveWallet = userWallet || manualWallet

  const [formData, setFormData] = useState({
    description: '',
    subscriberWallet: '',
    amount: '',
    frequency: 'monthly',
    startDate: '',
    endDate: '',
  })

  useEffect(() => {
    if (!effectiveWallet) return
    fetchSubscriptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWallet])

  const fetchSubscriptions = async () => {
    if (!effectiveWallet) return
    setFetching(true)
    try {
      const res = await fetch(`${API_BASE}/api/merchant/subscriptions?wallet=${effectiveWallet}`)
      if (res.ok) {
        const data = await res.json()
        setSubscriptions(data || [])
      }
    } catch {
      // silently fail
    } finally {
      setFetching(false)
    }
  }

  const getMinDate = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today.toISOString().split('T')[0]
  }

  const handleCreateSubscription = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate dates
    if (formData.startDate) {
      const minDate = getMinDate()
      if (formData.startDate < minDate) {
        setError('Start date must be today or later')
        setLoading(false)
        return
      }
    }

    if (formData.startDate && formData.endDate) {
      if (formData.endDate < formData.startDate) {
        setError('End date must be after start date')
        setLoading(false)
        return
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/merchant/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantWallet: effectiveWallet,
          subscriberWallet: formData.subscriberWallet,
          description: formData.description,
          amountUSD: parseFloat(formData.amount),
          frequency: formData.frequency,
          startDate: formData.startDate,
          endDate: formData.endDate || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create subscription')

      // Add to list
      setSubscriptions((prev) => [
        {
          subscriptionId: data.subscriptionId,
          merchant: effectiveWallet,
          subscriber: formData.subscriberWallet,
          amountUSD: parseFloat(formData.amount),
          frequency: formData.frequency,
          startDate: Math.floor(new Date(formData.startDate).getTime() / 1000),
          endDate: formData.endDate ? Math.floor(new Date(formData.endDate).getTime() / 1000) : null,
          description: formData.description,
          isActive: true,
          createdAt: Math.floor(Date.now() / 1000),
        },
        ...prev,
      ])

      setFormData({
        description: '',
        subscriberWallet: '',
        amount: '',
        frequency: 'monthly',
        startDate: '',
        endDate: '',
      })
      setShowCreateForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSubscriptionStatus = async (subscriptionId, currentStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/merchant/subscription/${subscriptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      })

      if (!res.ok) throw new Error('Failed to update subscription')

      setSubscriptions((prev) =>
        prev.map((sub) =>
          sub.subscriptionId === subscriptionId ? { ...sub, isActive: !currentStatus } : sub
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  const formatDate = (ts) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatFrequency = (freq) => {
    return freq.charAt(0).toUpperCase() + freq.slice(1)
  }

  const isFormValid = () => {
    return (
      formData.subscriberWallet &&
      formData.amount &&
      parseFloat(formData.amount) > 0 &&
      formData.frequency &&
      formData.startDate
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Subscriptions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create recurring billing subscriptions stored on <span className="font-medium text-foreground">Flare Coston2</span>.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'Create Subscription'}
        </Button>
      </div>

      {/* Wallet fallback for email/Google users */}
      {!userWallet && !manualWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-700">No wallet linked to your account. Enter your merchant wallet address to create subscriptions.</p>
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

      {/* Create Subscription Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateSubscription} className="rounded-xl border border-border bg-background p-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this subscription for?"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Subscriber Wallet Address</label>
            <input
              type="text"
              required
              value={formData.subscriberWallet}
              onChange={(e) => setFormData({ ...formData, subscriberWallet: e.target.value })}
              placeholder="0x... (subscriber's wallet address)"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">Subscriber will see this in their Bills tab.</p>
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
              <label className="mb-2 block text-sm font-medium text-foreground">Frequency</label>
              <select
                required
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                {FREQUENCY_OPTIONS.map((freq) => (
                  <option key={freq} value={freq}>
                    {formatFrequency(freq)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Start Date</label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                min={getMinDate()}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
              <p className="mt-1 text-xs text-muted-foreground">Must be today or later</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">End Date (Optional)</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                min={formData.startDate || getMinDate()}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
              <p className="mt-1 text-xs text-muted-foreground">Leave empty for ongoing subscription</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || !effectiveWallet || !isFormValid()}>
            {loading ? 'Creating subscription...' : 'Create Subscription → Store on Flare Coston2'}
          </Button>
        </form>
      )}

      {/* Subscriptions List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground">Active Subscriptions</h3>
          <div className="flex items-center gap-3">
            {fetching && <span className="text-xs text-muted-foreground">Refreshing...</span>}
            {effectiveWallet && (
              <button onClick={fetchSubscriptions} className="text-xs text-primary hover:underline">
                Refresh
              </button>
            )}
          </div>
        </div>

        {subscriptions.length > 0 ? (
          subscriptions.map((sub) => (
            <div key={sub.subscriptionId} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-xs text-muted-foreground">{sub.subscriptionId}</p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        sub.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {sub.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {formatFrequency(sub.frequency)}
                    </span>
                  </div>
                  {sub.description && <p className="mt-1 text-sm text-foreground">{sub.description}</p>}
                  {sub.subscriber && (
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">To: {sub.subscriber}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(sub.startDate)}
                    {sub.endDate && ` — ${formatDate(sub.endDate)}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Created: {formatDate(sub.createdAt)}</p>
                </div>
                <p className="text-lg font-semibold text-foreground">${Number(sub.amountUSD).toFixed(2)}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleSubscriptionStatus(sub.subscriptionId, sub.isActive)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {sub.isActive ? 'Pause Subscription' : 'Resume Subscription'}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {effectiveWallet ? 'No subscriptions yet. Create one to get started.' : 'Connect a wallet to create subscriptions.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
