import { useState } from 'react'
import { Button } from '@/components/ui/button'
import MerchantPaymentPanel from '@/components/payments/MerchantPaymentPanel'

export default function InvoicesTab() {
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [invoices] = useState([
    {
      id: 'INV-001',
      clientName: 'Acme Corporation',
      clientEmail: 'billing@acme.com',
      amount: '5000.00',
      currency: 'USDC',
      status: 'paid',
      dueDate: '2026-03-31',
      issueDate: '2026-03-01',
    },
    {
      id: 'INV-002',
      clientName: 'Tech Startup Inc',
      clientEmail: 'finance@techstartup.com',
      amount: '2500.00',
      currency: 'USDC',
      status: 'pending',
      dueDate: '2026-04-15',
      issueDate: '2026-04-01',
    },
    {
      id: 'INV-003',
      clientName: 'Global Services Ltd',
      clientEmail: 'accounts@globalservices.com',
      amount: '7500.00',
      currency: 'USDC',
      status: 'pending',
      dueDate: '2026-04-30',
      issueDate: '2026-03-15',
    },
  ])

  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    description: '',
    amount: '',
    currency: 'USDC',
    dueDate: '',
  })

  const handleGenerateInvoice = (e) => {
    e.preventDefault()
    // TODO: Generate invoice and send to client
    console.log('Generate invoice:', formData)
    setFormData({
      clientName: '',
      clientEmail: '',
      description: '',
      amount: '',
      currency: 'USDC',
      dueDate: '',
    })
    setShowGenerateForm(false)
  }

  const calculateTotals = (status) => {
    return invoices
      .filter((inv) => inv.status === status)
      .reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
      .toFixed(2)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Invoices</h2>
          <p className="mt-1 text-sm text-muted-foreground">Generate and manage invoices for your clients.</p>
        </div>
        <Button onClick={() => setShowGenerateForm(!showGenerateForm)}>
          {showGenerateForm ? 'Cancel' : 'Generate Invoice'}
        </Button>
      </div>

      {/* Generate Invoice Form */}
      {showGenerateForm && (
        <form onSubmit={handleGenerateInvoice} className="rounded-xl border border-border bg-background p-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Client Name</label>
            <input
              type="text"
              required
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              placeholder="Enter client name"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Client Email</label>
            <input
              type="email"
              required
              value={formData.clientEmail}
              onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
              placeholder="client@example.com"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What are you billing for?"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Amount</label>
              <input
                type="number"
                required
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                <option>USDC</option>
                <option>USDT</option>
                <option>DAI</option>
                <option>ETH</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Due Date</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          <Button type="submit" className="w-full">
            Create & Send Invoice
          </Button>
        </form>
      )}

      {/* Invoice Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">Pending Invoices</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">${calculateTotals('pending')}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">Total Paid</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">${calculateTotals('paid')}</p>
        </div>
      </div>

      {/* Invoice List */}
      <div className="space-y-3">
        <h3 className="font-medium text-foreground">Recent Invoices</h3>
        {invoices.length > 0 ? (
          invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-sm font-semibold text-foreground">{invoice.id}</p>
                    <p className={`text-xs font-medium px-2 py-1 rounded-full ${
                      invoice.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </p>
                  </div>
                  <p className="mt-2 font-medium text-foreground">{invoice.clientName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{invoice.clientEmail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Due: {formatDate(invoice.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-foreground">
                    {invoice.amount} {invoice.currency}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button className="text-xs font-medium text-primary hover:underline">
                      View
                    </button>
                    <button className="text-xs font-medium text-primary hover:underline">
                      Resend
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">No invoices yet. Create one to get started!</p>
          </div>
        )}
      </div>

      {/* Merchant Payment Integration */}
      <section className="mt-8 border-t border-border pt-8">
        <h3 className="mb-4 font-medium text-foreground">Payment Links</h3>
        <MerchantPaymentPanel />
      </section>
    </div>
  )
}
