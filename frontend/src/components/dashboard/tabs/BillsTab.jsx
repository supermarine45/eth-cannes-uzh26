import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_AUTH_BASE_URL || ''

// Base mainnet
const BASE_CHAIN_ID = '0x2105' // 8453 in hex
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_DECIMALS = 6

// Encode ERC20 transfer(address, uint256) calldata without ethers dependency
function encodeUSDCTransfer(toAddress, amountUSD) {
  const selector = 'a9059cbb' // transfer(address,uint256)
  const paddedTo = toAddress.slice(2).toLowerCase().padStart(64, '0')
  const amountRaw = BigInt(Math.round(amountUSD * 10 ** USDC_DECIMALS))
  const paddedAmount = amountRaw.toString(16).padStart(64, '0')
  return `0x${selector}${paddedTo}${paddedAmount}`
}

async function switchToBase() {
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: BASE_CHAIN_ID }],
  })
}

async function addBaseNetwork() {
  await window.ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: BASE_CHAIN_ID,
      chainName: 'Base',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    }],
  })
}

export default function BillsTab({ userWallet }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [txResults, setTxResults] = useState({}) // paymentId → { hash, error }

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

  const handlePayWithMetaMask = async (bill) => {
    if (!window.ethereum) {
      alert('MetaMask not detected. Please install MetaMask.')
      return
    }

    setPayingId(bill.paymentId)
    setTxResults((prev) => ({ ...prev, [bill.paymentId]: null }))

    try {
      // 1. Connect MetaMask
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const from = accounts[0]

      // 2. Ensure on Base network
      const currentChain = await window.ethereum.request({ method: 'eth_chainId' })
      if (currentChain !== BASE_CHAIN_ID) {
        try {
          await switchToBase()
        } catch (switchErr) {
          if (switchErr.code === 4902) await addBaseNetwork()
          else throw new Error('Please switch MetaMask to Base network.')
        }
      }

      // 3. Send USDC transfer to merchant wallet
      const data = encodeUSDCTransfer(bill.merchant, bill.amountUSD)
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: USDC_BASE,
          data,
          chainId: BASE_CHAIN_ID,
        }],
      })

      setTxResults((prev) => ({ ...prev, [bill.paymentId]: { hash: txHash } }))

      // 4. Mark as paid in local state
      setBills((prev) =>
        prev.map((b) => b.paymentId === bill.paymentId ? { ...b, status: 'Paid' } : b)
      )
    } catch (err) {
      const message = err?.message || 'Payment failed'
      setTxResults((prev) => ({ ...prev, [bill.paymentId]: { error: message } }))
    } finally {
      setPayingId(null)
    }
  }

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
          Invoices sent to your wallet, stored on <span className="font-medium text-foreground">Flare Coston2</span>. Pay directly with MetaMask on Base.
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
              bills.map((bill, idx) => {
                const txResult = txResults[bill.paymentId]
                const isPaying = payingId === bill.paymentId

                return (
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
                        <p className="mt-0.5 text-xs text-muted-foreground">Created: {formatDate(bill.createdAt)}</p>
                      </div>
                      <p className="text-lg font-semibold text-foreground">${Number(bill.amountUSD).toFixed(2)} USDC</p>
                    </div>

                    {/* Transaction result */}
                    {txResult?.hash && (
                      <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                        Payment sent!{' '}
                        <a
                          href={`https://basescan.org/tx/${txResult.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline"
                        >
                          View on Basescan
                        </a>
                      </div>
                    )}
                    {txResult?.error && (
                      <p className="text-xs text-red-500">{txResult.error}</p>
                    )}

                    {/* Pay button */}
                    {bill.status === 'Pending' && !txResult?.hash && (
                      <Button
                        className="w-full"
                        disabled={isPaying}
                        onClick={() => handlePayWithMetaMask(bill)}
                      >
                        {isPaying ? 'Waiting for MetaMask...' : `Pay $${Number(bill.amountUSD).toFixed(2)} USDC with MetaMask`}
                      </Button>
                    )}
                  </div>
                )
              })
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
