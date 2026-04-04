# OmniCheckout — Backend

OmniCheckout is a unified checkout protocol that lets users pay from any wallet, any token, across multiple chains. This backend powers the payment flow, live price oracles, and commodity price feeds.

## Architecture Overview

```
Merchant creates invoice → WalletConnect Pay API → payment link (QR)
                                      ↓
User scans link → backend fetches payment options → user confirms
                                      ↓
Flare FTSO (on-chain) → live crypto prices (ETH/BTC/XRP)
Flare FDC Web2Json    → attested commodity prices (Gold/Silver/Platinum/Palladium)
Yahoo Finance         → energy & agricultural prices (not FDC verified)
Uniswap Trading API   → swap quote + transaction (ETH → USDC on Base)
```

## Setup

1. Install dependencies:

```bash
cd backend && npm install
```

2. Create a `.env` file in the `backend` folder:

```bash
PORT=3000

# WalletConnect (wallet-side)
WALLETCONNECT_APP_ID=
WALLETCONNECT_PAY_API_KEY=

# WalletConnect Merchant
WALLETCONNECT_MERCHANT_ID=
WALLETCONNECT_CUSTOMER_API_KEY=
WALLETCONNECT_API_URL=https://api.pay.walletconnect.com

# Uniswap Trading API
UNISWAP_API_KEY=

# Flare FDC verifier (optional — defaults to public testnet key)
FLARE_VERIFIER_API_KEY=
```

## Run

```bash
npm start
```

## API Reference

---

### Merchant Invoice

`POST /api/merchant/invoice`

Merchant creates a WalletConnect Pay payment link to send to user.

```json
{ "amountUSD": 25.00, "referenceId": "order-001" }
```

Response includes `gatewayUrl` — the payment link to show as QR or send to user.

`GET /api/merchant/invoice/:paymentId/status`

Poll payment status after invoice is created. Statuses: `requires_action`, `processing`, `succeeded`, `failed`, `expired`.

---

### WalletConnect Pay (User Side)

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

Validate a scanned QR string before fetching options. Returns the payment id, canonical link, and parsed URL metadata.

---

### Checkout Quote (Flare + Uniswap)

`POST /api/checkout/quote`

Combines a live Flare FTSO price with a Uniswap swap quote in one call.

```json
{ "invoiceUSD": 25.00, "userWallet": "0x...", "token": "ETH" }
```

Returns the token amount needed (from Flare FTSO) and a ready-to-submit swap transaction (from Uniswap Trading API).

---

### Commodity Prices

`GET /api/commodity`

Returns all 12 commodity prices at once. Each entry includes a `fdcVerified` flag.

`GET /api/commodity/:commodity`

Returns the USD price for a single commodity. Supported values:

| Commodity | Key | FDC Verified | Source |
|-----------|-----|:---:|--------|
| Gold | `GOLD` | Yes | Coinbase via Flare FDC Web2Json |
| Silver | `SILVER` | Yes | Coinbase via Flare FDC Web2Json |
| Platinum | `PLATINUM` | Yes | Coinbase via Flare FDC Web2Json |
| Palladium | `PALLADIUM` | Yes | Coinbase via Flare FDC Web2Json |
| Copper | `COPPER` | No | Yahoo Finance |
| WTI Crude Oil | `OIL_WTI` | No | Yahoo Finance |
| Brent Crude Oil | `OIL_BRENT` | No | Yahoo Finance |
| Natural Gas | `NATURAL_GAS` | No | Yahoo Finance |
| Wheat | `WHEAT` | No | Yahoo Finance |
| Corn | `CORN` | No | Yahoo Finance |
| Coffee | `COFFEE` | No | Yahoo Finance |
| Sugar | `SUGAR` | No | Yahoo Finance |

`GET /api/commodity/:commodity/in/:crypto`

Cross-rate: how much crypto equals 1 unit of a commodity. Crypto price comes from Flare FTSO (on-chain oracle).

```
GET /api/commodity/gold/in/ETH
→ "1 Gold (troy oz) = 2.28 ETH"
```

Supported crypto: `ETH`, `BTC`, `XRP`

#### Commodity/Crypto cross-rate formula

```
Commodity price (USD)  ÷  Crypto price (USD)  =  Commodity price in Crypto

Example:
  Gold  = $4,676 USD   (Flare FDC — Coinbase attested)
  ETH   = $2,050 USD   (Flare FTSO — on-chain oracle)
  ─────────────────────────────────────────────
  Gold  = 4676 / 2050  = 2.28 ETH per troy oz
```

Both prices are sourced from Flare infrastructure (FDC + FTSO), making the cross-rate fully decentralized for the 4 FDC-verified metals.

#### How Flare FDC verification works

For the 4 FDC-verified metals, the flow is:

1. Backend requests Flare's FDC verifier to fetch the Coinbase price API
2. Flare's network of validators independently fetches and verifies the data
3. Returns `VALID` status + `abiEncodedRequest` — a cryptographic commitment to the price
4. The `flareAttestation` field in the response contains this proof

Energy and agricultural commodities currently use Yahoo Finance directly. FDC support for these requires an API provider that returns non-array JSON responses — noted as a future improvement.

---

## Demo

Open the backend in a browser after starting it. The server serves a demo UI from the `frontend` folder for inspecting links, fetching payment options, reading actions, and confirming payments.