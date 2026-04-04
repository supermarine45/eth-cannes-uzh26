import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	getGoogleLoginUrl,
	loginWithEmail,
	requestWalletChallenge,
	verifyWalletSignature,
} from '@/lib/auth'
import { useAuth } from '@/context/useAuth'

const label = 'mb-1 block text-sm font-medium text-foreground'
const input = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring focus:ring-2 focus:ring-ring/40'

function getBestInjectedProvider() {
	if (!window.ethereum) {
		return null
	}

	const providers = Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0
		? window.ethereum.providers
		: [window.ethereum]

	return providers.find((provider) => provider?.isMetaMask) ?? null
}

export default function LoginAuthPanel({ onBack }) {
	const { applySession, normalizeAuthSessionPayload } = useAuth()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loadingAction, setLoadingAction] = useState('')
	const [error, setError] = useState('')

	const runAction = async (actionName, fn) => {
		setLoadingAction(actionName)
		setError('')

		try {
			await fn()
		} catch (actionError) {
			setError(actionError.message)
		} finally {
			setLoadingAction('')
		}
	}

	const handleEmailLogin = async () => {
		await runAction('login', async () => {
			const data = await loginWithEmail({
				email: email.trim(),
				password,
			})

			const nextSession = normalizeAuthSessionPayload(data.session, 'email')
			applySession(nextSession)
		})
	}

	const handleGoogleLogin = async () => {
		await runAction('google', async () => {
			const redirectTo = `${window.location.origin}/auth/callback`
			const data = await getGoogleLoginUrl({ redirectTo })
			if (!data?.url) {
				throw new Error('Google login URL was not returned by backend.')
			}

			window.location.href = data.url
		})
	}

	const handleMetamaskLogin = async () => {
		await runAction('metamask', async () => {
			const provider = getBestInjectedProvider()
			if (!provider) {
				throw new Error('MetaMask is required. Please install or unlock MetaMask to continue.')
			}

			const accounts = await provider.request({ method: 'eth_requestAccounts' })
			const walletAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : ''
			const chainIdHex = await provider.request({ method: 'eth_chainId' })
			const connectedChainId = Number.parseInt(chainIdHex, 16)

			if (!walletAddress) {
				throw new Error('Wallet address not available. Connect MetaMask first.')
			}

			const challenge = await requestWalletChallenge({
				address: walletAddress,
				chainId: connectedChainId,
			})

			let signature = ''
			try {
				signature = await provider.request({
					method: 'personal_sign',
					params: [challenge.message, walletAddress],
				})
			} catch {
				signature = await provider.request({
					method: 'personal_sign',
					params: [walletAddress, challenge.message],
				})
			}

			const verified = await verifyWalletSignature({
				address: walletAddress,
				nonce: challenge.nonce,
				signature,
			})

			applySession({
				provider: 'metamask',
				tokenType: verified.tokenType,
				accessToken: verified.accessToken,
				expiresIn: verified.expiresIn,
				user: verified.user,
				createdAt: new Date().toISOString(),
			})
		})
	}

	return (
		<section className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur md:p-7">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Welcome Back</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Log In</h2>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">Log in with email or continue with a provider.</p>
				</div>
			</div>

			<form className="grid gap-4 text-left md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
				<div>
					<label className={label} htmlFor="loginEmail">Email</label>
					<input
						id="loginEmail"
						className={input}
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="user@gmail.com"
					/>
				</div>

				<div>
					<label className={label} htmlFor="loginPassword">Password</label>
					<input
						id="loginPassword"
						type="password"
						className={input}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="your password"
					/>
				</div>

				<div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
					<Button
						type="button"
						onClick={handleEmailLogin}
						variant="default"
						disabled={loadingAction !== ''}
					>
						{loadingAction === 'login' ? 'Logging in...' : 'Log in with Email'}
					</Button>

					<Button
						type="button"
						onClick={handleGoogleLogin}
						variant="outline"
						disabled={loadingAction !== ''}
					>
						{loadingAction === 'google' ? 'Redirecting...' : 'Log in with Google'}
					</Button>

					<Button
						type="button"
						onClick={handleMetamaskLogin}
						variant="outline"
						disabled={loadingAction !== ''}
					>
						{loadingAction === 'metamask' ? 'Signing...' : 'Log in with MetaMask'}
					</Button>

					<Button
						type="button"
						onClick={onBack}
						variant="secondary"
						disabled={loadingAction !== ''}
					>
						Back
					</Button>
				</div>
			</form>

			{error ? <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
		</section>
	)
}
