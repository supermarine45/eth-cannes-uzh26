const ENS_NAME_PATTERN = /^[a-z0-9]+\.cannes$/

function normalizeCannesEnsName(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (!ENS_NAME_PATTERN.test(normalized)) {
    throw new Error('ENS name must end with .cannes and use only letters or numbers before the suffix.')
  }

  return normalized
}

module.exports = {
  ENS_NAME_PATTERN,
  normalizeCannesEnsName,
}
