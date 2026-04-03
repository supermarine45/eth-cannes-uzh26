const { ethers } = require("ethers");

const PAYMENT_REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function paymentExists(string paymentId) view returns (bool)",
  "function getPayment(string paymentId) view returns ((string paymentId, address payer, address payee, uint256 amountWei, string currency, uint64 createdAt, bytes32 metadataHash, bool exists))",
  "function recordPayment(string paymentId, address payer, address payee, uint256 amountWei, string currency, bytes32 metadataHash)",
];

function toMetadataHash(metadata) {
  if (metadata === undefined || metadata === null) {
    return ethers.ZeroHash;
  }

  if (typeof metadata === "string") {
    const trimmed = metadata.trim();
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      return trimmed;
    }

    return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
  }

  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(metadata)));
}

function createSolidityPaymentRegistry() {
  const rpcUrl = process.env.SOLIDITY_RPC_URL;
  const privateKey = process.env.SOLIDITY_PRIVATE_KEY;
  const contractAddress = process.env.SOLIDITY_PAYMENT_REGISTRY_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) {
    return null;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, PAYMENT_REGISTRY_ABI, signer);

  return {
    async health() {
      const owner = await contract.owner();
      const network = await provider.getNetwork();

      return {
        ok: true,
        contractAddress,
        signerAddress: signer.address,
        owner,
        chainId: Number(network.chainId),
        networkName: network.name,
      };
    },

    async recordPayment(payload) {
      const paymentId = String(payload.paymentId || "").trim();
      const payer = ethers.getAddress(String(payload.payer || "").trim());
      const payee = ethers.getAddress(String(payload.payee || "").trim());
      const amountWei = BigInt(payload.amountWei);
      const currency = String(payload.currency || "").trim() || "ETH";
      const metadataHash = toMetadataHash(payload.metadata);

      if (!paymentId) {
        throw new Error("paymentId is required");
      }

      if (amountWei <= 0n) {
        throw new Error("amountWei must be greater than zero");
      }

      const tx = await contract.recordPayment(paymentId, payer, payee, amountWei, currency, metadataHash);
      const receipt = await tx.wait();

      return {
        paymentId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        payer,
        payee,
        amountWei: amountWei.toString(),
        currency,
        metadataHash,
      };
    },

    async getPayment(paymentIdInput) {
      const paymentId = String(paymentIdInput || "").trim();
      if (!paymentId) {
        throw new Error("paymentId is required");
      }

      const exists = await contract.paymentExists(paymentId);
      if (!exists) {
        return null;
      }

      const payment = await contract.getPayment(paymentId);

      return {
        paymentId: payment.paymentId,
        payer: payment.payer,
        payee: payment.payee,
        amountWei: payment.amountWei.toString(),
        currency: payment.currency,
        createdAt: Number(payment.createdAt),
        metadataHash: payment.metadataHash,
        exists: payment.exists,
      };
    },
  };
}

module.exports = {
  createSolidityPaymentRegistry,
};
