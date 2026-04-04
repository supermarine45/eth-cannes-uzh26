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