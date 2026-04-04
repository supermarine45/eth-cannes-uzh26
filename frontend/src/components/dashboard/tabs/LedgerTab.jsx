import { useState } from 'react'

export default function LedgerTab() {
  const [transactions] = useState([
    {
      id: '1',
      type: 'receive',
      token: 'USDC',
      amount: '500.00',
      from: '0x1234...5678',
      date: '2026-04-03',
      hash: '0xabcd...ef01',
      status: 'confirmed',
    },
    {
      id: '2',
      type: 'send',
      token: 'ETH',
      amount: '0.5',
      to: '0x9876...5432',
      date: '2026-04-02',
      hash: '0x2345...6789',
      status: 'confirmed',
    },
    {
      id: '3',
      type: 'swap',
      token: 'USDC → ETH',
      amount: '1000.00',
      date: '2026-04-01',
      hash: '0x7890...abcd',
      status: 'confirmed',
    },
    {
      id: '4',
      type: 'receive',
      token: 'DAI',
      amount: '250.00',
      from: '0x5678...9012',
      date: '2026-03-31',
      hash: '0xcdef...0123',
      status: 'confirmed',
    },
  ])

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'send':
        return '↗️'
      case 'receive':
        return '↙️'
      case 'swap':
        return '⇄'
      default:
        return '◆'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-600'
      case 'pending':
        return 'text-amber-600'
      case 'failed':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Transaction Ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">Complete history of all your transactions and swaps.</p>
      </div>

      <div className="space-y-3">
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <div key={tx.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground capitalize">{tx.type}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{tx.hash}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    {tx.type === 'send' ? '-' : '+'}
                    {tx.amount} {tx.token}
                  </p>
                  <p className={`mt-2 text-xs font-medium capitalize ${getStatusColor(tx.status)}`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
