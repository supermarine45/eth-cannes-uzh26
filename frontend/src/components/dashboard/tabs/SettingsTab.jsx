import { useState } from 'react'
import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'

export default function SettingsTab() {
  const { profile, user, walletAddresses, clearSession } = useAuth()
  const [showNotifications, setShowNotifications] = useState(true)
  const [showEmails, setShowEmails] = useState(true)

  const accountType = profile?.account_type || 'individual'
  const accountTypeLabel = accountType === 'business' ? 'Merchant' : 'Individual'

  const handleLogout = () => {
    clearSession('You have been logged out.')
    window.location.href = '/auth'
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account preferences and settings.</p>
      </div>

      {/* Profile Information */}
      <section className="space-y-4 border-b border-border pb-8">
        <h3 className="font-semibold text-foreground">Profile Information</h3>
        
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Full Name</p>
            <p className="mt-2 font-medium text-foreground">{profile?.full_name || 'Not set'}</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Email Address</p>
            <p className="mt-2 font-medium text-foreground">{user?.email || 'Not set'}</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Account Type</p>
            <p className="mt-2 font-medium text-foreground">{accountTypeLabel}</p>
          </div>

          {profile?.date_of_birth && (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground">Date of Birth</p>
              <p className="mt-2 font-medium text-foreground">
                {new Date(profile.date_of_birth).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          {profile?.company_name && accountType === 'business' && (
            <>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Company Name</p>
                <p className="mt-2 font-medium text-foreground">{profile.company_name}</p>
              </div>

              {profile?.business_address && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-medium text-muted-foreground">Business Address</p>
                  <p className="mt-2 font-medium text-foreground">{profile.business_address}</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Connected Wallets */}
      <section className="space-y-4 border-b border-border pb-8">
        <h3 className="font-semibold text-foreground">Connected Wallets</h3>
        
        {walletAddresses && walletAddresses.length > 0 ? (
          <div className="space-y-2">
            {walletAddresses.map((wallet) => (
              <div key={wallet.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{wallet.wallet_address}</p>
                    {wallet.label && <p className="mt-1 text-xs text-muted-foreground">{wallet.label}</p>}
                    {wallet.is_primary && (
                      <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        Primary
                      </span>
                    )}
                  </div>
                  <button className="text-xs font-medium text-destructive hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No wallets connected</p>
        )}
      </section>

      {/* Notification Settings */}
      <section className="space-y-4 border-b border-border pb-8">
        <h3 className="font-semibold text-foreground">Notifications</h3>
        
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition">
          <input
            type="checkbox"
            checked={showNotifications}
            onChange={(e) => setShowNotifications(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Push Notifications</p>
            <p className="text-xs text-muted-foreground">Receive real-time alerts for transactions</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition">
          <input
            type="checkbox"
            checked={showEmails}
            onChange={(e) => setShowEmails(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Email Notifications</p>
            <p className="text-xs text-muted-foreground">Get email summaries of your activity</p>
          </div>
        </label>
      </section>

      {/* Session Management */}
      <section className="space-y-4">
        <h3 className="font-semibold text-foreground">Session</h3>
        <Button variant="destructive" onClick={handleLogout} className="w-full">
          Logout
        </Button>
      </section>
    </div>
  )
}
