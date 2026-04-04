import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

const COMMODITIES = [
  { key: 'GOLD', name: 'Gold', unit: 'troy oz', fdc: true },
  { key: 'SILVER', name: 'Silver', unit: 'troy oz', fdc: true },
  { key: 'PLATINUM', name: 'Platinum', unit: 'troy oz', fdc: true },
  { key: 'PALLADIUM', name: 'Palladium', unit: 'troy oz', fdc: true },
  { key: 'OIL_WTI', name: 'WTI Crude Oil', unit: 'barrel', fdc: false },
  { key: 'OIL_BRENT', name: 'Brent Crude Oil', unit: 'barrel', fdc: false },
  { key: 'NATURAL_GAS', name: 'Natural Gas', unit: 'MMBtu', fdc: false },
  { key: 'COPPER', name: 'Copper', unit: 'lb', fdc: false },
  { key: 'WHEAT', name: 'Wheat', unit: 'bushel', fdc: false },
  { key: 'CORN', name: 'Corn', unit: 'bushel', fdc: false },
  { key: 'COFFEE', name: 'Coffee', unit: 'lb', fdc: false },
  { key: 'SUGAR', name: 'Sugar', unit: 'lb', fdc: false },
]

const CRYPTOS = ['ETH', 'BTC', 'XRP']

export default function TradeTab() {
  const [commodities, setCommodities] = useState([])
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [selectedCommodity, setSelectedCommodity] = useState('GOLD')
  const [selectedCrypto, setSelectedCrypto] = useState('ETH')
  const [crossRate, setCrossRate] = useState(null)
  const [loadingCross, setLoadingCross] = useState(false)

  // Uniswap quote
  const [invoiceUSD, setInvoiceUSD] = useState('')
  const [userWallet, setUserWallet] = useState('')
  const [quote, setQuote] = useState(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState(null)

  // Fetch all commodity prices on mount
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/commodity`)
        const data = await res.json()
        setCommodities(data.filter((d) => !d.error))
      } catch {
        // silently fail, prices will just be empty
      } finally {
        setLoadingPrices(false)
      }
    }
    fetchPrices()
  }, [])

  // Fetch cross-rate when commodity or crypto changes
  useEffect(() => {
    const fetchCross = async () => {
      setLoadingCross(true)
      setCrossRate(null)
      try {
        const res = await fetch(`${API_BASE}/api/commodity/${selectedCommodity}/in/${selectedCrypto}`)
        const data = await res.json()
        if (!data.error) setCrossRate(data)
      } catch {
        // silently fail
      } finally {
        setLoadingCross(false)
      }
    }
    fetchCross()
  }, [selectedCommodity, selectedCrypto])

  const handleGetQuote = async (e) => {
    e.preventDefault()
    setLoadingQuote(true)
    setQuoteError(null)
    setQuote(null)
    try {
      const res = await fetch(`${API_BASE}/api/checkout/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceUSD: parseFloat(invoiceUSD),
          userWallet,
          token: 'ETH',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Quote failed')
      setQuote(data)
    } catch (err) {
      setQuoteError(err.message)
    } finally {
      setLoadingQuote(false)
    }
  }

  const priceFor = (key) => {
    const found = commodities.find((c) => c.commodity === key)
    return found ? `$${found.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
  }

  return (
    <div className="space-y-8">

      {/* Commodity Prices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-foreground">Commodity Prices</h2>
          {loadingPrices && <span className="text-xs text-muted-foreground">Loading...</span>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Metals verified via <span className="font-medium text-foreground">Flare FDC Web2Json</span>. Energy &amp; agricultural from Yahoo Finance.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMODITIES.map(({ key, name, unit, fdc }) => (
            <div
              key={key}
              className="rounded-xl border border-border bg-background p-4 cursor-pointer hover:border-primary/50 transition"
              onClick={() => setSelectedCommodity(key)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">per {unit}</p>
                </div>
                {fdc ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">FDC</span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Yahoo</span>
                )}
              </div>
              <p className="mt-3 text-lg font-semibold text-foreground">{priceFor(key)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Commodity / Crypto Cross Rate */}
      <div className="rounded-xl border border-border bg-background p-6">
        <h3 className="font-semibold text-foreground mb-1">Commodity → Crypto Cross Rate</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Commodity price from {selectedCommodity === 'GOLD' || selectedCommodity === 'SILVER' || selectedCommodity === 'PLATINUM' || selectedCommodity === 'PALLADIUM' ? 'Flare FDC' : 'Yahoo Finance'}. Crypto price from <span className="font-medium">Flare FTSO</span>.
        </p>

        <div className="flex gap-3 flex-wrap mb-4">
          <select
            value={selectedCommodity}
            onChange={(e) => setSelectedCommodity(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          >
            {COMMODITIES.map(({ key, name }) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>

          <span className="flex items-center text-muted-foreground text-sm">priced in</span>

          <select
            value={selectedCrypto}
            onChange={(e) => setSelectedCrypto(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          >
            {CRYPTOS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        {loadingCross ? (
          <p className="text-sm text-muted-foreground">Fetching cross rate...</p>
        ) : crossRate ? (
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">
              {crossRate.crossRate.toFixed(6)} {crossRate.crypto}
            </p>
            <p className="text-sm text-muted-foreground">{crossRate.meaning}</p>
            <div className="mt-3 flex gap-6 text-xs text-muted-foreground">
              <span>Commodity: <span className="text-foreground font-medium">${crossRate.commodityUSD?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
              <span>{crossRate.crypto} price: <span className="text-foreground font-medium">${crossRate.cryptoUSD?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a commodity and crypto to see the cross rate.</p>
        )}
      </div>

      {/* Uniswap Swap Quote */}
      <div className="rounded-xl border border-border bg-background p-6">
        <h3 className="font-semibold text-foreground mb-1">Uniswap Swap Quote</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Get a live ETH → USDC swap quote powered by Uniswap. Price from <span className="font-medium">Flare FTSO</span>.
        </p>

        <form onSubmit={handleGetQuote} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Invoice Amount (USD)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={invoiceUSD}
                onChange={(e) => setInvoiceUSD(e.target.value)}
                placeholder="e.g. 25.00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Your Wallet Address</label>
              <input
                type="text"
                required
                value={userWallet}
                onChange={(e) => setUserWallet(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          {quoteError && <p className="text-sm text-red-500">{quoteError}</p>}

          <Button type="submit" disabled={loadingQuote} className="w-full">
            {loadingQuote ? 'Fetching quote...' : 'Get Uniswap Quote (ETH → USDC)'}
          </Button>
        </form>

        {quote && (
          <div className="mt-4 rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
            <p className="font-medium text-foreground">Quote Result</p>
            <div className="grid gap-1 text-muted-foreground">
              <p>ETH price (Flare FTSO): <span className="text-foreground font-medium">${quote.usdPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></p>
              <p>ETH needed: <span className="text-foreground font-medium">{quote.tokenAmount?.toFixed(6)} ETH</span></p>
              <p>USDC out: <span className="text-foreground font-medium">${quote.uniswap?.usdcOut}</span></p>
              <p>Gas fee: <span className="text-foreground font-medium">${quote.uniswap?.gasFeeUSD}</span></p>
              <p>Routing: <span className="text-foreground font-medium">{quote.uniswap?.routing}</span></p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
