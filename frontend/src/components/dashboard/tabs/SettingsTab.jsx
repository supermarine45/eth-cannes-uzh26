import { useState } from 'react'
import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'
import { deleteAuthAccount } from '@/lib/auth'

function maskWalletAddress(address) {
  const value = String(address || '').trim()
  if (value.length <= 11) {
    return value
  }

  return `${value.slice(0, 6)}...${value.slice(-5)}`
}

function normalizeAddress(value) {
  const trimmed = String(value || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error('Enter a valid Ethereum wallet address.')
  }

  return trimmed.toLowerCase()
}

export default function SettingsTab() {
  const { profile, user, walletAddresses, session, clearSession, saveOnboarding } = useAuth()
  const [showNotifications, setShowNotifications] = useState(true)
  const [showEmails, setShowEmails] = useState(true)
  const [walletAddressInput, setWalletAddressInput] = useState('')
  const [walletLabelInput, setWalletLabelInput] = useState('')
  const [walletError, setWalletError] = useState('')
  const [walletSuccess, setWalletSuccess] = useState('')
  const [copiedAddress, setCopiedAddress] = useState('')
  const [savingWallets, setSavingWallets] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('')
  const [showAddWalletPopover, setShowAddWalletPopover] = useState(false)

  const deleteAccountPhrase = 'I want to Delete my account'

  const accountType = profile?.account_type || 'individual'
  const accountTypeLabel = accountType === 'business' ? 'Merchant' : 'Individual'

  
  const openDeleteAccountDialog = () => {
    setWalletError('')
    setWalletSuccess('')
    setDeleteAccountConfirmation('')
    setShowDeleteAccountDialog(true)
  }

  const closeDeleteAccountDialog = () => {
    if (deletingAccount) {
      return
    }

    setShowDeleteAccountDialog(false)
    setDeleteAccountConfirmation('')
  }

  const handleDeleteAccount = async () => {
    setWalletError('')
    setWalletSuccess('')

    if (!session?.accessToken) {
      setWalletError('No active session found.')
      return
    }

    if (deleteAccountConfirmation !== deleteAccountPhrase) {
      setWalletError(`Type "${deleteAccountPhrase}" to confirm account deletion.`)
      return
    }

    try {
      setDeletingAccount(true)
      await deleteAuthAccount(session.accessToken)
      clearSession('Your account was deleted.')
      setShowDeleteAccountDialog(false)
      setDeleteAccountConfirmation('')
      window.location.href = '/auth'
    } catch (error) {
      setWalletError(error.message || 'Unable to delete account.')
    } finally {
      setDeletingAccount(false)
    }
  }

  const handleCopyAddress = async (walletAddress) => {
    if (!walletAddress) {
      return
    }

    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopiedAddress(walletAddress)
      window.setTimeout(() => {
        setCopiedAddress((current) => (current === walletAddress ? '' : current))
      }, 1600)
    } catch {
      setWalletError('Unable to copy wallet address. Please allow clipboard permission.')
    }
  }

  const getCurrentWallets = () => (walletAddresses || []).map((entry) => ({
    address: entry.wallet_address || entry.address,
    label: entry.label || '',
    isPrimary: Boolean(entry.is_primary),
  }))

  const persistWallets = async (nextWallets) => {
    if (!profile?.full_name || !profile?.date_of_birth || !profile?.account_type) {
      throw new Error('Complete onboarding first before editing wallets in Settings.')
    }

    await saveOnboarding({
      fullName: profile.full_name,
      dateOfBirth: profile.date_of_birth,
      ensName: profile.ens_name,
      accountType: profile.account_type,
      companyName: profile.account_type === 'business' ? profile.company_name : null,
      businessAddress: profile.account_type === 'business' ? profile.business_address : null,
      email: user?.email || profile?.email || null,
      walletAddresses: nextWallets.map((entry, index) => ({
        address: entry.address,
        label: entry.label || '',
        isPrimary: entry.isPrimary || index === 0,
      })),
    })
  }

  const handleAddWallet = async (addressValue, labelValue = '') => {
    setWalletError('')
    setWalletSuccess('')

    try {
      const normalizedAddress = normalizeAddress(addressValue)
      const currentWallets = getCurrentWallets()

      if (currentWallets.some((entry) => entry.address === normalizedAddress)) {
        throw new Error('Wallet already connected.')
      }

      const nextWallets = [
        ...currentWallets,
        {
          address: normalizedAddress,
          label: labelValue.trim(),
          isPrimary: currentWallets.length === 0,
        },
      ]

      setSavingWallets(true)
      await persistWallets(nextWallets)
      setWalletAddressInput('')
      setWalletLabelInput('')
      setShowAddWalletPopover(false)
      setWalletSuccess('Wallet added successfully.')
    } catch (error) {
      setWalletError(error.message || 'Unable to add wallet.')
    } finally {
      setSavingWallets(false)
    }
  }

  const handleMakePrimary = async (targetAddress) => {
    setWalletError('')
    setWalletSuccess('')

    try {
      const normalizedTarget = normalizeAddress(targetAddress)
      const currentWallets = getCurrentWallets()

      if (currentWallets.length <= 1) {
        return
      }

      const nextWallets = currentWallets.map((entry) => ({
        ...entry,
        isPrimary: entry.address === normalizedTarget,
      }))

      setSavingWallets(true)
      await persistWallets(nextWallets)
      setWalletSuccess('Primary wallet updated.')
    } catch (error) {
      setWalletError(error.message || 'Unable to update primary wallet.')
    } finally {
      setSavingWallets(false)
    }
  }

  const handleRemoveWallet = async (targetAddress) => {
    setWalletError('')
    setWalletSuccess('')

    try {
      const normalizedTarget = normalizeAddress(targetAddress)
      const currentWallets = getCurrentWallets()

      if (currentWallets.length <= 1) {
        throw new Error('At least one wallet must remain connected.')
      }

      const filtered = currentWallets.filter((entry) => entry.address !== normalizedTarget)
      if (filtered.length === 0) {
        throw new Error('At least one wallet must remain connected.')
      }

      const hasPrimary = filtered.some((entry) => entry.isPrimary)
      const nextWallets = hasPrimary
        ? filtered
        : filtered.map((entry, index) => ({ ...entry, isPrimary: index === 0 }))

      setSavingWallets(true)
      await persistWallets(nextWallets)
      setWalletSuccess('Wallet removed successfully.')
    } catch (error) {
      setWalletError(error.message || 'Unable to remove wallet.')
    } finally {
      setSavingWallets(false)
    }
  }

  const handleConnectWallet = async () => {
    setWalletError('')
    setWalletSuccess('')

    if (!window.ethereum) {
      setWalletError('MetaMask is required. Please install or unlock MetaMask to continue.')
      return
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : ''
      if (!walletAddress) {
        throw new Error('No wallet address returned by MetaMask.')
      }

      await handleAddWallet(walletAddress, 'Connected wallet')
    } catch (error) {
      setWalletError(error.message || 'Unable to connect wallet.')
    }
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

          {profile?.ens_name && (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-medium text-muted-foreground">ENS Name</p>
              <p className="mt-2 font-medium text-foreground">{profile.ens_name}</p>
            </div>
          )}

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
        <div className="relative flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Connected Wallets</h3>
          <Button
            type="button"
            variant="secondary"
            disabled={savingWallets}
            onClick={() => setShowAddWalletPopover((current) => !current)}
          >
            {showAddWalletPopover ? 'Close' : 'Add Wallet'}
          </Button>

          {showAddWalletPopover ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-full rounded-2xl border border-border bg-card p-4 shadow-xl md:w-[560px]">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40"
                  value={walletAddressInput}
                  onChange={(event) => setWalletAddressInput(event.target.value)}
                  placeholder="0x..."
                />
                <input
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40"
                  value={walletLabelInput}
                  onChange={(event) => setWalletLabelInput(event.target.value)}
                  placeholder="Label, e.g. trading wallet"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingWallets}
                  onClick={() => handleAddWallet(walletAddressInput, walletLabelInput)}
                >
                  {savingWallets ? 'Saving...' : 'Save'}
                </Button>
              </div>

              <div className="mt-3">
                <Button type="button" variant="outline" disabled={savingWallets} onClick={handleConnectWallet}>
                  Connect MetaMask Wallet
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {walletError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {walletError}
          </div>
        ) : null}

        {walletSuccess ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {walletSuccess}
          </div>
        ) : null}
        
        {walletAddresses && walletAddresses.length > 0 ? (
          <div className="space-y-2">
            {walletAddresses.map((wallet) => {
              const walletAddress = wallet.wallet_address || wallet.address
              const canManage = (walletAddresses?.length || 0) > 1

              return (
                <div key={wallet.id || walletAddress} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium text-foreground">{maskWalletAddress(walletAddress)}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleCopyAddress(walletAddress)}>
                          {copiedAddress === walletAddress ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      {wallet.label && <p className="mt-1 text-xs text-muted-foreground">{wallet.label}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      {wallet.is_primary ? (
                        <span className="inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          Primary
                        </span>
                      ) : null}

                      {canManage && !wallet.is_primary ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={savingWallets}
                          onClick={() => handleMakePrimary(walletAddress)}
                        >
                          Make Primary
                        </Button>
                      ) : null}

                      {canManage ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={savingWallets}
                          onClick={() => handleRemoveWallet(walletAddress)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="destructive" disabled={deletingAccount} onClick={openDeleteAccountDialog} className="w-full">
            Delete Account
          </Button>
        </div>
      </section>

      {showDeleteAccountDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-destructive">Danger zone</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Delete your account permanently</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  This action cannot be undone. Your profile, linked wallet data, and session will be removed from this app.
                </p>
              </div>

              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>This permanently deletes your account from the backend.</li>
                  <li>Your linked profile and wallet records will be removed.</li>
                  <li>You will be signed out immediately after deletion.</li>
                </ul>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="delete-account-confirmation">
                  Type <span className="font-semibold">{deleteAccountPhrase}</span> to confirm
                </label>
                <input
                  id="delete-account-confirmation"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40"
                  value={deleteAccountConfirmation}
                  onChange={(event) => setDeleteAccountConfirmation(event.target.value)}
                  placeholder={deleteAccountPhrase}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {walletError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {walletError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeDeleteAccountDialog} disabled={deletingAccount}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || deleteAccountConfirmation !== deleteAccountPhrase}
                >
                  {deletingAccount ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
