import { useState, useEffect } from 'react'
import {
  getScores,
  getSections,
  getLeaderboard,
  getSettings,
  type Score,
  type Section,
  type LeaderboardEntry,
  type Settings
} from '../api'

const LAPS = 3

function getScoreCellColor(points: number): string {
  if (points === 0) return 'bg-trials-success/20 text-trials-success'
  if (points === 1) return 'bg-emerald-400/20 text-emerald-400'
  if (points === 2) return 'bg-yellow-400/20 text-yellow-400'
  if (points === 3) return 'bg-orange-500/20 text-orange-500'
  if (points === 5) return 'bg-red-500/20 text-red-500'
  if (points === 20) return 'bg-gray-700/50 text-gray-500'
  return 'text-gray-400'
}

function getRankedByClass(
  cls: string,
  leaderboard: LeaderboardEntry[]
): (LeaderboardEntry & { rank: number; completed: boolean })[] {
  let filtered: LeaderboardEntry[]

  if (cls === 'enduro') {
    filtered = leaderboard.filter(c => c.enduro_trial === 1 || c.primary_class === 'enduro-trial')
  } else {
    filtered = leaderboard.filter(c => c.primary_class === cls)
  }

  const isEnduro = cls === 'enduro'
  const maxSections = isEnduro ? 6 : (cls === 'kids' ? 9 : 18)

  const completedRiders = filtered.filter(c => {
    const sections = isEnduro ? c.enduro_sections_done : c.main_sections_done
    return sections >= maxSections
  })
  const incompleteRiders = filtered.filter(c => {
    const sections = isEnduro ? c.enduro_sections_done : c.main_sections_done
    return sections < maxSections
  })

  const sortFn = (a: LeaderboardEntry, b: LeaderboardEntry) => {
    const aTotal = isEnduro ? a.enduro_total : a.main_total
    const bTotal = isEnduro ? b.enduro_total : b.main_total
    if (aTotal !== bTotal) return aTotal - bTotal
    const aTime = isEnduro ? a.enduro_last_scored_at : a.main_last_scored_at
    const bTime = isEnduro ? b.enduro_last_scored_at : b.main_last_scored_at
    if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1
    return 0
  }
  completedRiders.sort(sortFn)
  incompleteRiders.sort(sortFn)

  let currentRank = 1
  const rankedCompleted = completedRiders.map((entry, index) => {
    if (index > 0) {
      const prev = completedRiders[index - 1]
      const currentTotal = isEnduro ? entry.enduro_total : entry.main_total
      const prevTotal = isEnduro ? prev.enduro_total : prev.main_total
      const currentTime = isEnduro ? entry.enduro_last_scored_at : entry.main_last_scored_at
      const prevTime = isEnduro ? prev.enduro_last_scored_at : prev.main_last_scored_at
      if (currentTotal !== prevTotal || currentTime !== prevTime) {
        currentRank = index + 1
      }
    }
    return { ...entry, rank: currentRank, completed: true }
  })

  const rankedIncomplete = incompleteRiders.map(entry => ({
    ...entry, rank: 0, completed: false
  }))

  return [...rankedCompleted, ...rankedIncomplete]
}

function StandingsTable({
  title,
  entries,
  colorClass,
  sections,
  scores
}: {
  title: string
  entries: (LeaderboardEntry & { rank: number; completed: boolean })[]
  colorClass: string
  sections: Section[]
  scores: Score[]
}) {
  if (entries.length === 0) {
    return (
      <div>
        <h3 className={`text-xl font-display font-bold ${colorClass} mb-2`}>{title}</h3>
        <p className="text-gray-500 text-sm">No competitors</p>
      </div>
    )
  }

  const hasCompleted = entries.some(e => e.completed)
  const hasIncomplete = entries.some(e => !e.completed)

  const columns: { sec: Section; lap: number; label: string }[] = []
  for (let lap = 1; lap <= LAPS; lap++) {
    sections.forEach((sec, i) => {
      columns.push({ sec, lap, label: `S${i + 1}L${lap}` })
    })
  }

  function getScore(riderId: number, sectionId: number, lap: number): number {
    const score = scores.find(s =>
      s.competitor_id === riderId &&
      s.section_id === sectionId &&
      s.lap === lap
    )
    if (!score || score.points === null) return 20
    return score.points
  }

  return (
    <div>
      <h3 className={`text-2xl font-display font-bold ${colorClass} mb-3`}>{title}</h3>
      <div className="bg-trials-darker rounded-lg overflow-x-auto">
        <table className="w-max min-w-full">
          <thead>
            <tr className="border-b border-gray-700 text-xs text-gray-400">
              <th className="px-2 py-2 text-left sticky left-0 bg-trials-darker z-10 w-10">#</th>
              <th className="px-2 py-2 text-left sticky left-10 bg-trials-darker z-10 w-12">No.</th>
              <th className="px-2 py-2 text-left sticky left-[5.5rem] bg-trials-darker z-10 min-w-[80px]">Name</th>
              {columns.map((col, i) => (
                <th key={i} className={`px-1 py-2 text-center w-10 ${
                  i > 0 && col.lap !== columns[i - 1].lap ? 'border-l border-gray-700' : ''
                }`}>
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2 text-center w-14 border-l border-gray-700 font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.map((entry, idx) => {
              const showSeparator = hasCompleted && hasIncomplete && !entry.completed && (idx === 0 || entries[idx - 1].completed)

              let total = 0
              const cellValues = columns.map(col => {
                const pts = getScore(entry.id, col.sec.id, col.lap)
                total += pts
                return pts
              })

              return (
                <tr key={entry.id} className={`${!entry.completed ? 'opacity-60' : ''} ${showSeparator ? 'border-t-2 border-dashed border-gray-600' : ''}`}>
                  <td className={`px-2 py-2 font-display font-bold text-sm sticky left-0 bg-trials-darker z-10 ${
                    !entry.completed ? 'text-gray-600' :
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-amber-600' :
                    'text-gray-500'
                  }`}>
                    {entry.completed ? entry.rank : '-'}
                  </td>
                  <td className="px-2 py-2 font-display font-bold text-trials-orange text-sm sticky left-10 bg-trials-darker z-10">
                    #{entry.number}
                  </td>
                  <td className="px-2 py-2 text-sm truncate max-w-[100px] sticky left-[5.5rem] bg-trials-darker z-10">
                    {entry.name}
                  </td>
                  {cellValues.map((pts, i) => (
                    <td key={i} className={`px-1 py-2 text-center text-xs font-mono font-bold ${getScoreCellColor(pts)} ${
                      i > 0 && columns[i].lap !== columns[i - 1].lap ? 'border-l border-gray-700' : ''
                    }`}>
                      {pts}
                    </td>
                  ))}
                  <td className={`px-2 py-2 text-center font-display font-bold text-sm border-l border-gray-700 ${total === 0 && entry.completed ? 'text-trials-success' : ''}`}>
                    {total}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FinalScores() {
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<Score[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [scoresData, secs, lb, sett] = await Promise.all([
        getScores(),
        getSections(),
        getLeaderboard(),
        getSettings()
      ])
      setScores(scoresData)
      setSections(secs)
      setLeaderboard(lb)
      setSettings(sett)
    } catch (err) {
      console.error('Failed to load data', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-trials-orange text-xl font-display animate-pulse">Loading...</div>
      </div>
    )
  }

  const kidsSections = sections.filter(s => s.type === 'kids')
  const mainSections = sections.filter(s => s.type === 'main')
  const enduroSections = sections.filter(s => s.type === 'enduro')

  return (
    <div className="min-h-screen bg-trials-darker text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-trials-orange mb-2">
            {settings?.event_name || 'Trial Score'}
          </h1>
          <p className="text-lg text-gray-400">Final Standings</p>
          {settings?.event_date && (
            <p className="text-sm text-gray-500 mt-1">{settings.event_date}</p>
          )}
        </div>

        {/* Standings tables */}
        <div className="space-y-10">
          <StandingsTable
            title="Kids"
            entries={getRankedByClass('kids', leaderboard)}
            colorClass="text-yellow-400"
            sections={kidsSections}
            scores={scores}
          />

          <StandingsTable
            title="Clubman"
            entries={getRankedByClass('clubman', leaderboard)}
            colorClass="text-emerald-500"
            sections={mainSections}
            scores={scores}
          />

          <StandingsTable
            title="Advanced"
            entries={getRankedByClass('advanced', leaderboard)}
            colorClass="text-red-500"
            sections={mainSections}
            scores={scores}
          />

          <StandingsTable
            title="Enduro Trial"
            entries={getRankedByClass('enduro', leaderboard)}
            colorClass="text-gray-300"
            sections={enduroSections}
            scores={scores}
          />
        </div>
      </div>
    </div>
  )
}
