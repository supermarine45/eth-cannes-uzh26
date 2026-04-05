# WalletConnect Pay backend

This backend wraps the WalletConnect Pay SDK for a wallet flow:

1. Accept a scanned QR payment link.
2. Fetch payment options for one or more CAIP-10 accounts.
3. Fetch the required signing actions for the chosen option.
4. Confirm the payment with signatures and optional collected data.

## Setup

1. Install dependencies in the backend folder.

2. Configure one of these credentials:

```bash
WALLETCONNECT_API_KEY=
WALLETCONNECT_APP_ID=
PORT=3000
```

If neither is provided, the backend falls back to the existing app id already used in `initialize-wallet.js`.

## Run

```bash
npm start
```

## API

`POST /api/walletconnect/payment-options`

Request body:

```json
{
	"paymentLink": "https://pay.walletconnect.com/pay_123",
	"accounts": [
		"eip155:1:0xYourAddress",
		"eip155:8453:0xYourAddress"
	],
	"includePaymentInfo": true
}
```

You can also send `scannedData` or `uri` instead of `paymentLink`. If `accounts` is omitted, provide `walletAddress` and optional `chainIds` instead.

`POST /api/walletconnect/payment-actions`

Request body:

```json
{
	"paymentId": "pay_123",
	"optionId": "option_abc"
}
```

`POST /api/walletconnect/confirm-payment`

Request body:

```json
{
	"paymentId": "pay_123",
	"optionId": "option_abc",
	"signatures": ["0x..."]
}
```

`GET /health`

Returns `{"ok": true}`.

`POST /api/walletconnect/inspect-link`

Useful for validating a scanned QR string before fetching options. It returns the detected payment id, canonical link, and parsed URL metadata when available.

## Demo

Open the backend in a browser after starting it. The server now serves a small demo UI from the `frontend` folder for inspecting links, fetching options, reading actions, and confirming a payment with pasted signatures.

## ENS Reputation

This repo also includes an ENS-linked reputation registry and backend API.

### Backend env vars

Set these in `backend/.env` before deploying or testing:

```bash
SOLIDITY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/demo
SOLIDITY_PRIVATE_KEY=0x...
SOLIDITY_ENS_REPUTATION_REGISTRY_ADDRESS=0x...
```

### Deploy

From the `backend` folder:

```bash
npm run deploy:ens-registry
```

The script prints the deployed contract address. Copy it into `SOLIDITY_ENS_REPUTATION_REGISTRY_ADDRESS`.

### Smoke test sequence

1. Start the backend from `backend/`:

```bash
npm start
```

2. Check health:

```bash
curl http://localhost:3000/api/ens/health
```

3. Register a profile:

```bash
curl -X POST http://localhost:3000/api/ens/register-profile \
	-H "Content-Type: application/json" \
	-d '{"ownerAddress":"0x1234567890123456789012345678901234567890","ensName":"alice.cannes","profileURI":"ipfs://QmAlice"}'
```

4. Register a second profile for the reviewer:

```bash
curl -X POST http://localhost:3000/api/ens/register-profile \
	-H "Content-Type: application/json" \
	-d '{"ownerAddress":"0x9876543210987654321098765432109876543210","ensName":"bob.cannes","profileURI":"ipfs://QmBob"}'
```

5. Submit a review:

```bash
curl -X POST http://localhost:3000/api/ens/give-feedback \
	-H "Content-Type: application/json" \
	-d '{"reviewerAddress":"0x9876543210987654321098765432109876543210","targetAddress":"0x1234567890123456789012345678901234567890","value":95,"valueDecimals":0,"tag1":"quality","tag2":"reliability","endpoint":"https://example.com/reviews","feedbackURI":"ipfs://QmReview1"}'
```

6. Read the stored review:

```bash
curl http://localhost:3000/api/ens/feedback/0x1234567890123456789012345678901234567890/0x9876543210987654321098765432109876543210/1
```

7. Read the aggregated summary:

```bash
curl -X POST http://localhost:3000/api/ens/summary \
	-H "Content-Type: application/json" \
	-d '{"targetAddress":"0x1234567890123456789012345678901234567890","reviewerAddresses":["0x9876543210987654321098765432109876543210"],"tag1":"quality","tag2":"reliability"}'
```

8. Discover profiles:

```bash
curl "http://localhost:3000/api/ens/discover?offset=0&limit=10"
```

Expected results:
- `register-profile` returns a `txHash` and the ENS node hash.
- `give-feedback` returns a `txHash` for the review transaction.
- `feedback/.../1` returns the stored value and tags.
- `summary` returns `count`, `total`, and `average` for the selected reviewers.
- `discover` returns the registered profiles plus reviewer counts and summary data.

## Run with Docker

Prerequisites:
- Docker Desktop installed and running.

1. Create backend env file:
	- Copy `backend/.env.auth.example` to `backend/.env`.
	- Add WalletConnect values if needed:
	  - `WALLETCONNECT_API_KEY=...` (preferred)
	  - or `WALLETCONNECT_APP_ID=...`

2. Create frontend env file:
	- Copy `frontend/.env.example` to `frontend/.env`.
	- For local Docker dev, keep:
	  - `VITE_WALLETCONNECT_BASE_URL=http://localhost:3000`
	  - `VITE_AUTH_BASE_URL=http://localhost:3000`

3. From repo root, build and start containers:

```bash
docker compose up --build
```

4. Open the apps:
	- Frontend: `http://localhost:5173`
	- Backend health: `http://localhost:3000/health`

5. Stop containers:

```bash
docker compose down
```