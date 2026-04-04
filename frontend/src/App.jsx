import { useState } from 'react'
import WalletConnectConnectionPanel from './components/connection/WalletConnectConnectionPanel'

export default function App() {
  const [connection, setConnection] = useState(null)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
      <header className="mb-8 text-left">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">WALLET CONNECTION</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">Multi-Wallet Connection Interface</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Connect with MetaMask or other injected wallets, then send testnet transactions to a target EVM wallet address.
        </p>
      </header>

      <div className="mb-6">
        <WalletConnectConnectionPanel
          onConnected={(details) => {
            setConnection(details)
          }}
        />
      </div>

      {connection && (
        <section className="mb-6 rounded-lg border border-border bg-muted/20 p-3 text-left text-sm text-foreground">
          Connected wallet: <span className="font-semibold">{connection.walletAddress}</span>
          {connection.providerName ? <span className="ml-2 text-muted-foreground">via {connection.providerName}</span> : null}
        </section>
      )}
    </main>
  )
}
