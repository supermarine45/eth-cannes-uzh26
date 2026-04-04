import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TradeTab() {
  const [tradeType, setTradeType] = useState('buy')
  const [fromToken, setFromToken] = useState('USDC')
  const [toToken, setToToken] = useState('ETH')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const handleExecuteTrade = async () => {
    setLoading(true)
    try {
      // TODO: Integrate with trading service (Uniswap/DEX)
      console.log('Execute trade:', { tradeType, fromToken, toToken, amount })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Trade</h2>
        <p className="mt-1 text-sm text-muted-foreground">Swap cryptocurrencies securely on decentralized exchanges.</p>
      </div>

      <div className="rounded-xl border border-border bg-background p-6">
        <div className="mb-6 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={tradeType === 'buy'}
              onChange={() => setTradeType('buy')}
              className="h-4 w-4 cursor-pointer"
            />
            <span className="text-sm font-medium text-foreground">Buy</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={tradeType === 'sell'}
              onChange={() => setTradeType('sell')}
              className="h-4 w-4 cursor-pointer"
            />
            <span className="text-sm font-medium text-foreground">Sell</span>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">You {tradeType === 'buy' ? 'pay' : 'send'}</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              />
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                <option>USDC</option>
                <option>USDT</option>
                <option>DAI</option>
                <option>ETH</option>
              </select>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => {
                const temp = fromToken
                setFromToken(toToken)
                setToToken(temp)
              }}
              className="rounded-full border border-border bg-card p-2 hover:bg-muted transition"
            >
              ⇄
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">You {tradeType === 'buy' ? 'receive' : 'get'}</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Result amount"
                disabled
                className="flex-1 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground outline-none"
              />
              <select
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40"
              >
                <option>ETH</option>
                <option>USDC</option>
                <option>USDT</option>
                <option>DAI</option>
              </select>
            </div>
          </div>
        </div>

        <Button
          onClick={handleExecuteTrade}
          disabled={!amount || loading}
          className="mt-6 w-full"
        >
          {loading ? 'Processing...' : `Swap ${fromToken} for ${toToken}`}
        </Button>
      </div>
    </div>
  )
}
