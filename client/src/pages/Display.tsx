import { useState, useEffect } from 'react'
import { getScores, getLeaderboard, getSettings, type LeaderboardEntry, type Settings, type Score, type ClassConfig } from '../api'
import { onScoreNew } from '../socket'
import { UserIcon } from '../components/Icons'

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
  classId: string
  className: string
  classColor: string
  sectionsDoneAtTime: number
  maxSections: number
  averageScoreAtTime: string
  rank: number
}

export default function Display() {
  const [scores, setScores] = useState<Score[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [classFilter, setClassFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const unsubScore = onScoreNew(() => loadScores())
    return () => { unsubScore() }
  }, [])

  async function loadData() {
    try {
      const [scoresData, lb, sett] = await Promise.all([getScores(), getLeaderboard(), getSettings()])
      setScores(scoresData); setLeaderboard(lb); setSettings(sett)
    } catch (err) { console.error('Failed to load data', err) }
    finally { setLoading(false) }
  }

  async function loadScores() {
    try {
      const [scoresData, lb] = await Promise.all([getScores(), getLeaderboard()])
      setScores(scoresData); setLeaderboard(lb)
    } catch (err) { console.error('Failed to load scores', err) }
  }

  const classes: ClassConfig[] = settings?.classes || []

  // For a score, figure out the best class match for display
  function resolveClassForScore(score: Score, comp: LeaderboardEntry | undefined): ClassConfig | undefined {
    if (!comp) return undefined
    const compClasses = comp.classes || []
    // Find classes the competitor is in that include this section
    const matching = classes.filter(cls =>
      compClasses.includes(cls.id) && cls.section_ids.includes(score.section_id)
    )
    return matching[0]
  }

  function getHistoricalStats(compId: number, atTime: number, cls: ClassConfig): { sections: number; total: number; avg: number } {
    const relevantScores = scores.filter(s => {
      if (Number(s.competitor_id) !== compId) return false
      if (new Date(s.created_at).getTime() > atTime) return false
      return cls.section_ids.includes(s.section_id)
    })
    const sections = relevantScores.length
    const total = relevantScores.reduce((sum, s) => sum + (s.points ?? 0), 0)
    return { sections, total, avg: sections > 0 ? total / sections : 0 }
  }

  function getFilteredEntries(): DisplayEntry[] {
    let entries: DisplayEntry[] = scores.map(score => {
      const compId = Number(score.competitor_id)
      const comp = leaderboard.find(c => Number(c.id) === compId)
      const cls = resolveClassForScore(score, comp)
      const scoreTime = new Date(score.created_at).getTime()

      const maxSections = cls ? cls.section_ids.length * cls.laps : 0
      const stats = cls ? getHistoricalStats(compId, scoreTime, cls) : { sections: 0, total: 0, avg: 0 }

      // Historical rank among class competitors
      let rank = 0
      if (cls) {
        const classCompetitors: Array<{ id: number; avg: number }> = []
        leaderboard.forEach(c => {
          if (!(c.classes || []).includes(cls.id)) return
          const s = getHistoricalStats(Number(c.id), scoreTime, cls)
          if (s.sections > 0) classCompetitors.push({ id: Number(c.id), avg: s.avg })
        })
        classCompetitors.sort((a, b) => a.avg - b.avg)
        rank = classCompetitors.findIndex(c => c.id === compId) + 1
      }

      return {
        score,
        competitor: comp,
        classId: cls?.id || '',
        className: cls?.name || '',
        classColor: cls?.color || '#888',
        sectionsDoneAtTime: stats.sections,
        maxSections,
        averageScoreAtTime: stats.sections > 0 ? (stats.total / stats.sections).toFixed(1) : '0.0',
        rank
      }
    })

    if (classFilter !== 'all') {
      entries = entries.filter(e => {
        if (!e.competitor) return false
        return (e.competitor.classes || []).includes(classFilter)
      })
    }

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
      <header className="bg-gradient-to-r from-trials-dark to-trials-darker border-b-4 border-trials-orange px-4 md:px-8 py-3 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-display font-bold text-trials-orange tracking-wider truncate">
            {settings?.event_name || 'MOTO TRIAL'}
          </h1>
          {settings?.event_date && (
            <p className="text-sm md:text-lg text-gray-400 font-display">
              {new Date(settings.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
          <button
            onClick={() => setClassFilter('all')}
            className={`px-3 md:px-6 py-2 md:py-3 font-display text-sm md:text-lg font-bold rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              classFilter === 'all' ? 'bg-white text-trials-darker' : 'bg-trials-dark text-gray-400 hover:text-white'
            }`}
          >ALL</button>
          {classes.map(cls => (
            <button
              key={cls.id}
              onClick={() => setClassFilter(cls.id)}
              className="px-3 md:px-6 py-2 md:py-3 font-display text-sm md:text-lg font-bold rounded-lg transition-all whitespace-nowrap flex-shrink-0"
              style={classFilter === cls.id ? { backgroundColor: cls.color, color: '#1a1a2e' } : { color: '#9ca3af' }}
            >
              {cls.name.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-3 md:p-6">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-2xl md:text-3xl text-gray-500 font-display">NO SCORES YET</p>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[80px_50px_1fr_120px_60px_80px] md:grid-cols-[100px_60px_1fr_140px_70px_110px] gap-2 md:gap-4 px-3 md:px-4 py-2 md:py-3 text-gray-400 font-display text-sm md:text-lg border-b border-gray-700 sticky top-0 bg-trials-darker">
                <div>TIME</div>
                <div className="text-center">RANK</div>
                <div>RIDER</div>
                <div className="text-center">SECTION</div>
                <div className="text-center">PTS</div>
                <div className="text-right">AVG</div>
              </div>
              <div className="divide-y divide-gray-800">
                {entries.map((entry, index) => {
                  const { score, competitor, className: clsName, classColor, sectionsDoneAtTime, maxSections, averageScoreAtTime, rank } = entry
                  const isRecent = index === 0

                  return (
                    <div key={score.id}
                      className={`grid grid-cols-[80px_50px_1fr_120px_60px_80px] md:grid-cols-[100px_60px_1fr_140px_70px_110px] gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 items-center transition-all ${isRecent ? 'bg-trials-orange/10 border-l-4 border-trials-orange' : ''}`}>
                      <div className="flex items-center text-gray-400 text-xs md:text-sm">
                        {new Date(score.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center justify-center font-display text-xl md:text-2xl font-bold text-trials-orange">
                        {rank > 0 ? rank : '-'}
                      </div>
                      <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                          {competitor?.photo_url ? (
                            <img src={competitor.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500"><UserIcon className="w-5 h-5 md:w-6 md:h-6" /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-base md:text-xl font-semibold truncate">{score.competitor_name}</div>
                          <div className="flex items-center gap-1 md:gap-2">
                            <span className="text-xs md:text-sm text-trials-orange font-bold">#{score.competitor_number}</span>
                            <span className="text-xs md:text-sm font-display font-bold" style={{ color: classColor }}>{clsName.toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-center min-w-0">
                        <div className="text-sm md:text-lg font-display font-bold truncate">{score.section_name}</div>
                        <div className="text-xs md:text-sm text-gray-400">Lap {score.lap}</div>
                      </div>
                      <div className="flex justify-center">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-lg md:text-xl font-display font-bold ${getScoreColor(score.points, !!score.is_dnf)}`}>
                          {score.is_dnf ? 'X' : score.points}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-display text-lg md:text-2xl font-bold ${averageScoreAtTime === '0.0' ? 'text-trials-success' : 'text-white'}`}>
                          {averageScoreAtTime}
                        </div>
                        <div className="text-xs md:text-sm text-gray-500">{sectionsDoneAtTime}/{maxSections}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-trials-dark border-t border-gray-800 px-4 md:px-8 py-2 md:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-2 h-2 md:w-3 md:h-3 bg-trials-success rounded-full animate-pulse" />
          <span className="text-gray-400 font-display text-sm md:text-base">LIVE</span>
        </div>
        <div className="text-gray-500 text-xs md:text-sm">{entries.length} scores</div>
      </footer>
    </div>
  )
}
