const { ethers } = require("ethers");

const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";
const FTSO_ADDRESS = "0x3d893C53D9e8056135C26C8c638B76C8b60Df726";

const FTSO_ABI = [
  "function getFeedById(bytes21 feedId) external view returns (uint256 value, int8 decimals, uint64 timestamp)",
];

const FEED_IDS = {
  ETH: "0x014554482f55534400000000000000000000000000",
  XRP: "0x015852502f55534400000000000000000000000000",
  BTC: "0x014254432f55534400000000000000000000000000",
};

let ftso;

function getContract() {
  if (!ftso) {
    const provider = new ethers.JsonRpcProvider(COSTON2_RPC);
    ftso = new ethers.Contract(FTSO_ADDRESS, FTSO_ABI, provider);
  }
  return ftso;
}

async function getUSDPrice(token) {
  const feedId = FEED_IDS[token.toUpperCase()];
  if (!feedId) throw new Error(`Unsupported token: ${token}. Use ETH, XRP, or BTC.`);
  const [value, decimals, timestamp] = await getContract().getFeedById(feedId);
  const price = Number(value) / Math.pow(10, Number(decimals));
  return { price, timestamp: Number(timestamp) };
}

async function calculateTokenAmount(invoiceUSD, token) {
  const { price, timestamp } = await getUSDPrice(token);
  const tokenAmount = invoiceUSD / price;
  return { tokenAmount, usdPrice: price, token: token.toUpperCase(), timestamp };
}

module.exports = { getUSDPrice, calculateTokenAmount };
