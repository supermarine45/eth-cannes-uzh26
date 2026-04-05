const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY;
if (!UNISWAP_API_KEY) throw new Error("UNISWAP_API_KEY not set in .env");

const BASE_URL = "https://trade-api.gateway.uniswap.org/v1";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASE_CHAIN_ID = 8453;

function toSmallestUnit(amount, decimals) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("amount must be a positive number");
  }

  return Math.round(numericAmount * (10 ** decimals)).toString();
}

function formatUnitsFromRaw(rawValue, decimals) {
  if (rawValue == null) {
    return null;
  }

  const value = BigInt(String(rawValue));
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;

  if (fraction === 0n) {
    return whole.toString();
  }

  const trimmed = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}

async function requestUniswapQuote({ tokenIn, tokenOut, tokenInDecimals, tokenOutDecimals, amount, type = "EXACT_INPUT", swapper = ETH_ADDRESS }) {
  const quoteRes = await fetch(`${BASE_URL}/quote`, {
    method: "POST",
    headers: { "x-api-key": UNISWAP_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenIn,
      tokenOut,
      tokenInChainId: BASE_CHAIN_ID,
      tokenOutChainId: BASE_CHAIN_ID,
      type,
      amount: toSmallestUnit(amount, type === "EXACT_INPUT" ? tokenInDecimals : tokenOutDecimals),
      swapper,
      slippageTolerance: 0.5,
    }),
  });

  const quoteData = await quoteRes.json();
  if (!quoteData.quote) throw new Error(`Uniswap quote failed: ${JSON.stringify(quoteData)}`);

  return {
    inputAmount: formatUnitsFromRaw(quoteData.quote.input?.amount, tokenInDecimals),
    outputAmount: formatUnitsFromRaw(quoteData.quote.output?.amount, tokenOutDecimals),
    gasFeeUSD: quoteData.quote.gasFeeUSD,
    routing: quoteData.routing,
    raw: quoteData.quote,
  };
}

async function buildSwapToUSDC(userWallet, tokenIn, usdcAmount, tokenInDecimals = 18) {
  const quoteData = await requestUniswapQuote({
    tokenIn,
    tokenOut: USDC_BASE,
    tokenInDecimals,
    tokenOutDecimals: 6,
    amount: usdcAmount,
    type: "EXACT_OUTPUT",
    swapper: userWallet,
  });

  const swapRes = await fetch(`${BASE_URL}/swap`, {
    method: "POST",
    headers: { "x-api-key": UNISWAP_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ quote: quoteData.raw }),
  });

  const swapData = await swapRes.json();
  if (!swapData.swap) throw new Error(`Uniswap swap build failed: ${JSON.stringify(swapData)}`);

  return {
    quote: {
      tokenIn,
      tokenInAmount: quoteData.inputAmount,
      usdcOut: usdcAmount,
      gasFeeUSD: quoteData.gasFeeUSD,
      routing: quoteData.routing,
    },
    transaction: swapData.swap,
  };
}

async function getLiveEthUsdcRates() {
  const [ethToUsdc, usdcToEth] = await Promise.all([
    requestUniswapQuote({
      tokenIn: ETH_ADDRESS,
      tokenOut: USDC_BASE,
      tokenInDecimals: 18,
      tokenOutDecimals: 6,
      amount: 1,
      type: "EXACT_INPUT",
    }),
    requestUniswapQuote({
      tokenIn: USDC_BASE,
      tokenOut: ETH_ADDRESS,
      tokenInDecimals: 6,
      tokenOutDecimals: 18,
      amount: 1,
      type: "EXACT_INPUT",
    }),
  ]);

  return {
    pair: "ETH/USDC",
    chainId: BASE_CHAIN_ID,
    ethToUsdc: {
      inputAmount: "1",
      inputSymbol: "ETH",
      outputAmount: ethToUsdc.outputAmount,
      outputSymbol: "USDC",
      gasFeeUSD: ethToUsdc.gasFeeUSD,
      routing: ethToUsdc.routing,
    },
    usdcToEth: {
      inputAmount: "1",
      inputSymbol: "USDC",
      outputAmount: usdcToEth.outputAmount,
      outputSymbol: "ETH",
      gasFeeUSD: usdcToEth.gasFeeUSD,
      routing: usdcToEth.routing,
    },
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { buildSwapToUSDC, getLiveEthUsdcRates, ETH_ADDRESS, USDC_BASE };
