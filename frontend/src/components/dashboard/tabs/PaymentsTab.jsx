import UserPaymentPanel from '@/components/payments/UserPaymentPanel'

export default function PaymentsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Payments</h2>
        <p className="mt-1 text-sm text-muted-foreground">Send and receive payments securely using WalletConnect.</p>
      </div>

      <UserPaymentPanel />
    </div>
  )
}
