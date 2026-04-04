const { ethers } = require("ethers");

const STATUS_MAP = ["Pending", "Paid", "Expired", "Cancelled"];

const ABI = [
  "function invoiceCount() view returns (uint256)",
  "function createInvoice(address merchant, address recipient, string paymentId, string gatewayUrl, string description, uint256 amountCents, uint64 dueDate) returns (uint256)",
  "function updateStatus(string paymentId, uint8 newStatus)",
  "function getInvoicesByMerchant(address merchant) view returns (tuple(uint256 id, address merchant, address recipient, string paymentId, string gatewayUrl, string description, uint256 amountCents, uint64 createdAt, uint64 dueDate, uint8 status)[])",
  "function getInvoicesByRecipient(address recipient) view returns (tuple(uint256 id, address merchant, address recipient, string paymentId, string gatewayUrl, string description, uint256 amountCents, uint64 createdAt, uint64 dueDate, uint8 status)[])",
  "function getInvoiceByPaymentId(string paymentId) view returns (tuple(uint256 id, address merchant, address recipient, string paymentId, string gatewayUrl, string description, uint256 amountCents, uint64 createdAt, uint64 dueDate, uint8 status))",
];

function formatInvoice(inv) {
  return {
    id: Number(inv.id),
    merchant: inv.merchant,
    recipient: inv.recipient,
    paymentId: inv.paymentId,
    gatewayUrl: inv.gatewayUrl,
    description: inv.description,
    amountUSD: Number(inv.amountCents) / 100,
    createdAt: Number(inv.createdAt),
    dueDate: Number(inv.dueDate) || null,
    status: STATUS_MAP[Number(inv.status)] || "Pending",
  };
}

function createInvoiceRegistry() {
  const rpcUrl = process.env.SOLIDITY_RPC_URL;
  const privateKey = process.env.SOLIDITY_PRIVATE_KEY;
  const contractAddress = process.env.INVOICE_REGISTRY_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) return null;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, ABI, signer);

  return {
    async createInvoice({ merchant, recipient, paymentId, gatewayUrl, description, amountUSD, dueDate }) {
      const amountCents = Math.round(amountUSD * 100);
      const dueDateTs = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : 0;

      const tx = await contract.createInvoice(
        ethers.getAddress(merchant),
        ethers.getAddress(recipient),
        paymentId,
        gatewayUrl,
        description || "",
        amountCents,
        dueDateTs
      );
      const receipt = await tx.wait();
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
    },

    async updateStatus(paymentId, status) {
      const statusIndex = STATUS_MAP.indexOf(status);
      if (statusIndex === -1) throw new Error(`Invalid status: ${status}`);
      const tx = await contract.updateStatus(paymentId, statusIndex);
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    },

    async getByMerchant(merchantAddress) {
      const invoices = await contract.getInvoicesByMerchant(ethers.getAddress(merchantAddress));
      return invoices.map(formatInvoice);
    },

    async getByRecipient(recipientAddress) {
      const invoices = await contract.getInvoicesByRecipient(ethers.getAddress(recipientAddress));
      return invoices.map(formatInvoice);
    },

    async getByPaymentId(paymentId) {
      const inv = await contract.getInvoiceByPaymentId(paymentId);
      return formatInvoice(inv);
    },
  };
}

module.exports = { createInvoiceRegistry };
