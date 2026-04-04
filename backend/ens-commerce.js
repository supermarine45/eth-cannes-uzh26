require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ABI = [
  "function health() public view returns (bool)",
  "function registerProfile(string ensName, bytes32 ensNode, string profileURI) external",
  "function registerProfileFor(address ownerAddress, string ensName, bytes32 ensNode, string profileURI) external",
  "function updateProfile(string ensName, bytes32 ensNode, string profileURI, bool active) external",
  "function updateProfileFor(address ownerAddress, string ensName, bytes32 ensNode, string profileURI, bool active) external",
  "function giveFeedback(address targetAddress, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function giveFeedbackFor(address reviewerAddress, address targetAddress, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function revokeFeedback(address targetAddress, uint64 feedbackIndex) external",
  "function revokeFeedbackFor(address reviewerAddress, address targetAddress, uint64 feedbackIndex) external",
  "function appendResponse(address targetAddress, address reviewerAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash) external",
  "function getProfile(address ownerAddress) external view returns (tuple(address owner, string ensName, bytes32 ensNode, string profileURI, uint64 registeredAt, bool active))",
  "function resolveEnsNode(bytes32 ensNode) external view returns (address)",
  "function getProfileCount() external view returns (uint256)",
  "function getProfileOwners(uint256 offset, uint256 limit) external view returns (address[])",
  "function getKnownReviewers(address targetAddress) external view returns (address[])",
  "function getLastIndex(address targetAddress, address reviewerAddress) external view returns (uint64)",
  "function readFeedback(address targetAddress, address reviewerAddress, uint64 feedbackIndex) external view returns (tuple(int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked))",
  "function getSummary(address targetAddress, address[] reviewerAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
];

function toContentHash(uri) {
  if (!uri || uri.trim() === '') {
    return ethers.zeroPadValue('0x', 32);
  }
  return ethers.id(uri);
}

function parseEnsNode(ensName, ensNode) {
  if (ensNode && ensNode !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return ensNode;
  }
  return ethers.namehash(ensName || 'eth');
}

function normalizeSummary(count, totalScaled18, decimals) {
  const normalizedDecimals = Number(decimals ?? 18);

  if (count === 0n || count === 0) {
    return {
      count: 0,
      total: '0',
      average: '0',
      decimals: normalizedDecimals,
    };
  }

  const countBigInt = typeof count === 'bigint' ? count : BigInt(count);
  const totalBigInt = typeof totalScaled18 === 'bigint' ? totalScaled18 : BigInt(totalScaled18);

  const total = ethers.formatUnits(totalBigInt, 18);
  const average = ethers.formatUnits(totalBigInt / countBigInt, 18);

  return {
    count: Number(countBigInt),
    total,
    average,
    decimals: normalizedDecimals,
  };
}

function createEnsCommerceRegistry() {
  const rpcUrl = process.env.SOLIDITY_ENS_RPC_URL;
  const privateKey = process.env.SOLIDITY_ENS_PRIVATE_KEY;
  const contractAddress = process.env.SOLIDITY_ENS_REPUTATION_REGISTRY_ADDRESS;

  if (!rpcUrl) {
    console.warn('[ENS] SOLIDITY_ENS_RPC_URL not configured');
  }

  if (!contractAddress) {
    console.warn('[ENS] SOLIDITY_ENS_REPUTATION_REGISTRY_ADDRESS not configured');
  }

  let contract = null;
  let signer = null;

  function ensureInitialized() {
    if (!rpcUrl || !contractAddress) {
      throw new Error('ENS configuration incomplete: RPC URL or contract address missing');
    }
    if (!contract) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      signer = privateKey ? new ethers.Wallet(privateKey, provider) : null;
      contract = new ethers.Contract(contractAddress, ABI, signer || provider);
    }
    return { contract, signer };
  }

  return {
    health: async () => {
      try {
        if (!contract) ensureInitialized();
        const count = await contract.getProfileCount();
        return { healthy: true, profileCount: Number(count) };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    },

    registerProfile: async (ownerAddress, ensName, ensNode, profileURI) => {
      const { contract } = ensureInitialized();
      const normalizedEnsNode = parseEnsNode(ensName, ensNode);
      const tx = await contract.registerProfileFor(ethers.getAddress(ownerAddress), ensName, normalizedEnsNode, profileURI || '');
      const receipt = await tx.wait();
      return {
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        ownerAddress: ethers.getAddress(ownerAddress),
        ensName,
        ensNode: normalizedEnsNode,
        profileURI: profileURI || '',
      };
    },

    updateProfile: async (ownerAddress, ensName, ensNode, profileURI, active) => {
      const { contract } = ensureInitialized();
      const normalizedEnsNode = parseEnsNode(ensName, ensNode);
      const tx = await contract.updateProfileFor(ethers.getAddress(ownerAddress), ensName, normalizedEnsNode, profileURI || '', active ?? true);
      const receipt = await tx.wait();
      return {
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        ownerAddress: ethers.getAddress(ownerAddress),
        ensName,
        ensNode: normalizedEnsNode,
        profileURI: profileURI || '',
        active: active ?? true,
      };
    },

    getProfile: async (ownerAddress) => {
      const { contract } = ensureInitialized();
      const profile = await contract.getProfile(ownerAddress);
      return {
        owner: profile.owner,
        ensName: profile.ensName,
        ensNode: profile.ensNode,
        profileURI: profile.profileURI,
        registeredAt: Number(profile.registeredAt),
        active: profile.active,
      };
    },

    resolveEnsNode: async (ensNode) => {
      const { contract } = ensureInitialized();
      return await contract.resolveEnsNode(ensNode);
    },

    giveFeedback: async (reviewerAddress, targetAddress, value, valueDecimals, tag1, tag2, endpoint, feedbackURI) => {
      const { contract } = ensureInitialized();
      const feedbackHash = toContentHash(feedbackURI);
      const tx = await contract.giveFeedbackFor(ethers.getAddress(reviewerAddress), ethers.getAddress(targetAddress), value, valueDecimals || 0, tag1 || '', tag2 || '', endpoint || '', feedbackURI || '', feedbackHash);
      const receipt = await tx.wait();
      return {
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        reviewerAddress: ethers.getAddress(reviewerAddress),
        targetAddress: ethers.getAddress(targetAddress),
        value: value.toString(),
        valueDecimals: valueDecimals || 0,
        tag1: tag1 || '',
        tag2: tag2 || '',
        feedbackURI: feedbackURI || '',
      };
    },

    revokeFeedback: async (reviewerAddress, targetAddress, feedbackIndex) => {
      const { contract } = ensureInitialized();
      const tx = await contract.revokeFeedbackFor(ethers.getAddress(reviewerAddress), ethers.getAddress(targetAddress), feedbackIndex);
      const receipt = await tx.wait();
      return {
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        reviewerAddress: ethers.getAddress(reviewerAddress),
        targetAddress: ethers.getAddress(targetAddress),
        feedbackIndex: Number(feedbackIndex),
      };
    },

    readFeedback: async (targetAddress, reviewerAddress, feedbackIndex) => {
      const { contract } = ensureInitialized();
      const feedback = await contract.readFeedback(targetAddress, reviewerAddress, feedbackIndex);
      return {
        value: feedback.value.toString(),
        valueDecimals: Number(feedback.valueDecimals),
        tag1: feedback.tag1,
        tag2: feedback.tag2,
        isRevoked: feedback.isRevoked,
      };
    },

    getKnownReviewers: async (targetAddress) => {
      const { contract } = ensureInitialized();
      const reviewers = await contract.getKnownReviewers(targetAddress);
      return Array.from(reviewers);
    },

    getLastFeedbackIndex: async (targetAddress, reviewerAddress) => {
      const { contract } = ensureInitialized();
      const index = await contract.getLastIndex(targetAddress, reviewerAddress);
      return Number(index);
    },

    getSummary: async (targetAddress, reviewerAddresses, tag1, tag2) => {
      const { contract } = ensureInitialized();
      if (!reviewerAddresses || reviewerAddresses.length === 0) {
        return normalizeSummary(0, 0, 18);
      }
      const [count, summaryValue, decimals] = await contract.getSummary(
        targetAddress,
        reviewerAddresses.map(addr => ethers.getAddress(addr)),
        tag1 || '',
        tag2 || ''
      );
      return normalizeSummary(count, summaryValue, decimals);
    },

    discoverProfiles: async (offset = 0, limit = 10, tag1 = '', tag2 = '') => {
      const { contract } = ensureInitialized();
      const totalCount = await contract.getProfileCount();
      const owners = await contract.getProfileOwners(offset, limit);

      const profiles = [];
      for (const owner of owners) {
        try {
          const profile = await contract.getProfile(owner);
          const reviewers = await contract.getKnownReviewers(owner);
          const reviewerAddresses = Array.from(reviewers);
          const summary = reviewerAddresses.length > 0
            ? await contract.getSummary(owner, reviewerAddresses, tag1, tag2)
            : [0n, 0n, 18n];
          profiles.push({
            owner: profile.owner,
            ensName: profile.ensName,
            ensNode: profile.ensNode,
            profileURI: profile.profileURI,
            registeredAt: Number(profile.registeredAt),
            active: profile.active,
            reviewerCount: reviewerAddresses.length,
            summary: normalizeSummary(summary[0], summary[1], summary[2]),
          });
        } catch (error) {
          console.error(`[ENS] Error loading profile ${owner}:`, error.message);
        }
      }

      return {
        offset: Number(offset),
        limit: Number(limit),
        totalProfiles: Number(totalCount),
        profiles,
      };
    },
  };
}

module.exports = { createEnsCommerceRegistry };
