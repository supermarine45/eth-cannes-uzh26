import { useEffect, useState } from 'react'
import { confirmPayment, getPaymentActions } from '@/lib/walletconnect'
import JsonViewer from '@/components/shared/JsonViewer'

const shell = 'rounded-xl border border-border bg-card p-5 shadow-sm'
const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40'
const button = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60'

function parseSignatures(value) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export default function MerchantPaymentPanel({ flowContext, onFlowUpdate }) {
  const [loadingActions, setLoadingActions] = useState(false)
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [error, setError] = useState('')
  const [actionsResponse, setActionsResponse] = useState(null)
  const [confirmResponse, setConfirmResponse] = useState(null)
  const [form, setForm] = useState({
    paymentId: flowContext?.paymentId ?? '',
    optionId: flowContext?.optionId ?? '',
    signatures: '',
    collectedData: '',
  })

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      paymentId: flowContext?.paymentId ?? prev.paymentId,
      optionId: flowContext?.optionId ?? prev.optionId,
    }))
  }, [flowContext?.paymentId, flowContext?.optionId])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleLoadActions = async (event) => {
    event.preventDefault()
    setLoadingActions(true)
    setError('')
    setActionsResponse(null)

    try {
      const apiResponse = await getPaymentActions({
        paymentId: form.paymentId.trim(),
        optionId: form.optionId.trim(),
      })

      setActionsResponse(apiResponse)
      onFlowUpdate?.({
        paymentId: form.paymentId.trim(),
        optionId: form.optionId.trim(),
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoadingActions(false)
    }
  }

  const handleConfirm = async () => {
    setLoadingConfirm(true)
    setError('')
    setConfirmResponse(null)

    try {
      const signatures = parseSignatures(form.signatures)
      const payload = {
        paymentId: form.paymentId.trim(),
        optionId: form.optionId.trim(),
        signatures,
      }

      if (form.collectedData.trim()) {
        payload.collectedData = JSON.parse(form.collectedData)
      }

      const apiResponse = await confirmPayment(payload)
      setConfirmResponse(apiResponse)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoadingConfirm(false)
    }
  }

  return (
    <section className={shell}>
      <h2 className="mb-4 text-left text-lg font-semibold text-foreground">Merchant Flow: Required Actions and Confirm Payment</h2>
      <form className="grid gap-4 text-left md:grid-cols-2" onSubmit={handleLoadActions}>
        <div>
          <label className={label} htmlFor="paymentId">Payment ID</label>
          <input className={input} id="paymentId" name="paymentId" value={form.paymentId} onChange={updateField} placeholder="pay_..." />
        </div>

        <div>
          <label className={label} htmlFor="optionId">Option ID</label>
          <input className={input} id="optionId" name="optionId" value={form.optionId} onChange={updateField} placeholder="option_..." />
        </div>

        <div className="md:col-span-2">
          <label className={label} htmlFor="signatures">Signatures (comma/newline separated)</label>
          <textarea className={input} id="signatures" name="signatures" value={form.signatures} onChange={updateField} rows={3} placeholder="0x..." />
        </div>

        <div className="md:col-span-2">
          <label className={label} htmlFor="collectedData">Collected Data (optional JSON object)</label>
          <textarea className={input} id="collectedData" name="collectedData" value={form.collectedData} onChange={updateField} rows={4} placeholder='{"field":"value"}' />
        </div>

        <div className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${button} bg-primary text-primary-foreground hover:opacity-90`} disabled={loadingActions}>
              {loadingActions ? 'Loading Actions...' : 'Get Required Actions'}
            </button>
            <button type="button" className={`${button} bg-muted text-foreground hover:bg-muted/80`} disabled={loadingConfirm} onClick={handleConfirm}>
              {loadingConfirm ? 'Confirming...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </form>

      {flowContext?.paymentLink && (
        <p className="mt-4 text-left text-xs text-muted-foreground">From user flow payment link: {flowContext.paymentLink}</p>
      )}

      {error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive">{error}</p>}
      {actionsResponse && (
        <div>
          <p className="mt-4 text-left text-sm font-medium text-foreground">Required Actions Response</p>
          <JsonViewer value={actionsResponse} />
        </div>
      )}
      {confirmResponse && (
        <div>
          <p className="mt-4 text-left text-sm font-medium text-foreground">Confirm Payment Response</p>
          <JsonViewer value={confirmResponse} />
        </div>
      )}
    </section>
  )
}
