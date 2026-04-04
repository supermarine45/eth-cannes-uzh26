import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getEnsPayees } from '@/lib/ens'

function shortAddress(address) {
  const value = String(address || '').trim()
  if (value.length < 11) {
    return value || 'N/A'
  }

  return `${value.slice(0, 6)}...${value.slice(-5)}`
}


function formatReviewRatingOutOfTen(value, valueDecimals = 0) {
  const numeric = Number(value)
  const decimals = Number(valueDecimals)

  if (!Number.isFinite(numeric)) {
    return '0.0/10'
  }

  const scaled = numeric / (10 ** (Number.isFinite(decimals) ? decimals : 0))
  const outOfTen = scaled > 10 ? scaled / 10 : scaled
  return `${outOfTen.toFixed(1)}/10`
}

function formatTags(...tags) {
  const normalized = tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)

  return normalized.length > 0 ? normalized.join(', ') : 'untagged'
}

export default function PayeesTab({ userWallet }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchPayees = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getEnsPayees({ walletAddress: userWallet, offset: 0, limit: 20 })
      setProfiles(Array.isArray(data?.profiles) ? data.profiles : [])
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load payees and reviews.')
    } finally {
      setLoading(false)
    }
  }, [userWallet])

  useEffect(() => {
    void fetchPayees()
  }, [fetchPayees])


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Named Contacts and Payees</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ENS-linked contacts with on-chain reputation summaries and latest feedback.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={fetchPayees} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!userWallet ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Connect your wallet to load personalized review context for payees.
        </div>
      ) : null}

      

      <section className="space-y-3">
        <h3 className="font-medium text-foreground">Contacts and Reviews</h3>

        {profiles.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">No ENS contacts discovered yet.</p>
          </div>
        ) : null}

        {profiles.map((profile) => (
          <article key={profile.owner} className="rounded-xl border border-border bg-background p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{profile.ensName || 'Unnamed payee'}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{shortAddress(profile.owner)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Summary</p>
                <p className="text-lg font-semibold text-foreground">{formatReviewRatingOutOfTen(profile.summary?.average)}</p>
                <p className="text-xs text-muted-foreground">{profile.summary?.count || 0} reviews</p>
              </div>
            </div>

            {profile.myReview ? (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Your latest review</p>
                <p className="mt-1 text-sm text-foreground">
                  Score: {formatReviewRatingOutOfTen(profile.myReview.value, profile.myReview.valueDecimals)} | Tags: {formatTags(profile.myReview.tag1, profile.myReview.tag2)}
                </p>
              </div>
            ) : null}

            {Array.isArray(profile.latestReviews) && profile.latestReviews.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Latest on-chain reviews</p>
                {profile.latestReviews.map((review) => (
                  <div key={`${profile.owner}-${review.reviewerAddress}-${review.feedbackIndex}`} className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                    <p className="font-mono text-xs text-muted-foreground">Reviewer: {shortAddress(review.reviewerAddress)}</p>
                    <p className="mt-1 text-foreground">
                      Score: {formatReviewRatingOutOfTen(review.value, review.valueDecimals)} | Tags: {formatTags(review.tag1, review.tag2)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No review entries found yet.</p>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}
