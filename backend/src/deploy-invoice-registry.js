require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

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

function compileContract() {
  const contractPath = path.join(__dirname, "..", "contracts", "InvoiceRegistry.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: { "InvoiceRegistry.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (Array.isArray(output.errors)) {
    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Compile failed:\n${errors.map((e) => e.formattedMessage).join("\n")}`);
    }
  }

  const contractOutput = output.contracts?.["InvoiceRegistry.sol"]?.InvoiceRegistry;
  if (!contractOutput) throw new Error("InvoiceRegistry not found in compiled output");

  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
  };
}

async function main() {
  const rpcUrl = getEnv("SOLIDITY_RPC_URL");
  const privateKey = getEnv("SOLIDITY_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(signer.address);
  console.log(`Deployer: ${signer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} C2FLR`);

  if (balance === 0n) {
    throw new Error("Deployer wallet has no C2FLR. Get tokens from faucet.flare.network");
  }

  console.log("\nCompiling InvoiceRegistry.sol...");
  const { abi, bytecode } = compileContract();
  console.log("Compiled successfully.");

  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  console.log("\nDeploying to Coston2...");

  const contract = await factory.deploy(signer.address);
  const tx = contract.deploymentTransaction();
  if (tx?.hash) console.log(`Tx hash: ${tx.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const network = await provider.getNetwork();

  console.log("\nDeployment successful:");
  console.log(`  Contract address: ${address}`);
  console.log(`  Chain ID:         ${Number(network.chainId)}`);
  console.log(`  Explorer:         https://coston2-explorer.flare.network/address/${address}`);
  console.log("\nAdd this to your .env file:");
  console.log(`  INVOICE_REGISTRY_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
