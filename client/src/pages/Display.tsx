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
  // For enduro sections: show enduro stats, for main/kids: show main stats
  isEnduroSection: boolean
  // Historical stats at the time of this score
  sectionsDoneAtTime: number
  maxSections: number
  totalPointsAtTime: number
  averageScoreAtTime: string
  // Current rank in class (based on current average)
  rank: number
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

  // Helper: calculate historical stats for a competitor at a given timestamp
  function getHistoricalStats(
    compId: number, 
    atTime: number, 
    isEnduro: boolean
  ): { sections: number; total: number; avg: number } {
    const relevantScores = scores.filter(s => {
      if (Number(s.competitor_id) !== compId) return false
      const sTime = new Date(s.created_at).getTime()
      if (sTime > atTime) return false
      if (isEnduro) {
        return s.section_type === 'enduro'
      } else {
        return s.section_type === 'main' || s.section_type === 'kids'
      }
    })
    
    const sections = relevantScores.length
    const total = relevantScores.reduce((sum, s) => {
      if (s.points === null) return sum
      return sum + s.points
    }, 0)
    const avg = sections > 0 ? total / sections : 0
    
    return { sections, total, avg }
  }

  function getFilteredEntries(): DisplayEntry[] {
    // Max sections per class:
    // - Main (clubman/advanced): 6 sections × 3 laps = 18
    // - Kids: 3 sections × 3 laps = 9
    // - Enduro: 2 sections × 3 laps = 6
    const MAX_MAIN_SECTIONS = 18
    const MAX_KIDS_SECTIONS = 9
    const MAX_ENDURO_SECTIONS = 6

    // Convert ALL scores to display entries with HISTORICAL rankings
    let entries: DisplayEntry[] = scores.map(score => {
      const compId = Number(score.competitor_id)
      const comp = leaderboard.find(c => Number(c.id) === compId)
      const scoreTime = new Date(score.created_at).getTime()
      
      // Determine if this score is from an enduro section
      const isEnduroSection = score.section_type === 'enduro'
      const isKidsSection = score.section_type === 'kids'
      const maxSections = isEnduroSection 
        ? MAX_ENDURO_SECTIONS 
        : isKidsSection 
          ? MAX_KIDS_SECTIONS 
          : MAX_MAIN_SECTIONS
      
      // Calculate HISTORICAL stats for this competitor at time of score
      const myStats = getHistoricalStats(compId, scoreTime, isEnduroSection)
      const sectionsDoneAtTime = myStats.sections
      const totalPointsAtTime = myStats.total
      const averageScoreAtTime = sectionsDoneAtTime > 0
        ? (totalPointsAtTime / sectionsDoneAtTime).toFixed(1)
        : '0.0'
      
      // Calculate HISTORICAL rank: compare with all competitors at this timestamp
      // For enduro sections: rank among enduro participants
      // For trial sections: rank among same primary class
      const rankClass = isEnduroSection ? 'enduro' : (comp?.primary_class || 'clubman')
      
      // Get all competitors in this class and calculate their historical averages
      const classCompetitors: Array<{ id: number; avg: number }> = []
      leaderboard.forEach(c => {
        const cId = Number(c.id)
        // Check if competitor belongs to this ranking class
        const belongsToClass = isEnduroSection 
          ? (c.enduro_trial === 1 || c.primary_class === 'enduro-trial')
          : c.primary_class === rankClass
        
        if (belongsToClass) {
          const stats = getHistoricalStats(cId, scoreTime, isEnduroSection)
          if (stats.sections > 0) {
            classCompetitors.push({ id: cId, avg: stats.avg })
          }
        }
      })
      
      // Sort by average (lowest first) and find rank
      classCompetitors.sort((a, b) => a.avg - b.avg)
      const rank = classCompetitors.findIndex(c => c.id === compId) + 1
      
      return {
        score,
        competitor: comp,
        isEnduroSection,
        sectionsDoneAtTime,
        maxSections,
        totalPointsAtTime,
        averageScoreAtTime,
        rank
      }
    })

    // Filter by class
    if (classFilter !== 'all') {
      entries = entries.filter(entry => {
        if (!entry.competitor) return false
        if (classFilter === 'enduro') {
          return entry.competitor.enduro_trial === 1 || entry.competitor.primary_class === 'enduro-trial'
        }
        return entry.competitor.primary_class === classFilter
      })
    }

    // Scores are already sorted by created_at desc from API
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
      <header className="bg-gradient-to-r from-trials-dark to-trials-darker border-b-4 border-trials-orange px-4 md:px-8 py-3 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-display font-bold text-trials-orange tracking-wider truncate">
            {settings?.event_name || 'MOTO TRIAL'}
          </h1>
          {settings?.event_date && (
            <p className="text-sm md:text-lg text-gray-400 font-display">
              {new Date(settings.event_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </p>
          )}
        </div>

        {/* Class filter tabs - horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
          {(['all', 'kids', 'clubman', 'advanced', 'enduro'] as ClassFilter[]).map(cls => (
            <button
              key={cls}
              onClick={() => setClassFilter(cls)}
              className={`px-3 md:px-6 py-2 md:py-3 font-display text-sm md:text-lg font-bold rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
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

      {/* Score Feed - horizontal scroll wrapper for portrait */}
      <main className="flex-1 overflow-hidden p-3 md:p-6">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-2xl md:text-3xl text-gray-500 font-display">NO SCORES YET</p>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            {/* Min width ensures horizontal scroll on narrow screens */}
            <div className="min-w-[700px]">
              {/* Table Header */}
              <div className="grid grid-cols-[80px_50px_1fr_120px_60px_80px] md:grid-cols-[100px_60px_1fr_140px_70px_110px] gap-2 md:gap-4 px-3 md:px-4 py-2 md:py-3 text-gray-400 font-display text-sm md:text-lg border-b border-gray-700 sticky top-0 bg-trials-darker">
                <div>TIME</div>
                <div className="text-center">RANK</div>
                <div>RIDER</div>
                <div className="text-center">SECTION</div>
                <div className="text-center">PTS</div>
                <div className="text-right">AVG</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-800">
                {entries.map((entry, index) => {
                  const { score, competitor, isEnduroSection, sectionsDoneAtTime, maxSections, averageScoreAtTime, rank } = entry
                  const isRecent = index === 0

                  return (
                    <div
                      key={score.id}
                      className={`grid grid-cols-[80px_50px_1fr_120px_60px_80px] md:grid-cols-[100px_60px_1fr_140px_70px_110px] gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 items-center transition-all ${
                        isRecent ? 'bg-trials-orange/10 border-l-4 border-trials-orange' : ''
                      }`}
                    >
                      {/* Time */}
                      <div className="flex items-center text-gray-400 text-xs md:text-sm">
                        {new Date(score.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>

                      {/* Rank in class */}
                      <div className="flex items-center justify-center font-display text-xl md:text-2xl font-bold text-trials-orange">
                        {rank > 0 ? rank : '-'}
                      </div>

                      {/* Photo + Name + Number + Class */}
                      <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                          {competitor?.photo_url ? (
                            <img src={competitor.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                              <UserIcon className="w-5 h-5 md:w-6 md:h-6" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-base md:text-xl font-semibold truncate">{score.competitor_name}</div>
                          <div className="flex items-center gap-1 md:gap-2">
                            <span className="text-xs md:text-sm text-trials-orange font-bold">#{score.competitor_number}</span>
                            {competitor && (
                              <span className={`text-xs md:text-sm font-display font-bold ${
                                isEnduroSection ? CLASS_COLORS['enduro'] : CLASS_COLORS[competitor.primary_class]
                              }`}>
                                {isEnduroSection ? 'ENDURO' : CLASS_LABELS[competitor.primary_class]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Section */}
                      <div className="text-center min-w-0">
                        <div className="text-sm md:text-lg font-display font-bold truncate">{score.section_name}</div>
                        <div className="text-xs md:text-sm text-gray-400">Lap {score.lap}</div>
                      </div>

                      {/* Section Score */}
                      <div className="flex justify-center">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-lg md:text-xl font-display font-bold ${getScoreColor(score.points, !!score.is_dnf)}`}>
                          {score.is_dnf ? 'X' : score.points}
                        </div>
                      </div>

                      {/* Average + Sections done (historical at time of score) */}
                      <div className="text-right">
                        <div className={`font-display text-lg md:text-2xl font-bold ${
                          averageScoreAtTime === '0.0' ? 'text-trials-success' : 'text-white'
                        }`}>
                          {averageScoreAtTime}
                        </div>
                        <div className="text-xs md:text-sm text-gray-500">
                          {sectionsDoneAtTime}/{maxSections}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer - Live indicator */}
      <footer className="bg-trials-dark border-t border-gray-800 px-4 md:px-8 py-2 md:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-2 h-2 md:w-3 md:h-3 bg-trials-success rounded-full animate-pulse" />
          <span className="text-gray-400 font-display text-sm md:text-base">LIVE</span>
        </div>
        <div className="text-gray-500 text-xs md:text-sm">
          {entries.length} scores
        </div>
      </footer>
    </div>
  )
}
