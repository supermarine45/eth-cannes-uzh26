const { WalletConnectPay } = require("@walletconnect/pay");

const DEFAULT_APP_ID = "750c4179b715c94a59bde14d6aa19d61";
const DEFAULT_SUPPORTED_CHAIN_IDS = [1, 8453];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWalletAddress(walletAddress) {
  if (!isNonEmptyString(walletAddress)) {
    throw new Error("walletAddress is required");
  }

  const normalizedAddress = walletAddress.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    throw new Error("walletAddress must be a valid 0x-prefixed Ethereum address");
  }

  return normalizedAddress;
}

function buildAccounts(walletAddress, chainIds = DEFAULT_SUPPORTED_CHAIN_IDS) {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const normalizedChainIds = Array.from(
    new Set(
      chainIds.map((chainId) => {
        const parsedChainId = Number(chainId);
        if (!Number.isInteger(parsedChainId) || parsedChainId <= 0) {
          throw new Error("chainIds must contain positive integers");
        }
        return parsedChainId;
      }),
    ),
  );

  return normalizedChainIds.map((chainId) => `eip155:${chainId}:${normalizedAddress}`);
}

function isWalletConnectPaymentCandidate(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const trimmedValue = value.trim();

  if (/^pay_[a-zA-Z0-9_-]+$/.test(trimmedValue)) {
    return true;
  }

  try {
    const url = new URL(trimmedValue);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "pay.walletconnect.com" || hostname.endsWith(".pay.walletconnect.com")) {
      return true;
    }

    if (url.searchParams.has("pid")) {
      return true;
    }

    return url.pathname.includes("pay_");
  } catch {
    return false;
  }
}

function extractPaymentLinkDetails(value) {
  const normalizedValue = normalizePaymentLinkInput(value);

  if (/^pay_[a-zA-Z0-9_-]+$/.test(normalizedValue)) {
    return {
      originalInput: normalizedValue,
      paymentId: normalizedValue,
      source: "payment-id",
      canonicalPaymentLink: `https://pay.walletconnect.com/${normalizedValue}`,
    };
  }

  const url = new URL(normalizedValue);
  const paymentIdFromQuery = url.searchParams.get("pid");
  const paymentIdFromPath = url.pathname.match(/(pay_[a-zA-Z0-9_-]+)/)?.[1] ?? null;
  const paymentId = paymentIdFromQuery || paymentIdFromPath;

  return {
    originalInput: normalizedValue,
    paymentId,
    source: paymentIdFromQuery ? "query-pid" : paymentIdFromPath ? "path" : "url",
    canonicalPaymentLink: paymentId ? `https://pay.walletconnect.com/${paymentId}` : normalizedValue,
    hostname: url.hostname,
    pathname: url.pathname,
    searchParams: Object.fromEntries(url.searchParams.entries()),
  };
}

function normalizePaymentLinkInput(paymentLink) {
  if (!isNonEmptyString(paymentLink)) {
    throw new Error("paymentLink is required");
  }

  const trimmedValue = paymentLink.trim();
  if (!isWalletConnectPaymentCandidate(trimmedValue)) {
    throw new Error("paymentLink must be a WalletConnect Pay link or payment id");
  }

  return trimmedValue;
}

function createWalletConnectPayClient() {
  const apiKey = process.env.WALLETCONNECT_API_KEY;
  const appId = process.env.WALLETCONNECT_APP_ID || DEFAULT_APP_ID;

  return new WalletConnectPay({
    apiKey: isNonEmptyString(apiKey) ? apiKey.trim() : undefined,
    appId: isNonEmptyString(apiKey) ? undefined : appId,
  });
}

module.exports = {
  DEFAULT_SUPPORTED_CHAIN_IDS,
  buildAccounts,
  createWalletConnectPayClient,
  extractPaymentLinkDetails,
  isWalletConnectPaymentCandidate,
  normalizePaymentLinkInput,
  normalizeWalletAddress,
};