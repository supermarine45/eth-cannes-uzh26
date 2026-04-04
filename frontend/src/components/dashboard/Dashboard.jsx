import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'
import WalletBalanceTab from './tabs/WalletBalanceTab'
import TradeTab from './tabs/TradeTab'
import PaymentsTab from './tabs/PaymentsTab'
import BillsTab from './tabs/BillsTab'
import LedgerTab from './tabs/LedgerTab'
import SettingsTab from './tabs/SettingsTab'
import InvoicesTab from './tabs/InvoicesTab'
import PayeesTab from './tabs/PayeesTab'

const tabConfig = {
  individual: [
    { id: 'wallet', name: 'Wallet Balance', icon: '💰' },
    { id: 'trade', name: 'Trade', icon: '📈' },
    { id: 'payments', name: 'Payments', icon: '💳' },
    { id: 'payees', name: 'Payees', icon: '👥' },
    { id: 'bills', name: 'Bills', icon: '📄' },
    { id: 'ledger', name: 'Ledger', icon: '📊' },
    { id: 'settings', name: 'Settings', icon: '⚙️' },
  ],
  business: [
    { id: 'wallet', name: 'Wallet Balance', icon: '💰' },
    { id: 'trade', name: 'Trade', icon: '📈' },
    { id: 'payments', name: 'Payments', icon: '💳' },
    { id: 'payees', name: 'Payees', icon: '👥' },
    { id: 'invoices', name: 'Invoices', icon: '📋' },
    { id: 'bills', name: 'Bills', icon: '📄' },
    { id: 'ledger', name: 'Ledger', icon: '📊' },
    { id: 'settings', name: 'Settings', icon: '⚙️' },
  ],
}

export default function Dashboard({ activeTab = 'wallet', onTabChange }) {
  const { profile, user, walletAddresses, clearSession } = useAuth()
  const accountType = profile?.account_type || 'individual'
  const tabs = tabConfig[accountType] || tabConfig.individual
  const displayName = profile?.full_name || user?.email || 'User'
  const accountTypeLabel = accountType === 'business' ? 'Merchant' : 'Individual'
  const isMerchant = accountType === 'business'
  const userWallet = walletAddresses?.[0]?.wallet_address || null

  function renderTabContent(tabId) {
    switch (tabId) {
      case 'wallet':   return <WalletBalanceTab />
      case 'trade':    return <TradeTab />
      case 'payments': return <PaymentsTab />
      case 'payees':   return <PayeesTab userWallet={userWallet} />
      case 'invoices': return <InvoicesTab userWallet={userWallet} isMerchant={isMerchant} />
      case 'bills':    return <BillsTab userWallet={userWallet} />
      case 'ledger':   return <LedgerTab />
      case 'settings': return <SettingsTab />
      default:         return <WalletBalanceTab />
    }
  }

  const handleTabChange = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId)
    }
  }

  // Validate tab exists in config, otherwise default to 'wallet'
  const validTab = tabs.some(tab => tab.id === activeTab) ? activeTab : 'wallet'

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,190,92,0.26),transparent_40%),radial-gradient(circle_at_84%_14%,rgba(40,175,255,0.18),transparent_42%),radial-gradient(circle_at_50%_84%,rgba(20,189,151,0.16),transparent_40%)]" />
      
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Welcome, {displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Account type: <span className="font-semibold text-foreground">{accountTypeLabel}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="px-5" 
              onClick={() => { clearSession('Session cleared.'); window.location.href = '/auth?mode=login' }}
            >
              Switch Account
            </Button>
            <Button 
              variant="outline" 
              className="px-5" 
              onClick={() => { clearSession('Session cleared.'); window.location.href = '/auth?mode=signup' }}
            >
              New Account
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card/50 p-1 backdrop-blur">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                validTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur md:p-8">
          {renderTabContent(validTab)}
        </div>
      </div>
    </main>
  )
}
