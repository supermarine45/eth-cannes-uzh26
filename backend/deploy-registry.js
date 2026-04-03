const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

function getEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function compileRegistryContract() {
  const contractPath = path.join(__dirname, "contracts", "WalletConnectPaymentRegistry.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "WalletConnectPaymentRegistry.sol": {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (Array.isArray(output.errors)) {
    const errors = output.errors.filter((entry) => entry.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Solidity compile failed:\n${errors.map((entry) => entry.formattedMessage).join("\n")}`);
    }
  }

  const contractOutput = output.contracts?.["WalletConnectPaymentRegistry.sol"]?.WalletConnectPaymentRegistry;
  if (!contractOutput) {
    throw new Error("Compiled contract output not found for WalletConnectPaymentRegistry");
  }

  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
  };
}

async function main() {
  const rpcUrl = getEnv("SOLIDITY_RPC_URL");
  const privateKey = getEnv("SOLIDITY_PRIVATE_KEY");
  const ownerOverride = process.env.SOLIDITY_REGISTRY_OWNER?.trim();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const ownerAddress = ownerOverride && ownerOverride !== "" ? ethers.getAddress(ownerOverride) : signer.address;

  const { abi, bytecode } = compileRegistryContract();
  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  console.log(`Deploying WalletConnectPaymentRegistry from ${signer.address} with owner ${ownerAddress}...`);
  const contract = await factory.deploy(ownerAddress);
  const deploymentTx = contract.deploymentTransaction();

  if (deploymentTx?.hash) {
    console.log(`Deployment tx hash: ${deploymentTx.hash}`);
  }

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const network = await provider.getNetwork();

  console.log("Deployment successful:");
  console.log(`  Contract: ${address}`);
  console.log(`  Chain ID: ${Number(network.chainId)}`);
  console.log(`  Network : ${network.name}`);
  console.log("");
  console.log("Set this environment variable for backend runtime:");
  console.log(`  SOLIDITY_PAYMENT_REGISTRY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
