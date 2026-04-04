import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function BillsTab() {
  const [bills] = useState([
    {
      id: '1',
      vendor: 'Internet Provider',
      amount: '99.99',
      dueDate: '2026-04-20',
      status: 'pending',
      currency: 'USD',
    },
    {
      id: '2',
      vendor: 'Cloud Services',
      amount: '259.00',
      dueDate: '2026-04-30',
      status: 'pending',
      currency: 'USD',
    },
    {
      id: '3',
      vendor: 'Software License',
      amount: '49.99',
      dueDate: '2026-03-20',
      status: 'paid',
      currency: 'USD',
    },
  ])

  const calculateTotal = (status) => {
    return bills
      .filter((bill) => bill.status === status)
      .reduce((sum, bill) => sum + parseFloat(bill.amount), 0)
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
      <div>
        <h2 className="text-xl font-semibold text-foreground">Bills</h2>
        <p className="mt-1 text-sm text-muted-foreground">Track and manage your bills and recurring payments.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">Pending Bills</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">${calculateTotal('pending')}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">Total Paid</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">${calculateTotal('paid')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-foreground">Recent Bills</h3>
        {bills.length > 0 ? (
          bills.map((bill) => (
            <div key={bill.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{bill.vendor}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Due: {formatDate(bill.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    ${bill.amount} {bill.currency}
                  </p>
                  <p className={`mt-1 text-xs font-medium ${bill.status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                    {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                  </p>
                </div>
              </div>
              {bill.status === 'pending' && (
                <Button variant="outline" className="mt-3 w-full text-xs">
                  Pay Now
                </Button>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">No bills yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
