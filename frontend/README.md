# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## WalletConnect Pay Flow Interface

This frontend now includes a WalletConnect connection and verification interface, plus two coordinated flow panels aligned to the backend WalletConnect Pay API:

1. User Flow: inspect payment link and fetch payment options.
2. Merchant Flow: fetch required actions and confirm payment with signatures.

The connection panel verifies backend health, link validity, and wallet compatibility before flow actions.
It also supports connecting with MetaMask to auto-fill wallet address and active chain id.
You can also send a testnet transaction from MetaMask to a target MetaMask address in the same panel.

### Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_WALLETCONNECT_BASE_URL` and `VITE_WALLETCONNECT_API_KEY`.
3. If your backend uses different routes, update the optional `VITE_WALLETCONNECT_*_PATH` values.
4. Start the app with `npm run dev`.

Component breakdown:

- `src/components/connection/WalletConnectConnectionPanel.jsx`: wallet connection and verification panel.
- `src/components/payments/UserPaymentPanel.jsx`: inspect link and payment options interface.
- `src/components/payments/MerchantPaymentPanel.jsx`: payment actions and confirmation interface.
- `src/lib/walletconnect.js`: API integration for backend WalletConnect flow routes.
