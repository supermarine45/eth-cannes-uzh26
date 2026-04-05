require("dotenv").config();
const express = require("express");
const path = require("path");
const { ethers } = require("ethers");
const { router: authRouter } = require("./src/auth-routes");
const {
  buildAccounts,
  createWalletConnectPayClient,
  extractPaymentLinkDetails,
  isWalletConnectPaymentCandidate,
  normalizePaymentLinkInput,
} = require("./src/walletconnect-pay");
const { createSolidityPaymentRegistry } = require("./src/solidity-payments");
const { createInvoiceRegistry } = require("./src/invoice-registry");
const { createSubscriptionRegistry, FREQUENCY_OPTIONS } = require("./src/subscription-registry");
const { startSubscriptionExecutionLoop } = require("./src/subscription-executor");
const { createEnsCommerceRegistry } = require("./ens-commerce");
const { calculateTokenAmount } = require("./src/flare-service");
const { buildSwapToUSDC, getLiveEthUsdcRates, ETH_ADDRESS } = require("./src/uniswap-service");
const { getCommodityUSDPrice, getCommodityInCrypto, getAllCommodityPrices } = require("./src/commodity-service");
const { normalizeCannesEnsName } = require("./src/ens-name");

const app = express();
const client = createWalletConnectPayClient();
const paymentRegistry = createSolidityPaymentRegistry();
const invoiceRegistry = createInvoiceRegistry();
const subscriptionRegistry = createSubscriptionRegistry();
let stopSubscriptionExecutor = null;
const ensRegistry = createEnsCommerceRegistry();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use("/api/auth", authRouter);
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

// POST /api/merchant/invoice
// Body: { amountUSD, merchantWallet, recipientWallet, description, dueDate, referenceId }
app.post("/api/merchant/invoice", async (req, res) => {
  try {
    const merchantId = process.env.WALLETCONNECT_MERCHANT_ID;
    const customerApiKey = process.env.WALLETCONNECT_CUSTOMER_API_KEY;
    const apiUrl = process.env.WALLETCONNECT_API_URL;

    if (!merchantId || !customerApiKey) {
      return sendError(res, 503, "Merchant credentials not configured. Set WALLETCONNECT_MERCHANT_ID and WALLETCONNECT_CUSTOMER_API_KEY.");
    }

    const { amountUSD, merchantWallet, recipientWallet, description, dueDate, referenceId } = req.body ?? {};
    if (!amountUSD || typeof amountUSD !== "number" || amountUSD <= 0) {
      return sendError(res, 400, "amountUSD must be a positive number");
    }

    const ref = referenceId || `omni-${Date.now()}`;
    const amountCents = Math.round(amountUSD * 100).toString();

    // Step 1: Create WalletConnect payment link
    const response = await fetch(`${apiUrl}/v1/merchant/payment`, {
      method: "POST",
      headers: {
        "Api-Key": customerApiKey,
        "Merchant-Id": merchantId,
        "Content-Type": "application/json",
        "Sdk-Name": "OmniCheckout",
        "Sdk-Version": "1.0.0",
        "Sdk-Platform": "web",
      },
      body: JSON.stringify({ referenceId: ref, amount: { value: amountCents, unit: "iso4217/USD" } }),
    });

    const data = await response.json();
    if (!response.ok) return sendError(res, response.status, "WalletConnect merchant API error", data);

    // Step 2: Write invoice to Coston2 on-chain registry (if wallets provided and registry configured)
    let onChain = null;
    let onChainWarning = null;

    if (!invoiceRegistry) {
      onChainWarning = "On-chain registry not configured (INVOICE_REGISTRY_ADDRESS missing). Recipient won't see this in Bills.";
    } else if (!merchantWallet || !recipientWallet) {
      onChainWarning = `Invoice created but NOT stored on-chain: ${!merchantWallet ? "merchantWallet" : "recipientWallet"} is missing. Recipient won't see it in their Bills tab.`;
    } else {
      try {
        onChain = await invoiceRegistry.createInvoice({
          merchant: merchantWallet,
          recipient: recipientWallet,
          paymentId: data.paymentId,
          gatewayUrl: data.gatewayUrl,
          description: description || "",
          amountUSD,
          dueDate: dueDate || null,
        });
      } catch (chainErr) {
        console.error("On-chain invoice write failed:", chainErr.message);
        onChain = { error: chainErr.message };
        onChainWarning = `Invoice created but on-chain storage failed: ${chainErr.message}. Recipient won't see it in Bills until resolved.`;
      }
    }

    res.json({
      paymentId: data.paymentId,
      gatewayUrl: data.gatewayUrl,
      expiresAt: data.expiresAt,
      amountUSD,
      referenceId: ref,
      onChain,
      onChainWarning,
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// GET /api/merchant/invoices?wallet=0x...
app.get("/api/merchant/invoices", async (req, res) => {
  try {
    if (!invoiceRegistry) return sendError(res, 503, "Invoice registry not configured. Set INVOICE_REGISTRY_ADDRESS.");
    const { wallet } = req.query;
    if (!wallet) return sendError(res, 400, "wallet query param required");
    const invoices = await invoiceRegistry.getByMerchant(wallet);
    res.json(invoices);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/bills?wallet=0x...
// Returns both one-time invoices (from Coston2) and subscriptions (from Supabase) for a recipient/subscriber.
app.get("/api/bills", async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return sendError(res, 400, "wallet query param required");

    const [invoices, subscriptions] = await Promise.allSettled([
      invoiceRegistry ? invoiceRegistry.getByRecipient(wallet) : Promise.resolve([]),
      subscriptionRegistry ? subscriptionRegistry.getBySubscriber(wallet) : Promise.resolve([]),
    ]);

    const invoiceList = invoices.status === "fulfilled" ? invoices.value : [];
    const subscriptionList = subscriptions.status === "fulfilled"
      ? subscriptions.value.map(s => ({ ...s, isSubscription: true }))
      : [];

    res.json([...invoiceList, ...subscriptionList]);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// PATCH /api/merchant/invoice/:paymentId/status
// Body: { status: "Paid" | "Expired" | "Cancelled" }
app.patch("/api/merchant/invoice/:paymentId/status", async (req, res) => {
  try {
    if (!invoiceRegistry) return sendError(res, 503, "Invoice registry not configured. Set INVOICE_REGISTRY_ADDRESS.");
    const { status } = req.body ?? {};
    if (!status) return sendError(res, 400, "status required");
    const result = await invoiceRegistry.updateStatus(req.params.paymentId, status);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/merchant/invoice/:paymentId/status
app.get("/api/merchant/invoice/:paymentId/status", async (req, res) => {
  try {
    const merchantId = process.env.WALLETCONNECT_MERCHANT_ID;
    const customerApiKey = process.env.WALLETCONNECT_CUSTOMER_API_KEY;
    const apiUrl = process.env.WALLETCONNECT_API_URL;

    if (!merchantId || !customerApiKey) return sendError(res, 503, "Merchant credentials not configured.");

    const response = await fetch(`${apiUrl}/v1/merchant/payment/${req.params.paymentId}/status`, {
      headers: { "Api-Key": customerApiKey, "Merchant-Id": merchantId },
    });
    const data = await response.json();
    if (!response.ok) return sendError(res, response.status, "WalletConnect merchant API error", data);
    res.json(data);
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// GET /api/commodity — all commodity prices
app.get("/api/commodity", async (req, res) => {
  try {
    const data = await getAllCommodityPrices();
    res.json(data);
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// GET /api/commodity/:commodity — single commodity in USD
app.get("/api/commodity/:commodity", async (req, res) => {
  try {
    const data = await getCommodityUSDPrice(req.params.commodity);
    res.json(data);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/commodity/:commodity/in/:crypto — cross-rate using Flare FTSO
app.get("/api/commodity/:commodity/in/:crypto", async (req, res) => {
  try {
    const data = await getCommodityInCrypto(req.params.commodity, req.params.crypto);
    res.json(data);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// Supported swap-in tokens on Base (USDC is handled as direct transfer, not a swap)
const BASE_SWAP_TOKENS = {
  ETH:  { address: ETH_ADDRESS, decimals: 18 },
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  DAI:  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
};

// POST /api/checkout/best-route
// Body: { invoiceUSD, userWallet, tokens: [{ symbol, balance }] }
// Scans quotes for all available tokens in parallel, ranks by effective USD cost.
// effectiveCostUSD = (tokenInAmount × tokenPrice) + gasFeeUSD
// The recommended token is the cheapest one with sufficient balance.
app.post("/api/checkout/best-route", async (req, res) => {
  try {
    const { invoiceUSD, userWallet, tokens } = req.body ?? {};

    if (!invoiceUSD || typeof invoiceUSD !== "number" || invoiceUSD <= 0) {
      return sendError(res, 400, "invoiceUSD must be a positive number");
    }
    if (!userWallet || !/^0x[a-fA-F0-9]{40}$/.test(userWallet)) {
      return sendError(res, 400, "userWallet must be a valid Ethereum address");
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return sendError(res, 400, "tokens must be a non-empty array of { symbol, balance }");
    }

    // Fetch quotes for all tokens in parallel (USDC is direct, no Uniswap call needed)
    const quoteJobs = tokens.map(async ({ symbol, balance }) => {
      const tokenKey = (symbol || "").toUpperCase();
      const balanceFloat = parseFloat(balance || "0");

      if (tokenKey === "USDC") {
        // Direct USDC transfer — cost is exactly invoiceUSD + ~$0.02 gas on Base
        const effectiveCostUSD = invoiceUSD + 0.02;
        const sufficient = balanceFloat >= invoiceUSD;
        return {
          token: "USDC",
          tokenInAmount: invoiceUSD.toFixed(6),
          userBalance: balance,
          usdPrice: 1,
          gasFeeUSD: "0.02",
          effectiveCostUSD,
          premium: 0.02,
          sufficient,
          isDirect: true,
          transaction: null,
        };
      }

      const tokenMeta = BASE_SWAP_TOKENS[tokenKey];
      if (!tokenMeta) return { token: tokenKey, error: `Unsupported token: ${tokenKey}` };

      try {
        const { usdPrice } = await calculateTokenAmount(invoiceUSD, tokenKey);
        const { quote, transaction } = await buildSwapToUSDC(userWallet, tokenMeta.address, invoiceUSD, tokenMeta.decimals);

        const tokenInFloat = parseFloat(quote.tokenInAmount || "0");
        const gasFeeUSD = parseFloat(quote.gasFeeUSD || "0");
        const effectiveCostUSD = tokenInFloat * usdPrice + gasFeeUSD;
        const sufficient = balanceFloat >= tokenInFloat;

        return {
          token: tokenKey,
          tokenAddress: tokenMeta.address,
          tokenInAmount: quote.tokenInAmount,
          userBalance: balance,
          usdPrice,
          gasFeeUSD: quote.gasFeeUSD,
          effectiveCostUSD,
          premium: effectiveCostUSD - invoiceUSD,
          sufficient,
          isDirect: false,
          routing: quote.routing,
          transaction,
        };
      } catch (err) {
        return { token: tokenKey, error: err.message };
      }
    });

    const settled = await Promise.allSettled(quoteJobs);

    const ranked = settled
      .filter(r => r.status === "fulfilled" && r.value && !r.value.error)
      .map(r => r.value)
      .sort((a, b) => {
        // Sufficient tokens first, then sort by cheapest effective cost
        if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
        return a.effectiveCostUSD - b.effectiveCostUSD;
      });

    const failed = settled
      .filter(r => r.status === "rejected" || r.value?.error)
      .map(r => ({ token: r.value?.token, error: r.value?.error || r.reason?.message }));

    // Mark the single best (cheapest sufficient) option
    const bestIdx = ranked.findIndex(r => r.sufficient);
    if (bestIdx !== -1) ranked[bestIdx].recommended = true;

    res.json({ ranked, failed, invoiceUSD });
  } catch (error) {
    sendError(res, 500, error.message);
  }
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

    const tokenKey = token.toUpperCase();
    if (tokenKey === "USDC") {
      return sendError(res, 400, "USDC payments use direct transfer — no swap needed");
    }
    const tokenMeta = BASE_SWAP_TOKENS[tokenKey];
    if (!tokenMeta) {
      return sendError(res, 400, `Unsupported token: ${token}. Supported: ${Object.keys(BASE_SWAP_TOKENS).join(", ")}`);
    }

    const { tokenAmount, usdPrice, timestamp } = await calculateTokenAmount(invoiceUSD, token);
    const { quote, transaction } = await buildSwapToUSDC(userWallet, tokenMeta.address, invoiceUSD, tokenMeta.decimals);

    res.json({
      invoiceUSD,
      token: tokenKey,
      tokenAddress: tokenMeta.address,
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

// GET /api/uniswap/live-rates
app.get("/api/uniswap/live-rates", async (req, res) => {
  try {
    const data = await getLiveEthUsdcRates();
    res.json(data);
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

app.get("/api/ens/health", async (req, res) => {
  try {
    const health = await ensRegistry.health();
    res.json(health);
  } catch (error) {
    sendError(res, 503, error.message);
  }
});

app.post("/api/ens/register-profile", async (req, res) => {
  try {
    const { ensName, ensNode, profileURI } = req.body ?? {};
    if (!ensName) {
      return sendError(res, 400, "ensName required");
    }
    const normalizedEnsName = normalizeCannesEnsName(ensName);
    const result = await ensRegistry.registerProfile(normalizedEnsName, ensNode, profileURI);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/ens/update-profile", async (req, res) => {
  try {
    const { ownerAddress, ensName, ensNode, profileURI, active } = req.body ?? {};
    if (!ownerAddress || !ensName) {
      return sendError(res, 400, "ownerAddress and ensName required");
    }
    const normalizedEnsName = normalizeCannesEnsName(ensName);
    const result = await ensRegistry.updateProfile(ownerAddress, normalizedEnsName, ensNode, profileURI, active);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/profile/:ownerAddress", async (req, res) => {
  try {
    const result = await ensRegistry.getProfile(req.params.ownerAddress);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/resolve/:ensNode", async (req, res) => {
  try {
    const result = await ensRegistry.resolveEnsNode(req.params.ensNode);
    res.json({ ensNode: req.params.ensNode, owner: result });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/search", async (req, res) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const wallet = typeof req.query.wallet === "string" && req.query.wallet.trim() ? req.query.wallet.trim() : null;
    console.log('[backend] /api/ens/search start', { query, wallet })

    if (!query) {
      console.log('[backend] /api/ens/search missing query')
      return sendError(res, 400, "query is required");
    }

    let ownerAddress = null;
    if (ethers.isAddress(query)) {
      ownerAddress = ethers.getAddress(query);
    } else if (query.includes(".")) {
      const ensNode = ethers.namehash(query);
      ownerAddress = await ensRegistry.resolveEnsNode(ensNode);
    } else {
      console.log('[backend] /api/ens/search invalid query format', { query })
      return sendError(res, 400, "query must be a valid Ethereum address or ENS name");
    }

    console.log('[backend] /api/ens/search resolved ownerAddress', { ownerAddress })

    if (!ownerAddress) {
      console.log('[backend] /api/ens/search ownerAddress not found', { query })
      return sendError(res, 404, "Unable to resolve ENS query to an address");
    }

    let profile;
    try {
      profile = await ensRegistry.getProfile(ownerAddress);
      console.log('[backend] /api/ens/search getProfile result', { profile })
    } catch (profileError) {
      console.error('[backend] /api/ens/search getProfile error', profileError)
      profile = null;
    }

    if (!profile) {
      console.log('[backend] /api/ens/search no ENS registry profile', { ownerAddress })
      return res.json({ owner: ownerAddress, profile: null });
    }

    const reviewers = await ensRegistry.getKnownReviewers(profile.owner);
    const recentReviewerAddresses = reviewers.slice(0, 3);

    const latestReviews = await Promise.all(
      recentReviewerAddresses.map(async (reviewerAddress) => {
        try {
          const feedbackIndex = await ensRegistry.getLastFeedbackIndex(profile.owner, reviewerAddress);
          if (!feedbackIndex || feedbackIndex < 1) {
            return null;
          }

          const feedback = await ensRegistry.readFeedback(profile.owner, reviewerAddress, feedbackIndex);
          return {
            reviewerAddress,
            feedbackIndex,
            ...feedback,
          };
        } catch {
          return null;
        }
      }),
    );

    let myReview = null;
    let mySummary = null;

    if (wallet) {
      try {
        const feedbackIndex = await ensRegistry.getLastFeedbackIndex(profile.owner, wallet);
        if (feedbackIndex && feedbackIndex >= 1) {
          const feedback = await ensRegistry.readFeedback(profile.owner, wallet, feedbackIndex);
          myReview = {
            reviewerAddress: wallet,
            feedbackIndex,
            ...feedback,
          };
        }

        mySummary = await ensRegistry.getSummary(profile.owner, [wallet]);
      } catch {
        myReview = null;
        mySummary = null;
      }
    }

    res.json({
      owner: ownerAddress,
      profile: {
        ...profile,
        latestReviews: latestReviews.filter(Boolean),
        myReview,
        mySummary,
      },
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/ens/give-feedback", async (req, res) => {
  try {
    const { reviewerAddress, targetAddress, value, valueDecimals, tag1, tag2, endpoint, feedbackURI } = req.body ?? {};
    if (!reviewerAddress || !targetAddress || value === undefined) {
      return sendError(res, 400, "reviewerAddress, targetAddress, and value required");
    }
    const result = await ensRegistry.giveFeedback(reviewerAddress, targetAddress, value, valueDecimals, tag1, tag2, endpoint, feedbackURI);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/ens/revoke-feedback", async (req, res) => {
  try {
    const { reviewerAddress, targetAddress, feedbackIndex } = req.body ?? {};
    if (!reviewerAddress || !targetAddress || feedbackIndex === undefined) {
      return sendError(res, 400, "reviewerAddress, targetAddress, and feedbackIndex required");
    }
    const result = await ensRegistry.revokeFeedback(reviewerAddress, targetAddress, feedbackIndex);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/feedback/:targetAddress/:reviewerAddress/:feedbackIndex", async (req, res) => {
  try {
    const result = await ensRegistry.readFeedback(req.params.targetAddress, req.params.reviewerAddress, req.params.feedbackIndex);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.post("/api/ens/summary", async (req, res) => {
  try {
    const { targetAddress, reviewerAddresses, tag1, tag2 } = req.body ?? {};
    if (!targetAddress) {
      return sendError(res, 400, "targetAddress required");
    }
    const result = await ensRegistry.getSummary(targetAddress, reviewerAddresses || [], tag1, tag2);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/discover", async (req, res) => {
  try {
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const tag1 = req.query.tag1 || '';
    const tag2 = req.query.tag2 || '';
    const result = await ensRegistry.discoverProfiles(offset, limit, tag1, tag2);
    res.json(result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/ens/payees", async (req, res) => {
  try {
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    const tag1 = req.query.tag1 || "";
    const tag2 = req.query.tag2 || "";
    const wallet = typeof req.query.wallet === "string" && req.query.wallet.trim() ? req.query.wallet.trim() : null;

    const discovered = await ensRegistry.discoverProfiles(offset, limit, tag1, tag2);

    const profiles = await Promise.all(
      discovered.profiles.map(async (profile) => {
        let myReview = null;
        let mySummary = null;
        let latestReviews = [];

        const reviewers = await ensRegistry.getKnownReviewers(profile.owner);
        const recentReviewerAddresses = reviewers.slice(0, 3);

        latestReviews = await Promise.all(
          recentReviewerAddresses.map(async (reviewerAddress) => {
            try {
              const feedbackIndex = await ensRegistry.getLastFeedbackIndex(profile.owner, reviewerAddress);
              if (!feedbackIndex || feedbackIndex < 1) {
                return null;
              }

              const feedback = await ensRegistry.readFeedback(profile.owner, reviewerAddress, feedbackIndex);
              return {
                reviewerAddress,
                feedbackIndex,
                ...feedback,
              };
            } catch {
              return null;
            }
          }),
        );

        latestReviews = latestReviews.filter(Boolean);

        if (wallet) {
          try {
            const feedbackIndex = await ensRegistry.getLastFeedbackIndex(profile.owner, wallet);
            if (feedbackIndex && feedbackIndex >= 1) {
              const feedback = await ensRegistry.readFeedback(profile.owner, wallet, feedbackIndex);
              myReview = {
                reviewerAddress: wallet,
                feedbackIndex,
                ...feedback,
              };
            }

            mySummary = await ensRegistry.getSummary(profile.owner, [wallet], tag1, tag2);
          } catch {
            myReview = null;
            mySummary = null;
          }
        }

        return {
          ...profile,
          latestReviews,
          myReview,
          mySummary,
        };
      }),
    );

    res.json({
      offset: discovered.offset,
      limit: discovered.limit,
      totalProfiles: discovered.totalProfiles,
      profiles,
    });
  } catch (error) {
    sendError(res, 400, error.message);
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

// POST /api/merchant/subscription
// Body: { merchantWallet, subscriberWallet, description, amountUSD, frequency, startDate, endDate }
app.post("/api/merchant/subscription", async (req, res) => {
  try {
    if (!subscriptionRegistry) {
      return sendError(res, 503, "Subscription store not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    const { merchantWallet, subscriberWallet, description, amountUSD, frequency, startDate, endDate } = req.body ?? {};

    // Validation
    if (!merchantWallet || !subscriberWallet) {
      return sendError(res, 400, "merchantWallet and subscriberWallet required");
    }
    if (!amountUSD || typeof amountUSD !== "number" || amountUSD <= 0) {
      return sendError(res, 400, "amountUSD must be a positive number");
    }
    if (!frequency || !FREQUENCY_OPTIONS.includes(frequency)) {
      return sendError(res, 400, `frequency must be one of: ${FREQUENCY_OPTIONS.join(", ")}`);
    }
    if (!startDate) {
      return sendError(res, 400, "startDate required (YYYY-MM-DD format)");
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const subscription = await subscriptionRegistry.createSubscription({
        merchant: merchantWallet,
        subscriber: subscriberWallet,
        subscriptionId,
        description: description || "",
        amountUSD,
        frequency,
        startDate,
        endDate: endDate || null,
      });

      res.json(subscription);
    } catch (chainErr) {
      console.error("Subscription storage failed:", chainErr.message);
      sendError(res, 500, `Subscription storage failed: ${chainErr.message}`);
    }
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

// GET /api/merchant/subscriptions?wallet=0x...
app.get("/api/merchant/subscriptions", async (req, res) => {
  try {
    if (!subscriptionRegistry) {
      return sendError(res, 503, "Subscription store not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    const { wallet } = req.query;
    if (!wallet) {
      return sendError(res, 400, "wallet query param required");
    }

    const subscriptions = await subscriptionRegistry.getByMerchant(wallet);
    res.json(subscriptions);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/merchant/subscription/:subscriptionId
app.get("/api/merchant/subscription/:subscriptionId", async (req, res) => {
  try {
    if (!subscriptionRegistry) {
      return sendError(res, 503, "Subscription store not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    const subscription = await subscriptionRegistry.getSubscription(req.params.subscriptionId);
    if (!subscription) {
      return sendError(res, 404, `Subscription not found: ${req.params.subscriptionId}`);
    }

    res.json(subscription);
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// PATCH /api/merchant/subscription/:subscriptionId
// Body: { isActive: boolean }
app.patch("/api/merchant/subscription/:subscriptionId", async (req, res) => {
  try {
    if (!subscriptionRegistry) {
      return sendError(res, 503, "Subscription store not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    const { isActive } = req.body ?? {};
    if (typeof isActive !== "boolean") {
      return sendError(res, 400, "isActive boolean required");
    }

    const result = await subscriptionRegistry.updateSubscriptionStatus(req.params.subscriptionId, isActive);
    res.json(result);
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
  const server = app.listen(port, () => {
    console.log(`✓ WalletConnect Pay backend listening on port ${port}`);
    console.log(`✓ Server is ready to accept connections`);
    stopSubscriptionExecutor = startSubscriptionExecutionLoop(subscriptionRegistry, invoiceRegistry);
  });

  server.on('error', (error) => {
    console.error('Server Error:', error);
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('✗ Uncaught Exception:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('✗ Unhandled Rejection:', reason);
    process.exit(1);
  });

  // Keep the server alive
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, closing gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

module.exports = {
  app,
  client,
  paymentRegistry,
};