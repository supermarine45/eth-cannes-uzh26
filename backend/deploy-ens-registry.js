require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compileContract() {
  const contractPath = path.join(__dirname, 'contracts', 'ENSCommerceReputationRegistry.sol');
  const contractSource = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'ENSCommerceReputationRegistry.sol': {
        content: contractSource,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      throw new Error('Compilation errors: ' + errors.map(e => e.message).join('\n'));
    }
  }

  const contract = output.contracts['ENSCommerceReputationRegistry.sol']['ENSCommerceReputationRegistry'];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

async function deployContract() {
  const rpcUrl = process.env.SOLIDITY_RPC_URL;
  const privateKey = process.env.SOLIDITY_PRIVATE_KEY;
  const registryOwner = process.env.SOLIDITY_REGISTRY_OWNER;

  if (!rpcUrl) {
    throw new Error('SOLIDITY_RPC_URL environment variable not set');
  }

  if (!privateKey) {
    throw new Error('SOLIDITY_PRIVATE_KEY environment variable not set');
  }

  console.log('[Deploy] Compiling contract...');
  const { abi, bytecode } = await compileContract();
  console.log('[Deploy] Contract compiled successfully');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await signer.getAddress();

  console.log(`[Deploy] Deployer address: ${deployerAddress}`);

  const ownerAddress = registryOwner ? ethers.getAddress(registryOwner) : deployerAddress;
  console.log(`[Deploy] Registry owner: ${ownerAddress}`);

  const Factory = new ethers.ContractFactory(abi, bytecode, signer);
  console.log('[Deploy] Deploying contract to Sepolia...');

  const contract = await Factory.deploy(ownerAddress);
  const deploymentTx = contract.deploymentTransaction();

  console.log(`[Deploy] Deployment transaction: ${deploymentTx.hash}`);
  const receipt = await contract.deploymentTransaction().wait();

  console.log(`[Deploy] Contract deployed successfully!`);
  console.log(`[Deploy] Contract address: ${contract.target}`);
  console.log(`[Deploy] Block number: ${receipt.blockNumber}`);
  console.log(`\n[Deploy] Add this to your .env file:`);
  console.log(`SOLIDITY_ENS_REPUTATION_REGISTRY_ADDRESS=${contract.target}`);

  return contract.target;
}

deployContract().catch(error => {
  console.error('[Deploy] Error:', error.message);
  process.exit(1);
});
