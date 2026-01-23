import { useState } from 'react'
import { verifyPin } from '../api'

interface PinModalProps {
  role: 'manager' | 'judge'
  onSuccess: () => void
}

const COOKIE_NAME = {
  manager: 'trial_manager_auth',
  judge: 'trial_judge_auth'
}

export function getPinCookie(role: 'manager' | 'judge'): string | null {
  const name = COOKIE_NAME[role]
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

export function setPinCookie(role: 'manager' | 'judge', pin: string) {
  const name = COOKIE_NAME[role]
  // Cookie expires in 24 hours
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${pin}; expires=${expires}; path=/`
}

export default function PinModal({ role, onSuccess }: PinModalProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pin.trim() || loading) return

    setLoading(true)
    setError('')

    try {
      const result = await verifyPin(pin, role)
      if (result.valid) {
        setPinCookie(role, pin)
        onSuccess()
      } else {
        setError('Invalid PIN')
        setPin('')
      }
    } catch {
      setError('Failed to verify PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-trials-dark rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-2xl font-display font-bold text-trials-orange mb-2 text-center">
          {role === 'manager' ? '🔐 Manager Access' : '🏁 Judge Access'}
        </h2>
        <p className="text-gray-400 text-center mb-6">
          Enter PIN to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="Enter PIN"
            className="w-full px-4 py-4 bg-trials-darker border border-gray-700 rounded-lg text-center text-2xl tracking-widest focus:border-trials-orange focus:outline-none"
            autoFocus
          />

          {error && (
            <p className="text-red-500 text-center text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={!pin.trim() || loading}
            className="w-full py-4 bg-trials-orange text-trials-darker font-bold text-lg rounded-lg hover:bg-trials-orange/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
