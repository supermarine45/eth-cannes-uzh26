# Supabase Auth Backend Setup

This backend now supports:
- Email/password signup/login (including Gmail addresses)
- Google OAuth URL generation
- MetaMask wallet challenge-signature login

## 1) Apply DB schema in Supabase SQL Editor

Run the SQL in `supabase-auth-schema.sql`.

That schema now includes:
- `auth_user_profiles` for first-login profile details (`full_name`, `date_of_birth`, `account_type`, and business details)
- `auth_user_wallet_addresses` for linked wallet addresses
- `auth_wallet_challenges` for MetaMask login challenges

## 2) Configure environment variables

Copy values from `.env.auth.example` into your backend `.env`.

Required keys:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WALLET_AUTH_TOKEN_SECRET`

## 3) Enable providers in Supabase Auth

In Supabase dashboard:
- Auth > Providers > Email: enable Email provider
- Auth > Providers > Google: enable Google provider and set callback URLs

## 4) Endpoints

Base path: `/api/auth`

- `POST /signup/email`
  - Body: `{ "email": "user@gmail.com", "password": "...", "metadata": { "name": "User" } }`
- `POST /login/email`
  - Body: `{ "email": "user@gmail.com", "password": "..." }`
- `POST /google/url`
  - Body: `{ "redirectTo": "http://localhost:5173/auth/callback" }`
  - Returns OAuth URL to redirect browser to Google login
- `GET /me`
  - Header: `Authorization: Bearer <supabase_access_token>`
  - Returns the current user, profile, linked wallet addresses, and whether onboarding is still required
- `POST /onboarding`
  - Header: `Authorization: Bearer <supabase_access_token or backend wallet JWT>`
  - Body: `fullName`, `dateOfBirth` (`YYYY-MM-DD`), `accountType` (`individual` or `business`), plus `walletAddresses`
  - For `business` accounts, also provide `companyName` and `businessAddress`
  - Rejects users under 18
  - Stores the profile and linked wallets in Supabase
- `POST /wallet/challenge`
  - Body: `{ "address": "0x...", "chainId": 1 }`
  - Returns message + nonce for MetaMask signing
- `POST /wallet/verify`
  - Body: `{ "address": "0x...", "nonce": "...", "signature": "0x..." }`
  - Returns backend JWT access token for wallet-authenticated sessions

## 5) Minimal MetaMask flow

1. Call `POST /api/auth/wallet/challenge`
2. In frontend: `ethereum.request({ method: "personal_sign", params: [message, address] })`
3. Send signature to `POST /api/auth/wallet/verify`
4. Use returned `accessToken` as your app session token

## Notes

- Wallet login token is issued by backend JWT (`WALLET_AUTH_TOKEN_SECRET`), separate from Supabase user access tokens.
- For strict SIWE compliance, you can later switch to a SIWE parser/validator package.
