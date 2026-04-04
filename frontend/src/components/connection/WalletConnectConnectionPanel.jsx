import { useState } from 'react'
import { getWalletConnectHealth } from '@/lib/walletconnect'
import JsonViewer from '@/components/shared/JsonViewer'

const shell = 'rounded-xl border border-border bg-card p-5 shadow-sm'
const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40'
const button = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60'

const TESTNETS = {
  11155111: {
    label: 'Ethereum Sepolia',
    chainIdHex: '0xaa36a7',
    chainName: 'Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  84532: {
    label: 'Base Sepolia',
    chainIdHex: '0x14a34',
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Base Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
}

function getWalletProviderName(provider, fallbackIndex) {
  if (provider?.isMetaMask) return 'MetaMask'
  if (provider?.isCoinbaseWallet) return 'Coinbase Wallet'
  if (provider?.isRabby) return 'Rabby'
  if (provider?.isTrust || provider?.isTrustWallet) return 'Trust Wallet'
  if (provider?.isBraveWallet) return 'Brave Wallet'
  return `Injected Wallet ${fallbackIndex + 1}`
}

function getInjectedProviders() {
  if (!window.ethereum) return []

  const candidates = Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0
    ? window.ethereum.providers
    : [window.ethereum]

  return candidates.map((provider, index) => ({
    id: `${getWalletProviderName(provider, index)}-${index}`,
    name: getWalletProviderName(provider, index),
    provider,
  }))
}

function isValidEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function toWeiHex(amountEth) {
  const trimmed = amountEth.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive number.')
  }

  const [whole, fraction = ''] = trimmed.split('.')
  const paddedFraction = `${fraction}000000000000000000`.slice(0, 18)
  const wei = BigInt(whole) * 10n ** 18n + BigInt(paddedFraction)

  if (wei <= 0n) {
    throw new Error('Amount must be greater than zero.')
  }

  return `0x${wei.toString(16)}`
}

export default function WalletConnectConnectionPanel({ onConnected }) {
  const [providerOptions, setProviderOptions] = useState(() => getInjectedProviders())
  const [selectedProviderId, setSelectedProviderId] = useState(() => getInjectedProviders()?.[0]?.id ?? '')
  const [connectingWallet, setConnectingWallet] = useState(false)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [sendingTx, setSendingTx] = useState(false)
  const [error, setError] = useState('')
  const [healthResponse, setHealthResponse] = useState(null)
  const [txHash, setTxHash] = useState('')
  const [form, setForm] = useState({
    walletAddress: '',
    chainIds: '1,8453',
    recipientAddress: '',
    amountEth: '0.001',
    txChainId: '11155111',
  })

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleRefreshProviders = () => {
    const providers = getInjectedProviders()
    setProviderOptions(providers)
    if (providers.length > 0 && !providers.find((entry) => entry.id === selectedProviderId)) {
      setSelectedProviderId(providers[0].id)
    }
  }

  const resolveSelectedProvider = () => {
    return providerOptions.find((entry) => entry.id === selectedProviderId) ?? null
  }

  const handleConnectWallet = async () => {
    setConnectingWallet(true)
    setError('')

    try {
      if (!window.ethereum || providerOptions.length === 0) {
        throw new Error('No injected wallet provider found. Install MetaMask, Coinbase Wallet, Rabby, or another EVM wallet extension.')
      }

      const selected = resolveSelectedProvider()
      if (!selected) {
        throw new Error('Please select a wallet provider.')
      }

      const accounts = await selected.provider.request({ method: 'eth_requestAccounts' })
      const chainIdHex = await selected.provider.request({ method: 'eth_chainId' })

      const walletAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : ''
      const chainId = Number.parseInt(chainIdHex, 16)

      if (!walletAddress) {
        throw new Error(`${selected.name} did not return an account.`)
      }

      if (!Number.isInteger(chainId) || chainId <= 0) {
        throw new Error(`${selected.name} returned an invalid chain id.`)
      }

      setForm((prev) => ({
        ...prev,
        walletAddress,
        chainIds: String(chainId),
        txChainId: String(chainId),
      }))

      onConnected?.({
        walletAddress,
        chainIds: [chainId],
        providerName: selected.name,
      })
    } catch (connectError) {
      setError(connectError.message)
    } finally {
      setConnectingWallet(false)
    }
  }

  const handleHealthCheck = async () => {
    setCheckingHealth(true)
    setError('')

    try {
      const apiResponse = await getWalletConnectHealth()
      setHealthResponse(apiResponse)
    } catch (checkError) {
      setError(checkError.message)
    } finally {
      setCheckingHealth(false)
    }
  }

  const handleSendTestnetTransaction = async () => {
    setSendingTx(true)
    setError('')
    setTxHash('')

    try {
      if (!window.ethereum) {
        throw new Error('No injected wallet provider found. Install a compatible wallet extension first.')
      }

      const selected = resolveSelectedProvider()
      const provider = selected?.provider ?? window.ethereum

      const from = form.walletAddress.trim()
      const to = form.recipientAddress.trim()
      const txChainId = Number(form.txChainId)
      const network = TESTNETS[txChainId]

      if (!isValidEvmAddress(from)) {
        throw new Error('Connect a wallet first so a valid sender address is available.')
      }

      if (!isValidEvmAddress(to)) {
        throw new Error('Recipient address is invalid.')
      }

      if (!network) {
        throw new Error('Selected chain is not a supported testnet.')
      }

      const currentChainHex = await provider.request({ method: 'eth_chainId' })
      const currentChainId = Number.parseInt(currentChainHex, 16)

      if (currentChainId !== txChainId) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: network.chainIdHex }],
          })
        } catch (switchError) {
          if (switchError?.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: network.chainIdHex,
                  chainName: network.chainName,
                  nativeCurrency: network.nativeCurrency,
                  rpcUrls: network.rpcUrls,
                  blockExplorerUrls: network.blockExplorerUrls,
                },
              ],
            })
          } else {
            throw switchError
          }
        }
      }

      const value = toWeiHex(form.amountEth)
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to, value }],
      })

      setTxHash(hash)
    } catch (txError) {
      setError(txError.message)
    } finally {
      setSendingTx(false)
    }
  }

  return (
    <section className={shell}>
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">WALLET PROVIDERS</p>
      <h2 className="mt-2 text-left text-xl font-semibold text-foreground">Connect Wallet and Send Testnet Transactions</h2>
      <p className="mt-2 text-left text-sm text-muted-foreground">Connect with MetaMask or other injected wallets, then send testnet ETH to a target EVM wallet address.</p>

      <form className="mt-5 grid gap-4 text-left md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label className={label} htmlFor="walletProvider">Wallet Provider</label>
          <select className={input} id="walletProvider" value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
            {providerOptions.length === 0 ? <option value="">No wallet detected</option> : null}
            {providerOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button type="button" onClick={handleRefreshProviders} className={`${button} bg-background text-foreground hover:bg-muted`}>
            Refresh Providers
          </button>
        </div>

        <div>
          <label className={label} htmlFor="walletAddress">Wallet Address</label>
          <input className={input} id="walletAddress" name="walletAddress" value={form.walletAddress} onChange={updateField} placeholder="0x..." required />
        </div>

        <div>
          <label className={label} htmlFor="chainIds">Connected Chain IDs</label>
          <input className={input} id="chainIds" name="chainIds" value={form.chainIds} onChange={updateField} placeholder="11155111" required />
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button type="button" onClick={handleConnectWallet} className={`${button} bg-primary text-primary-foreground hover:opacity-90`} disabled={connectingWallet}>
            {connectingWallet ? 'Connecting Wallet...' : 'Connect Selected Wallet'}
          </button>
          <button type="button" onClick={handleHealthCheck} className={`${button} bg-muted text-foreground hover:bg-muted/80`} disabled={checkingHealth}>
            {checkingHealth ? 'Checking...' : 'Check Backend Health'}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive">{error}</p>}
      {healthResponse && (
        <div>
          <p className="mt-4 text-left text-sm font-medium text-foreground">Health Response</p>
          <JsonViewer value={healthResponse} />
        </div>
      )}

      <div className="mt-6 rounded-md border border-border p-4 text-left">
        <p className="text-sm font-medium text-foreground">Testnet Transfer</p>
        <p className="mt-1 text-xs text-muted-foreground">Send a transaction on a supported testnet to a given EVM wallet address.</p>

        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <label className={label} htmlFor="txChainId">Testnet</label>
            <select className={input} id="txChainId" name="txChainId" value={form.txChainId} onChange={updateField}>
              {Object.entries(TESTNETS).map(([chainId, network]) => (
                <option key={chainId} value={chainId}>{network.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="amountEth">Amount (ETH)</label>
            <input className={input} id="amountEth" name="amountEth" value={form.amountEth} onChange={updateField} placeholder="0.001" />
          </div>

          <div className="md:col-span-2">
            <label className={label} htmlFor="recipientAddress">Recipient Wallet Address</label>
            <input className={input} id="recipientAddress" name="recipientAddress" value={form.recipientAddress} onChange={updateField} placeholder="0x..." />
          </div>

          <div className="md:col-span-2">
            <button type="button" onClick={handleSendTestnetTransaction} className={`${button} bg-primary text-primary-foreground hover:opacity-90`} disabled={sendingTx}>
              {sendingTx ? 'Sending Transaction...' : 'Send Testnet Transaction'}
            </button>
          </div>
        </div>

        {txHash && <p className="mt-3 break-all text-xs text-foreground">Transaction hash: {txHash}</p>}
      </div>
    </section>
  )
}
