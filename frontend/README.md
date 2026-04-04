# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Multi-Wallet Connection Interface

This frontend now focuses on wallet connectivity and testnet transfers.

1. Connect using injected wallet providers (MetaMask, Coinbase Wallet, Rabby, Brave Wallet, Trust Wallet).
2. Send a testnet transaction to a target EVM wallet address.

The panel supports provider refresh, wallet connection, backend health checks, and testnet transfer flow.

### Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_WALLETCONNECT_BASE_URL` and `VITE_WALLETCONNECT_API_KEY`.
3. If your backend uses different routes, update the optional `VITE_WALLETCONNECT_*_PATH` values.
4. Start the app with `npm run dev`.

Component breakdown:

- `src/components/connection/WalletConnectConnectionPanel.jsx`: multi-provider wallet connection and transaction panel.
- `src/lib/walletconnect.js`: backend health integration.
