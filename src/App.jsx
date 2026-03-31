import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'pool-player-registration-v1'
const SLOT_COUNT = 16
const LEVELS = ['C', 'B', 'A+', 'A++']

/** Most recent Wednesday 10:00 local time that is still <= `date` (reset boundary for this week). */
function getLastWednesday10AM(date = new Date()) {
  const now = new Date(date)
  const thisWeekWed10AM = new Date(now)
  const dow = now.getDay()
  const daysFromWed = (dow - 3 + 7) % 7
  thisWeekWed10AM.setDate(now.getDate() - daysFromWed)
  thisWeekWed10AM.setHours(10, 0, 0, 0)

  if (now >= thisWeekWed10AM) return thisWeekWed10AM

  const prev = new Date(thisWeekWed10AM)
  prev.setDate(prev.getDate() - 7)
  return prev
}

/** Registration is open only on Wednesday from 10:00 AM to 7:00 PM local time. */
function isRegistrationWindowOpen(now = new Date()) {
  const isWednesday = now.getDay() === 3
  const hour = now.getHours()
  return isWednesday && hour >= 10 && hour < 19
}

/** Milliseconds until next Wednesday 10:00 AM. Returns 0 when window is currently open. */
function msUntilNextWednesday10AM(now = new Date()) {
  if (isRegistrationWindowOpen(now)) return 0

  const target = new Date(now)
  const dow = now.getDay()
  const daysUntilWed = (3 - dow + 7) % 7
  target.setDate(now.getDate() + daysUntilWed)
  target.setHours(10, 0, 0, 0)

  // If today is Wednesday but it's already after the daily window start, jump to next week.
  if (target <= now) {
    target.setDate(target.getDate() + 7)
  }

  return target - now
}

function getRegistrationClosedMessage(now = new Date()) {
  const day = now.getDay()
  const hour = now.getHours()

  if (day === 3 && hour < 10) {
    return 'Before 10:00 AM, players will be allowed to register at 10:00 AM.'
  }

  return 'Registration is only open every Wednesday from 10:00 AM to 7:00 PM.'
}

function formatDuration(ms) {
  if (ms <= 0) return '0:00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { slots: Array(SLOT_COUNT).fill(null), lastResetEpoch: null }
    const data = JSON.parse(raw)
    const slots = Array.isArray(data.slots)
      ? data.slots.slice(0, SLOT_COUNT)
      : Array(SLOT_COUNT).fill(null)
    while (slots.length < SLOT_COUNT) slots.push(null)
    return {
      slots,
      lastResetEpoch:
        typeof data.lastResetEpoch === 'number' ? data.lastResetEpoch : null,
    }
  } catch {
    return { slots: Array(SLOT_COUNT).fill(null), lastResetEpoch: null }
  }
}

function saveStored(slots, lastResetEpoch) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ slots, lastResetEpoch }),
  )
}

export default function App() {
  const [now, setNow] = useState(() => new Date())
  const [slots, setSlots] = useState(() => loadStored().slots)
  const [lastResetEpoch, setLastResetEpoch] = useState(
    () => loadStored().lastResetEpoch,
  )
  const [name, setName] = useState('')
  const [level, setLevel] = useState('C')
  const [status, setStatus] = useState({ type: null, text: '' })
  const [removeSlotIndex, setRemoveSlotIndex] = useState(null)

  // Tick clock every second (current time + countdown + window checks).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Weekly reset at Wednesday 10:00 AM so each registration day starts with a clean list.
  useEffect(() => {
    const boundary = getLastWednesday10AM(now).getTime()

    if (lastResetEpoch != null && lastResetEpoch >= boundary) return

    // Legacy / first load: no stored reset time — keep slots, only record current boundary.
    if (lastResetEpoch === null) {
      setLastResetEpoch(boundary)
      return
    }

    setSlots(Array(SLOT_COUNT).fill(null))
    setLastResetEpoch(boundary)
    setStatus({
      type: 'success',
      text: 'Weekly list reset (Wednesday 10:00 AM).',
    })
  }, [now, lastResetEpoch])

  // Persist whenever slots or lastResetEpoch change.
  useEffect(() => {
    saveStored(slots, lastResetEpoch)
  }, [slots, lastResetEpoch])

  const openWindow = isRegistrationWindowOpen(now)
  const filled = slots.filter(Boolean).length
  const isFull = filled >= SLOT_COUNT
  const countdownMs = msUntilNextWednesday10AM(now)
  const closedMessage = getRegistrationClosedMessage(now)

  const register = useCallback(
    (e) => {
      e.preventDefault()
      setStatus({ type: null, text: '' })

      if (!openWindow) {
        setStatus({
          type: 'error',
          text: closedMessage,
        })
        return
      }
      if (isFull) {
        setStatus({ type: 'error', text: 'No more slots available.' })
        return
      }

      const trimmed = name.trim()
      if (!trimmed) {
        setStatus({ type: 'error', text: 'Please enter a name.' })
        return
      }

      const idx = slots.findIndex((s) => !s)
      if (idx === -1) {
        setStatus({ type: 'error', text: 'No more slots available.' })
        return
      }

      setSlots((prev) => {
        const next = [...prev]
        next[idx] = { name: trimmed, level }
        return next
      })
      setName('')
      setStatus({
        type: 'success',
        text: `Registered in slot ${idx + 1}.`,
      })
    },
    [openWindow, isFull, name, level, slots, closedMessage],
  )

  const removePlayer = useCallback((slotIndex) => {
    setSlots((prev) => {
      if (!prev[slotIndex]) return prev
      const next = [...prev]
      next[slotIndex] = null
      return next
    })
    setStatus({
      type: 'success',
      text: `Removed player from slot ${slotIndex + 1}.`,
    })
  }, [])

  const openRemoveModal = useCallback((slotIndex) => {
    setRemoveSlotIndex(slotIndex)
  }, [])

  const closeRemoveModal = useCallback(() => {
    setRemoveSlotIndex(null)
  }, [])

  const confirmRemovePlayer = useCallback(() => {
    if (removeSlotIndex === null) return
    removePlayer(removeSlotIndex)
    closeRemoveModal()
  }, [removePlayer, removeSlotIndex, closeRemoveModal])

  const formDisabled = !openWindow || isFull

  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.15),transparent)] text-slate-100">
      <div className="mx-auto max-w-5xl px-2.5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] xs:px-3 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-6 text-center sm:mb-10">
          <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-white xs:text-3xl sm:text-4xl">
            Pool Player Registration
          </h1>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-slate-400 sm:max-w-none sm:text-base">
            Up to {SLOT_COUNT} players · Registration every Wednesday, 10:00 AM
            to 7:00 PM · Weekly reset at 10:00 AM
          </p>
          <div className="mt-4 flex flex-col items-stretch gap-2 xs:flex-row xs:flex-wrap xs:items-center xs:justify-center xs:gap-3">
            <span className="rounded-full bg-slate-800/80 px-4 py-2 text-center text-sm font-medium text-cyan-300 ring-1 ring-slate-700 sm:py-1.5">
              {formatTime(now)}
            </span>
            {!openWindow && countdownMs > 0 && (
              <span className="rounded-full bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200 ring-1 ring-amber-500/30 sm:py-1.5">
                Opens in {formatDuration(countdownMs)}
              </span>
            )}
          </div>
        </header>

        {!openWindow && (
          <div
            className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-center text-sm text-sky-200 sm:mb-6 sm:text-base"
            role="status"
          >
            {closedMessage}
          </div>
        )}

        {isFull && openWindow && (
          <div
            className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200 sm:mb-6 sm:text-base"
            role="status"
          >
            No more slots available.
          </div>
        )}

        {status.type && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-center text-sm font-medium sm:mb-6 ${
              status.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
            role="alert"
          >
            {status.text}
          </div>
        )}

        {/* Form first on narrow screens so users can register without scrolling past all slots */}
        <div className="flex flex-col gap-6 sm:gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start lg:gap-10">
          <section
            aria-label="Player slots"
            className="order-2 min-w-0 rounded-2xl border border-slate-800/80 bg-slate-900/45 p-3 shadow-xl ring-1 ring-white/5 xs:p-4 sm:p-5 lg:order-1"
          >
            <h2 className="mb-3 font-display text-base font-semibold text-white sm:mb-4 sm:text-lg">
              Slots ({filled}/{SLOT_COUNT})
            </h2>
            <ul className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 xs:gap-3 sm:grid-cols-3 md:grid-cols-4">
              {slots.map((player, i) => (
                <li key={i} className="min-w-0">
                  <div
                    className={`flex h-full min-h-[92px] flex-col rounded-xl border p-2.5 transition sm:min-h-[100px] sm:p-3 ${
                      player
                        ? 'border-emerald-500/40 bg-emerald-950/40 shadow-lg shadow-emerald-900/20'
                        : 'border-slate-700/80 bg-slate-900/50'
                    }`}
                  >
                    <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                      Slot {i + 1}
                    </span>
                    {player ? (
                      <>
                        <span className="mt-1 break-words text-sm font-semibold leading-snug text-white sm:text-base">
                          {player.name}
                        </span>
                        <div className="mt-auto flex flex-col items-stretch gap-2 pt-2 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                          <span className="inline-flex w-fit rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-cyan-300">
                            {player.level}
                          </span>
                          <button
                            type="button"
                            onClick={() => openRemoveModal(i)}
                            className="min-h-[38px] rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                            aria-label={`Remove ${player.name} from slot ${i + 1}`}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="mt-2 text-sm text-slate-500">Empty</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="order-1 lg:sticky lg:top-6 lg:order-2 lg:pt-8">
            <form
              onSubmit={register}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl ring-1 ring-white/5 backdrop-blur sm:p-6"
            >
              <h2 className="font-display text-lg font-semibold text-white">
                Register
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                First available slot is filled automatically.
              </p>

              <label className="mt-5 block text-sm font-medium text-slate-300">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={formDisabled}
                  enterKeyHint="done"
                  className="mt-1.5 min-h-[48px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-2.5"
                  placeholder="Player name"
                  autoComplete="name"
                  inputMode="text"
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-slate-300">
                Level
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  disabled={formDisabled}
                  className="mt-1.5 min-h-[48px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base text-white focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-2.5"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={formDisabled}
                className="mt-6 min-h-[50px] w-full rounded-lg bg-cyan-600 py-3 text-base font-semibold text-white shadow-lg shadow-cyan-900/30 transition active:bg-cyan-700 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none sm:min-h-[44px] sm:py-2.5"
              >
                {isFull ? 'List full' : !openWindow ? 'Open Wed 10 AM - 7 PM' : 'Join'}
              </button>
            </form>
          </aside>
        </div>
      </div>

      {removeSlotIndex !== null && slots[removeSlotIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-player-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <h3
              id="remove-player-title"
              className="font-display text-lg font-semibold text-white"
            >
              Remove player?
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Remove <span className="font-semibold">{slots[removeSlotIndex].name}</span>{' '}
              from slot {removeSlotIndex + 1}?
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeRemoveModal}
                className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemovePlayer}
                className="min-h-[44px] rounded-lg border border-rose-500/40 bg-rose-600 px-3 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/70"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
