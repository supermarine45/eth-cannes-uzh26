const ENS_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL
const ENS_NAME_PATTERN = /^[a-z0-9]+\.cannes$/

const ENS_REGISTRY_ABI = [
  'function registerProfile(string ensName, bytes32 ensNode, string profileURI) external',
]

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '') ?? ''
}

function trimLeadingSlash(value) {
  return value?.replace(/^\/+/, '') ?? ''
}

function buildUrl(path) {
  const baseUrl = trimTrailingSlash(ENS_BASE_URL || '')
  const normalizedPath = trimLeadingSlash(path)

  if (!baseUrl) {
    return `/${normalizedPath}`
  }

  return `${baseUrl}/${normalizedPath}`
}

async function request(path, options = {}) {
  const method = options.method || 'GET'
  const body = options.body
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    const message = data?.error ?? data?.message ?? `ENS request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

export function normalizeCannesEnsName(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (!ENS_NAME_PATTERN.test(normalized)) {
    throw new Error('ENS name must end with .cannes and use only letters or numbers before the suffix.')
  }

  return normalized
}

export function getEnsPayees({ walletAddress, offset = 0, limit = 10 } = {}) {
  const query = new URLSearchParams()
  query.set('offset', String(offset))
  query.set('limit', String(limit))

  if (walletAddress) {
    query.set('wallet', walletAddress)
  }

  return request(`/api/ens/payees?${query.toString()}`)
}

export function getEnsHealth() {
  return request('/api/ens/health')
}

export async function registerEnsProfileWithMetaMask({ ethereumProvider, ensName, profileURI = '', expectedOwnerAddress }) {
  const { BrowserProvider, Contract, getAddress, namehash } = await import('ethers')

  if (!ethereumProvider) {
    throw new Error('MetaMask provider not found.')
  }

  const health = await getEnsHealth()
  const contractAddress = health?.contractAddress
  const expectedChainId = Number(health?.chainId)

  if (!contractAddress) {
    throw new Error('ENS registry contract address is not available from backend health.')
  }

  const provider = new BrowserProvider(ethereumProvider)

  if (Number.isFinite(expectedChainId) && expectedChainId > 0) {
    const currentChainHex = await ethereumProvider.request({ method: 'eth_chainId' })
    const currentChainId = Number.parseInt(currentChainHex, 16)

    if (currentChainId !== expectedChainId) {
      const targetHex = `0x${expectedChainId.toString(16)}`
      await ethereumProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }],
      })
    }
  }

  const signer = await provider.getSigner()
  const signerAddress = getAddress(await signer.getAddress()).toLowerCase()

  const deployedCode = await provider.getCode(contractAddress)
  if (!deployedCode || deployedCode === '0x') {
    throw new Error('ENS registry contract is not deployed on the currently selected MetaMask network. Switch MetaMask to the ENS chain and try again.')
  }

  if (expectedOwnerAddress) {
    const normalizedExpected = getAddress(expectedOwnerAddress).toLowerCase()
    if (normalizedExpected !== signerAddress) {
      throw new Error('Connect MetaMask with your primary wallet before registering ENS on-chain.')
    }
  }

  const ENS_REGISTRY_ABI = [
    'function registerProfile(string ensName, bytes32 ensNode, string profileURI) external',
  ]
  const contract = new Contract(contractAddress, ENS_REGISTRY_ABI, signer)
  const ensNode = namehash(ensName)
  const tx = await contract.registerProfile(ensName, ensNode, profileURI)

  const receipt = await tx.wait()
  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    signerAddress,
    contractAddress,
  }
}

export function searchEnsProfile(query, { walletAddress } = {}) {
  const normalizedQuery = String(query || '').trim()
  const searchParams = new URLSearchParams({ query: normalizedQuery })

  if (walletAddress) {
    searchParams.set('wallet', walletAddress)
  }

  return request(`/api/ens/search?${searchParams.toString()}`)
}
