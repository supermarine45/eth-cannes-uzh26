const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY || "";
const BASE_URL = "https://trade-api.gateway.uniswap.org/v1";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASE_CHAIN_ID = 8453;

/**
 * Get a quote + build a swap transaction: tokenIn -> exact USDC amount out.
 *
 * @param {string} userWallet   - user's wallet address
 * @param {string} tokenIn      - token to swap from (ETH_ADDRESS for native ETH)
 * @param {number} usdcAmount   - exact USDC amount merchant needs (e.g. 23.47)
 * @returns {{ quote, transaction }}
 */
async function buildSwapToUSDC(userWallet, tokenIn, usdcAmount) {
  const amountSmallest = Math.round(usdcAmount * 1_000_000).toString(); // USDC = 6 decimals

  // Step 1: Get quote
  const quoteRes = await fetch(`${BASE_URL}/quote`, {
    method: "POST",
    headers: { "x-api-key": UNISWAP_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenIn,
      tokenOut: USDC_BASE,
      tokenInChainId: BASE_CHAIN_ID,
      tokenOutChainId: BASE_CHAIN_ID,
      type: "EXACT_OUTPUT",
      amount: amountSmallest,
      swapper: userWallet,
      slippageTolerance: 0.5,
    }),
  });

  const quoteData = await quoteRes.json();
  if (!quoteData.quote) throw new Error(`Uniswap quote failed: ${JSON.stringify(quoteData)}`);

  // Step 2: Build transaction immediately (quote expires in ~30s)
  const swapRes = await fetch(`${BASE_URL}/swap`, {
    method: "POST",
    headers: { "x-api-key": UNISWAP_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ quote: quoteData.quote }),
  });

  const swapData = await swapRes.json();
  if (!swapData.swap) throw new Error(`Uniswap swap build failed: ${JSON.stringify(swapData)}`);

  return {
    quote: {
      tokenIn,
      tokenInAmount: quoteData.quote.input.amount,
      usdcOut: usdcAmount,
      gasFeeUSD: quoteData.quote.gasFeeUSD,
      routing: quoteData.routing,
    },
    transaction: swapData.swap,
  };
}

module.exports = { buildSwapToUSDC, ETH_ADDRESS, USDC_BASE };
