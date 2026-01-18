import { useState, useEffect } from 'react'
import { getScores, getLeaderboard, getSettings, type LeaderboardEntry, type Settings, type Score } from '../api'
import { onScoreNew } from '../socket'
import { UserIcon } from '../components/Icons'

type ClassFilter = 'all' | 'kids' | 'clubman' | 'advanced' | 'enduro'

const CLASS_LABELS: Record<string, string> = {
  kids: 'KIDS',
  clubman: 'CLUBMAN',
  advanced: 'ADVANCED',
  enduro: 'ENDURO TRIAL'
}

const CLASS_COLORS: Record<string, string> = {
  kids: 'text-yellow-400',
  clubman: 'text-emerald-500',
  advanced: 'text-red-500',
  enduro: 'text-gray-300'
}

function getScoreColor(points: number | null, isDnf: boolean): string {
  if (isDnf) return 'bg-gray-600 text-white'
  if (points === 0) return 'bg-trials-success text-trials-darker'
  if (points === 1) return 'bg-emerald-400 text-trials-darker'
  if (points === 2) return 'bg-yellow-400 text-trials-darker'
  if (points === 3) return 'bg-orange-500 text-white'
  if (points === 5) return 'bg-red-500 text-white'
  return 'bg-gray-700 text-gray-500'
}

interface DisplayEntry {
  score: Score
  competitor: LeaderboardEntry | undefined
  totalPoints: number
}

export default function Display() {
  const [scores, setScores] = useState<Score[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [classFilter, setClassFilter] = useState<ClassFilter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()

    // Subscribe to realtime updates
    const unsubScore = onScoreNew(() => {
      // Reload scores and leaderboard when new score comes in
      loadScores()
    })

    return () => {
      unsubScore()
    }
  }, [])

  async function loadData() {
    try {
      const [scoresData, lb, sett] = await Promise.all([
        getScores(),
        getLeaderboard(),
        getSettings()
      ])
      setScores(scoresData)
      setLeaderboard(lb)
      setSettings(sett)
    } catch (err) {
      console.error('Failed to load data', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadScores() {
    try {
      const [scoresData, lb] = await Promise.all([getScores(), getLeaderboard()])
      setScores(scoresData)
      setLeaderboard(lb)
    } catch (err) {
      console.error('Failed to load scores', err)
    }
  }

  function getFilteredEntries(): DisplayEntry[] {
    // Get unique competitors from scores (most recent score per competitor)
    const competitorLatestScore = new Map<number, Score>()
    
    // Scores are already sorted by created_at desc from API
    scores.forEach(score => {
      if (!competitorLatestScore.has(score.competitor_id)) {
        competitorLatestScore.set(score.competitor_id, score)
      }
    })

    // Compute total points per competitor from all their scores
    // Use Number() to handle potential string IDs from JSON
    const competitorTotals = new Map<number, number>()
    scores.forEach(score => {
      if (!score.is_dnf && score.points !== null) {
        const compId = Number(score.competitor_id)
        const current = competitorTotals.get(compId) || 0
        competitorTotals.set(compId, current + (score.points || 0))
      }
    })

    // Convert to display entries
    let entries: DisplayEntry[] = Array.from(competitorLatestScore.values()).map(score => {
      const compId = Number(score.competitor_id)
      const comp = leaderboard.find(c => Number(c.id) === compId)
      return {
        score,
        competitor: comp,
        totalPoints: competitorTotals.get(compId) || 0
      }
    })

    // Filter by class
    if (classFilter !== 'all') {
      entries = entries.filter(entry => {
        if (!entry.competitor) return false
        if (classFilter === 'enduro') {
          return entry.competitor.enduro_trial === 1
        }
        return entry.competitor.primary_class === classFilter
      })
    }

    // Sort by score time (most recent first) - scores already sorted but re-sort to be safe
    entries.sort((a, b) => 
      new Date(b.score.created_at).getTime() - new Date(a.score.created_at).getTime()
    )

    return entries
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-4xl font-display text-trials-orange animate-pulse">LOADING...</div>
      </div>
    )
  }

  const entries = getFilteredEntries()

  return (
    <div className="min-h-screen bg-trials-darker flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <header className="bg-gradient-to-r from-trials-dark to-trials-darker border-b-4 border-trials-orange px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-display font-bold text-trials-orange tracking-wider">
            {settings?.event_name || 'MOTO TRIAL'}
          </h1>
          {settings?.event_date && (
            <p className="text-lg text-gray-400 font-display">
              {new Date(settings.event_date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          )}
        </div>

        {/* Class filter tabs */}
        <div className="flex gap-2">
          {(['all', 'kids', 'clubman', 'advanced', 'enduro'] as ClassFilter[]).map(cls => (
            <button
              key={cls}
              onClick={() => setClassFilter(cls)}
              className={`px-6 py-3 font-display text-lg font-bold rounded-lg transition-all ${
                classFilter === cls
                  ? cls === 'all'
                    ? 'bg-white text-trials-darker'
                    : cls === 'kids'
                    ? 'bg-yellow-400 text-trials-darker'
                    : cls === 'clubman'
                    ? 'bg-emerald-500 text-trials-darker'
                    : cls === 'advanced'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-800 text-white border border-gray-500'
                  : 'bg-trials-dark text-gray-400 hover:text-white'
              }`}
            >
              {cls === 'all' ? 'ALL' : CLASS_LABELS[cls]}
            </button>
          ))}
        </div>
      </header>

      {/* Score Feed */}
      <main className="flex-1 overflow-hidden p-6">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-3xl text-gray-500 font-display">NO SCORES YET</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[120px_80px_1fr_160px_80px_100px] gap-4 px-4 py-3 text-gray-400 font-display text-lg border-b border-gray-700 sticky top-0 bg-trials-darker">
              <div>TIME</div>
              <div>NO.</div>
              <div>RIDER</div>
              <div className="text-center">LATEST SECTION</div>
              <div className="text-center">SCORE</div>
              <div className="text-right">TOTAL</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-800">
              {entries.map((entry, index) => {
                const { score, competitor, totalPoints } = entry
                const isRecent = index === 0

                return (
                  <div
                    key={score.id}
                    className={`grid grid-cols-[120px_80px_1fr_160px_80px_100px] gap-4 px-4 py-4 items-center transition-all ${
                      isRecent ? 'bg-trials-orange/10 border-l-4 border-trials-orange' : ''
                    }`}
                  >
                    {/* Time */}
                    <div className="text-gray-400 text-sm">
                      {new Date(score.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>

                    {/* Number */}
                    <div className="font-display text-3xl font-bold text-trials-orange">
                      #{score.competitor_number}
                    </div>

                    {/* Name + Photo + Class */}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                        {competitor?.photo_url ? (
                          <img src={competitor.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <UserIcon className="w-7 h-7" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-2xl font-semibold truncate">{score.competitor_name}</div>
                        {competitor && (
                          <div className={`text-sm font-display font-bold ${CLASS_COLORS[competitor.primary_class]}`}>
                            {CLASS_LABELS[competitor.primary_class]}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Latest Section */}
                    <div className="text-center">
                      <div className="text-xl font-display font-bold">{score.section_name}</div>
                      <div className="text-sm text-gray-400">Lap {score.lap}</div>
                    </div>

                    {/* Section Score */}
                    <div className="flex justify-center">
                      <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-display font-bold ${getScoreColor(score.points, !!score.is_dnf)}`}>
                        {score.is_dnf ? 'X' : score.points}
                      </div>
                    </div>

                    {/* Total score */}
                    <div className={`text-right font-display text-3xl font-bold ${
                      totalPoints === 0 ? 'text-trials-success' : 'text-white'
                    }`}>
                      {totalPoints}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer - Live indicator */}
      <footer className="bg-trials-dark border-t border-gray-800 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-trials-success rounded-full animate-pulse" />
          <span className="text-gray-400 font-display">LIVE SCORES</span>
        </div>
        <div className="text-gray-500 text-sm">
          {entries.length} recent scores • Sorted by time
        </div>
      </footer>
    </div>
  )
}
