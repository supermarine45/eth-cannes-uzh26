// Commodity price service
// Metals (Gold, Silver, Platinum, Palladium): Flare FDC Web2Json attested (decentralized)
// Energy & Agricultural: Yahoo Finance (centralized, NOT FDC verified)
// Crypto cross-rates: Flare FTSO (on-chain oracle)

const FDC_VERIFIER_URL = "https://fdc-verifiers-testnet.flare.network";
const FDC_VERIFIER_API_KEY = process.env.FLARE_VERIFIER_API_KEY || "00000000-0000-0000-0000-000000000000";
const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

const ATTESTATION_TYPE = "0x576562324a736f6e000000000000000000000000000000000000000000000000";
const SOURCE_ID = "0x5075626c69635765623200000000000000000000000000000000000000000000";

const COMMODITIES = {
  // FDC verified — Coinbase price attested by Flare network
  GOLD:        { source: "flare_fdc", coinbaseTicker: "XAU", name: "Gold",         unit: "troy oz" },
  SILVER:      { source: "flare_fdc", coinbaseTicker: "XAG", name: "Silver",       unit: "troy oz" },
  PLATINUM:    { source: "flare_fdc", coinbaseTicker: "XPT", name: "Platinum",     unit: "troy oz" },
  PALLADIUM:   { source: "flare_fdc", coinbaseTicker: "XPD", name: "Palladium",    unit: "troy oz" },

  // NOT FDC verified — Yahoo Finance direct fetch
  COPPER:      { source: "yahoo", yahooTicker: "HG=F", name: "Copper",          unit: "lb" },
  OIL_WTI:     { source: "yahoo", yahooTicker: "CL=F", name: "WTI Crude Oil",   unit: "barrel" },
  OIL_BRENT:   { source: "yahoo", yahooTicker: "BZ=F", name: "Brent Crude Oil", unit: "barrel" },
  NATURAL_GAS: { source: "yahoo", yahooTicker: "NG=F", name: "Natural Gas",     unit: "MMBtu" },
  WHEAT:       { source: "yahoo", yahooTicker: "ZW=F", name: "Wheat",           unit: "bushel" },
  CORN:        { source: "yahoo", yahooTicker: "ZC=F", name: "Corn",            unit: "bushel" },
  COFFEE:      { source: "yahoo", yahooTicker: "KC=F", name: "Coffee",          unit: "lb" },
  SUGAR:       { source: "yahoo", yahooTicker: "SB=F", name: "Sugar",           unit: "lb" },
};

async function fetchViaFlareFDC(coinbaseTicker) {
  const apiUrl = `https://api.coinbase.com/v2/exchange-rates?currency=${coinbaseTicker}`;

  const res = await fetch(`${FDC_VERIFIER_URL}/verifier/web2/Web2Json/prepareRequest`, {
    method: "POST",
    headers: { "X-API-KEY": FDC_VERIFIER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      attestationType: ATTESTATION_TYPE,
      sourceId: SOURCE_ID,
      requestBody: {
        url: apiUrl,
        httpMethod: "GET",
        headers: "{}",
        queryParams: "{}",
        body: "{}",
        postProcessJq: "{price: (.data.rates.USD | tonumber)}",
        abiSignature: JSON.stringify({
          components: [{ internalType: "uint256", name: "price", type: "uint256" }],
          name: "task",
          type: "tuple",
        }),
      },
    }),
  });

  const data = await res.json();
  if (data.status !== "VALID") {
    throw new Error(`Flare FDC attestation failed: ${data.status}`);
  }

  const priceRes = await fetch(apiUrl);
  const priceData = await priceRes.json();
  const usdPrice = parseFloat(priceData.data.rates.USD);

  return {
    usdPrice,
    fdcVerified: true,
    dataSource: "Coinbase (Flare FDC attested)",
    flareAttestation: {
      status: data.status,
      abiEncodedRequest: data.abiEncodedRequest,
      verifiedBy: "Flare FDC Web2Json",
    },
  };
}

async function fetchViaYahoo(yahooTicker) {
  const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
  const data = await res.json();
  const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!usdPrice || isNaN(usdPrice)) throw new Error(`Could not fetch price for ${yahooTicker}`);

  return {
    usdPrice,
    fdcVerified: false,
    dataSource: "Yahoo Finance (not FDC verified)",
  };
}

async function getCommodityUSDPrice(commodity) {
  const key = commodity.toUpperCase().replace(/[-\s]/g, "_");
  const meta = COMMODITIES[key];

  if (!meta) {
    const supported = Object.keys(COMMODITIES).join(", ");
    throw new Error(`Unsupported commodity: ${commodity}. Supported: ${supported}`);
  }

  const result = meta.source === "flare_fdc"
    ? await fetchViaFlareFDC(meta.coinbaseTicker)
    : await fetchViaYahoo(meta.yahooTicker);

  return {
    commodity: key,
    name: meta.name,
    usdPrice: result.usdPrice,
    unit: meta.unit,
    fdcVerified: result.fdcVerified,
    dataSource: result.dataSource,
    ...(result.flareAttestation ? { flareAttestation: result.flareAttestation } : {}),
  };
}

async function getCommodityInCrypto(commodity, crypto) {
  const { getUSDPrice } = require("./flare-service");

  const [commodityData, cryptoData] = await Promise.all([
    getCommodityUSDPrice(commodity),
    getUSDPrice(crypto),
  ]);

  const crossRate = commodityData.usdPrice / cryptoData.price;

  return {
    commodity: commodityData.commodity,
    commodityName: commodityData.name,
    commodityUSD: commodityData.usdPrice,
    unit: commodityData.unit,
    fdcVerified: commodityData.fdcVerified,
    dataSource: commodityData.dataSource,
    crypto: crypto.toUpperCase(),
    cryptoUSD: cryptoData.price,
    cryptoSource: "Flare FTSO (on-chain oracle)",
    crossRate,
    meaning: `1 ${commodityData.name} (${commodityData.unit}) = ${crossRate.toFixed(6)} ${crypto.toUpperCase()}`,
    flareTimestamp: cryptoData.timestamp,
    ...(commodityData.flareAttestation ? { flareAttestation: commodityData.flareAttestation } : {}),
  };
}

async function getAllCommodityPrices() {
  const results = await Promise.allSettled(
    Object.keys(COMMODITIES).map((key) => getCommodityUSDPrice(key))
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { commodity: Object.keys(COMMODITIES)[i], error: r.reason.message }
  );
}

module.exports = { getCommodityUSDPrice, getCommodityInCrypto, getAllCommodityPrices, COMMODITIES };
