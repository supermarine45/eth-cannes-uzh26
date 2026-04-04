import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

export default function BillsTab({ userWallet }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userWallet) return
    const fetchBills = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/bills?wallet=${userWallet}`)
        if (res.ok) {
          const data = await res.json()
          setBills(data)
        }
      } catch {
        // registry not yet configured
      } finally {
        setLoading(false)
      }
    }
    fetchBills()
  }, [userWallet])

  const formatDate = (ts) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const statusColor = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'paid') return 'bg-green-100 text-green-700'
    if (s === 'expired' || s === 'cancelled') return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  const pending = bills.filter((b) => b.status === 'Pending')
  const paid = bills.filter((b) => b.status === 'Paid')

  const totalPending = pending.reduce((sum, b) => sum + Number(b.amountUSD), 0).toFixed(2)
  const totalPaid = paid.reduce((sum, b) => sum + Number(b.amountUSD), 0).toFixed(2)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices sent to your wallet, stored on <span className="font-medium text-foreground">Flare Coston2</span>.
        </p>
      </div>

      {!userWallet ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Connect your wallet to view bills sent to you.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Pending Bills</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">${totalPending}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">${totalPaid}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">Incoming Invoices</h3>
              {loading && <span className="text-xs text-muted-foreground">Loading from chain...</span>}
            </div>

            {bills.length > 0 ? (
              bills.map((bill, idx) => (
                <div key={bill.paymentId || idx} className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(bill.status)}`}>
                          {bill.status}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Flare Coston2
                        </span>
                      </div>
                      {bill.description && <p className="mt-1 text-sm text-foreground">{bill.description}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground font-mono">From: {bill.merchant}</p>
                      {bill.dueDate && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Due: {formatDate(bill.dueDate)}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Created: {formatDate(bill.createdAt)}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-foreground">${Number(bill.amountUSD).toFixed(2)}</p>
                  </div>

                  {bill.status === 'Pending' && bill.gatewayUrl && (
                    <a href={bill.gatewayUrl} target="_blank" rel="noopener noreferrer">
                      <Button className="w-full">Pay Now via WalletConnect</Button>
                    </a>
                  )}
                </div>
              ))
            ) : !loading ? (
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
