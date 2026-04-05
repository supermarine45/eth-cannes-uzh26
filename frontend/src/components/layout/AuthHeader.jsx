export default function AuthHeader() {

  return (
    <header className="mb-6 rounded-3xl border border-border/70 bg-card/90 p-6 text-left shadow-sm backdrop-blur md:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Authentication Console</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Access to Payments, Trading and More
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Powered by Flare, ENS, UniSwap and WalletConnect
          </p>
        </div>

        
      </div>
    </header>
  )
}
