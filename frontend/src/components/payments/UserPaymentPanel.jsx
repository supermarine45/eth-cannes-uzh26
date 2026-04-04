import { useState } from 'react'
import { getPaymentOptions, inspectPaymentLink } from '@/lib/walletconnect'
import JsonViewer from '@/components/shared/JsonViewer'

const shell = 'rounded-xl border border-border bg-card p-5 shadow-sm'
const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/40'
const button = 'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'

function parseDelimitedEntries(value) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export default function UserPaymentPanel({ onFlowUpdate }) {
  const [loading, setLoading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [error, setError] = useState('')
  const [inspectResponse, setInspectResponse] = useState(null)
  const [optionsResponse, setOptionsResponse] = useState(null)
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [form, setForm] = useState({
    paymentLink: '',
    scannedData: '',
    accounts: '',
    walletAddress: '',
    chainIds: '1,8453',
    includePaymentInfo: true,
  })

  const updateField = (event) => {
    const { name, type, value, checked } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleInspect = async () => {
    setInspecting(true)
    setError('')

    try {
      const apiResponse = await inspectPaymentLink({
        paymentLink: form.paymentLink.trim() || form.scannedData.trim(),
        scannedData: form.scannedData.trim() || undefined,
      })
      setInspectResponse(apiResponse)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setInspecting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setOptionsResponse(null)
    setSelectedOptionId('')

    try {
      const accounts = parseDelimitedEntries(form.accounts)
      const chainIds = parseDelimitedEntries(form.chainIds).map((chainId) => Number(chainId))

      const payload = {
        paymentLink: form.paymentLink.trim() || form.scannedData.trim(),
        scannedData: form.scannedData.trim() || undefined,
        includePaymentInfo: Boolean(form.includePaymentInfo),
      }

      if (accounts.length > 0) {
        payload.accounts = accounts
      } else {
        payload.walletAddress = form.walletAddress.trim()
        payload.chainIds = chainIds.filter((chainId) => Number.isInteger(chainId) && chainId > 0)
      }

      const apiResponse = await getPaymentOptions(payload)
      const firstOptionId = apiResponse?.options?.[0]?.id ?? ''

      setOptionsResponse(apiResponse)
      setSelectedOptionId(firstOptionId)

      onFlowUpdate?.({
        paymentId: apiResponse?.paymentId ?? '',
        optionId: firstOptionId,
        paymentLink: payload.paymentLink,
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={shell}>
      <h2 className="mb-4 text-left text-lg font-semibold text-foreground">User Flow: Inspect Link and Fetch Payment Options</h2>
      <form className="grid gap-4 text-left md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <label className={label} htmlFor="paymentLink">Payment Link or Payment ID</label>
          <input
            className={input}
            id="paymentLink"
            name="paymentLink"
            value={form.paymentLink}
            onChange={updateField}
            placeholder="https://pay.walletconnect.com/pay_..."
          />
        </div>

        <div className="md:col-span-2">
          <label className={label} htmlFor="scannedData">Scanned Data (optional)</label>
          <input
            className={input}
            id="scannedData"
            name="scannedData"
            value={form.scannedData}
            onChange={updateField}
            placeholder="Raw QR payload"
          />
        </div>

        <div className="md:col-span-2">
          <label className={label} htmlFor="accounts">Accounts (CAIP-10, comma or newline separated)</label>
          <textarea
            className={input}
            id="accounts"
            name="accounts"
            value={form.accounts}
            onChange={updateField}
            placeholder="eip155:1:0x..."
            rows={3}
          />
        </div>

        <div>
          <label className={label} htmlFor="walletAddress">Wallet Address (if accounts empty)</label>
          <input
            className={input}
            id="walletAddress"
            name="walletAddress"
            value={form.walletAddress}
            onChange={updateField}
            placeholder="0x..."
          />
        </div>

        <div>
          <label className={label} htmlFor="chainIds">Chain IDs (comma separated)</label>
          <input
            className={input}
            id="chainIds"
            name="chainIds"
            value={form.chainIds}
            onChange={updateField}
            placeholder="1,8453"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="includePaymentInfo"
            type="checkbox"
            name="includePaymentInfo"
            checked={form.includePaymentInfo}
            onChange={updateField}
          />
          <label className="text-sm text-foreground" htmlFor="includePaymentInfo">Include payment info in response</label>
        </div>

        <div className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={inspecting} onClick={handleInspect}>
              {inspecting ? 'Inspecting...' : 'Inspect Link'}
            </button>
            <button type="submit" className={button} disabled={loading}>
              {loading ? 'Loading Options...' : 'Fetch Payment Options'}
            </button>
          </div>
        </div>
      </form>

      {optionsResponse?.options?.length > 0 && (
        <div className="mt-4 rounded-md border border-border p-3 text-left">
          <p className="mb-2 text-sm font-medium text-foreground">Select an option for merchant actions:</p>
          <div className="flex flex-wrap gap-2">
            {optionsResponse.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedOptionId(option.id)
                  onFlowUpdate?.({
                    paymentId: optionsResponse.paymentId,
                    optionId: option.id,
                    paymentLink: form.paymentLink.trim() || form.scannedData.trim(),
                  })
                }}
                className={`${button} ${selectedOptionId === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}
              >
                {option.id}
              </button>
            ))}
          </div>
          {optionsResponse.paymentId && <p className="mt-3 text-xs text-muted-foreground">Payment ID: {optionsResponse.paymentId}</p>}
        </div>
      )}

      {error && <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive">{error}</p>}
      {inspectResponse && (
        <div>
          <p className="mt-4 text-left text-sm font-medium text-foreground">Inspect Response</p>
          <JsonViewer value={inspectResponse} />
        </div>
      )}
      {optionsResponse && (
        <div>
          <p className="mt-4 text-left text-sm font-medium text-foreground">Payment Options Response</p>
          <JsonViewer value={optionsResponse} />
        </div>
      )}
    </section>
  )
}
