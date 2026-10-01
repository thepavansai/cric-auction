export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    try {
      localStorage.removeItem('cricket-auction-bid-snapshots')
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
}

export const isPlayerRoster = (value) => {
  if (!Array.isArray(value)) return false
  const ids = new Set()
  for (const player of value) {
    if (!player || typeof player !== 'object' || typeof player.ID !== 'string') return false
    const id = player.ID.trim()
    if (!id || ids.has(id)) return false
    ids.add(id)
  }
  return true
}