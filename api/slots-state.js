import { kv } from '@vercel/kv'

const STATE_KEY = 'pool-player-registration:state'
const EMPTY_STATE = {
  slots: Array(16).fill(null),
  lastResetEpoch: null,
  version: 0,
}

function normalizeState(data) {
  const slots = Array.isArray(data?.slots) ? data.slots.slice(0, 16) : Array(16).fill(null)
  while (slots.length < 16) slots.push(null)
  return {
    slots,
    lastResetEpoch: typeof data?.lastResetEpoch === 'number' ? data.lastResetEpoch : null,
    version: typeof data?.version === 'number' ? data.version : 0,
  }
}

async function readState() {
  const data = await kv.get(STATE_KEY)
  if (!data) return EMPTY_STATE
  return normalizeState(data)
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const state = await readState()
      return res.status(200).json(state)
    }

    if (req.method === 'PUT') {
      const incoming = normalizeState(req.body)
      const baseVersion = Number(req.body?.baseVersion ?? -1)
      const current = await readState()

      // Reject stale writes so concurrent registrants cannot overwrite each other silently.
      if (baseVersion !== current.version) {
        return res.status(409).json(current)
      }

      const next = {
        slots: incoming.slots,
        lastResetEpoch: incoming.lastResetEpoch,
        version: current.version + 1,
      }
      await kv.set(STATE_KEY, next)
      return res.status(200).json(next)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch {
    return res.status(500).json({ error: 'Failed to process slots state.' })
  }
}
