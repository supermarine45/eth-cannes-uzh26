require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  buildAccounts,
  createWalletConnectPayClient,
  extractPaymentLinkDetails,
  isWalletConnectPaymentCandidate,
  normalizePaymentLinkInput,
} = require("./src/walletconnect-pay");
const { createSolidityPaymentRegistry } = require("./src/solidity-payments");
const { calculateTokenAmount } = require("./src/flare-service");
const { buildSwapToUSDC, ETH_ADDRESS } = require("./src/uniswap-service");

const app = express();
const client = createWalletConnectPayClient();
const paymentRegistry = createSolidityPaymentRegistry();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));

function sendError(res, statusCode, message, details) {
  res.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
  });
}

function resolveAccounts(body) {
  if (Array.isArray(body.accounts) && body.accounts.length > 0) {
    body.accounts.forEach((account) => {
      if (typeof account !== "string" || !/^eip155:\d+:0x[a-fA-F0-9]{40}$/.test(account.trim())) {
        throw new Error("accounts must contain CAIP-10 entries like eip155:1:0x...");
      }
    });

    return body.accounts.map((account) => account.trim());
  }

  if (typeof body.walletAddress === "string") {
    return buildAccounts(body.walletAddress, body.chainIds);
  }

  throw new Error("Provide either accounts or walletAddress");
}

async function handleGetPaymentOptions(req, res) {
  try {
    const body = req.body ?? {};
    const paymentLink = normalizePaymentLinkInput(body.paymentLink || body.scannedData || body.uri);
    const accounts = resolveAccounts(body);
    const includePaymentInfo = body.includePaymentInfo !== false;

    const options = await client.getPaymentOptions({
      paymentLink,
      accounts,
      includePaymentInfo,
    });

    const optionsRequiringData = options.options
      .filter((option) => option.collectData)
      .map((option) => option.id);

    res.json({
      paymentId: options.paymentId,
      options: options.options,
      info: options.info ?? null,
      collectData: options.collectData ?? null,
      optionsRequiringData,
      isPaymentCandidate: isWalletConnectPaymentCandidate(paymentLink),
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// POST /api/checkout/quote
// Body: { invoiceUSD: 23.47, userWallet: "0x...", token: "ETH" }
// Calls Flare for live price, Uniswap to build swap tx, returns both
app.post("/api/checkout/quote", async (req, res) => {
  try {
    const { invoiceUSD, userWallet, token = "ETH" } = req.body ?? {};

    if (!invoiceUSD || typeof invoiceUSD !== "number" || invoiceUSD <= 0) {
      return sendError(res, 400, "invoiceUSD must be a positive number");
    }
    if (!userWallet || !/^0x[a-fA-F0-9]{40}$/.test(userWallet)) {
      return sendError(res, 400, "userWallet must be a valid Ethereum address");
    }

    const { tokenAmount, usdPrice, timestamp } = await calculateTokenAmount(invoiceUSD, token);
    const { quote, transaction } = await buildSwapToUSDC(userWallet, ETH_ADDRESS, invoiceUSD);

    res.json({
      invoiceUSD,
      token: token.toUpperCase(),
      usdPrice,
      tokenAmount,
      priceTimestamp: timestamp,
      uniswap: {
        tokenInAmount: quote.tokenInAmount,
        usdcOut: quote.usdcOut,
        gasFeeUSD: quote.gasFeeUSD,
        routing: quote.routing,
      },
      transaction,
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.post("/api/walletconnect/inspect-link", (req, res) => {
  try {
    const paymentLink = normalizePaymentLinkInput(req.body?.paymentLink || req.body?.scannedData || req.body?.uri);
    const details = extractPaymentLinkDetails(paymentLink);

    res.json({
      isPaymentCandidate: true,
      ...details,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/walletconnect/payment-options", handleGetPaymentOptions);
app.post("/api/walletconnect/scan", handleGetPaymentOptions);

app.post("/api/walletconnect/payment-actions", async (req, res) => {
  try {
    const { paymentId, optionId } = req.body ?? {};

    if (typeof paymentId !== "string" || paymentId.trim() === "") {
      throw new Error("paymentId is required");
    }

    if (typeof optionId !== "string" || optionId.trim() === "") {
      throw new Error("optionId is required");
    }

    const actions = await client.getRequiredPaymentActions({
      paymentId: paymentId.trim(),
      optionId: optionId.trim(),
    });

    res.json({ paymentId: paymentId.trim(), optionId: optionId.trim(), actions });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/walletconnect/confirm-payment", async (req, res) => {
  try {
    const { paymentId, optionId, signatures, collectedData } = req.body ?? {};

    if (typeof paymentId !== "string" || paymentId.trim() === "") {
      throw new Error("paymentId is required");
    }

    if (typeof optionId !== "string" || optionId.trim() === "") {
      throw new Error("optionId is required");
    }

    if (!Array.isArray(signatures) || signatures.length === 0 || signatures.some((signature) => typeof signature !== "string" || signature.trim() === "")) {
      throw new Error("signatures must be a non-empty array of strings");
    }

    const result = await client.confirmPayment({
      paymentId: paymentId.trim(),
      optionId: optionId.trim(),
      signatures: signatures.map((signature) => signature.trim()),
      collectedData,
    });

    res.json({
      paymentId: paymentId.trim(),
      optionId: optionId.trim(),
      ...result,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/solidity/health", async (req, res) => {
  try {
    if (!paymentRegistry) {
      sendError(
        res,
        503,
        "Solidity registry not configured. Set SOLIDITY_RPC_URL, SOLIDITY_PRIVATE_KEY, and SOLIDITY_PAYMENT_REGISTRY_ADDRESS.",
      );
      return;
    }

    const health = await paymentRegistry.health();
    res.json(health);
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.post("/api/solidity/record-payment", async (req, res) => {
  try {
    if (!paymentRegistry) {
      sendError(
        res,
        503,
        "Solidity registry not configured. Set SOLIDITY_RPC_URL, SOLIDITY_PRIVATE_KEY, and SOLIDITY_PAYMENT_REGISTRY_ADDRESS.",
      );
      return;
    }

    const result = await paymentRegistry.recordPayment(req.body ?? {});
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/solidity/payment/:paymentId", async (req, res) => {
  try {
    if (!paymentRegistry) {
      sendError(
        res,
        503,
        "Solidity registry not configured. Set SOLIDITY_RPC_URL, SOLIDITY_PRIVATE_KEY, and SOLIDITY_PAYMENT_REGISTRY_ADDRESS.",
      );
      return;
    }

    const payment = await paymentRegistry.getPayment(req.params.paymentId);
    if (!payment) {
      sendError(res, 404, `Payment not found: ${req.params.paymentId}`);
      return;
    }

    res.json(payment);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.use((req, res) => {
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
    return;
  }

  sendError(res, 404, `Route not found: ${req.method} ${req.path}`);
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`WalletConnect Pay backend listening on port ${port}`);
  });
}

module.exports = {
  app,
  client,
  paymentRegistry,
};