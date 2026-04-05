import { useState } from 'react'
import UserPaymentPanel from '@/components/payments/UserPaymentPanel'
import MerchantPaymentPanel from '@/components/payments/MerchantPaymentPanel'

export default function PaymentsTab() {
  const [flowContext, setFlowContext] = useState({
    paymentId: '',
    optionId: '',
    paymentLink: '',
  })

  const handleFlowUpdate = (nextValues) => {
    setFlowContext((previous) => ({
      ...previous,
      ...(nextValues || {}),
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Payments</h2>
        <p className="mt-1 text-sm text-muted-foreground">Run the full WalletConnect payment workflow: inspect, choose option, load actions, and confirm.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <UserPaymentPanel onFlowUpdate={handleFlowUpdate} />
        <MerchantPaymentPanel flowContext={flowContext} onFlowUpdate={handleFlowUpdate} />
      </div>
    </div>
  )
}
