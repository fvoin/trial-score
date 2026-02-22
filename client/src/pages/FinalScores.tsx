import { useState, useEffect } from 'react'
import {
  getScores,
  getSections,
  getLeaderboard,
  getSettings,
  type Score,
  type Section,
  type LeaderboardEntry,
  type Settings,
  type ClassConfig
} from '../api'
import Timeline from './Timeline'

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
  cls: ClassConfig,
  leaderboard: LeaderboardEntry[]
): (LeaderboardEntry & { rank: number; completed: boolean })[] {
  const filtered = leaderboard.filter(c => (c.classes || []).includes(cls.id))
  const maxSections = cls.section_ids.length * cls.laps

  const completedRiders = filtered.filter(c => {
    const ct = c.class_totals?.[cls.id]
    return ct && ct.sections_done >= maxSections
  })
  const incompleteRiders = filtered.filter(c => {
    const ct = c.class_totals?.[cls.id]
    return !ct || ct.sections_done < maxSections
  })

  const sortFn = (a: LeaderboardEntry, b: LeaderboardEntry) => {
    const aT = a.class_totals?.[cls.id]?.total ?? 0
    const bT = b.class_totals?.[cls.id]?.total ?? 0
    if (aT !== bT) return aT - bT
    const aTime = a.class_totals?.[cls.id]?.last_scored_at || ''
    const bTime = b.class_totals?.[cls.id]?.last_scored_at || ''
    if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1
    return 0
  }
  completedRiders.sort(sortFn)
  incompleteRiders.sort(sortFn)

  let currentRank = 1
  const rankedCompleted = completedRiders.map((entry, index) => {
    if (index > 0) {
      const prev = completedRiders[index - 1]
      const ct = entry.class_totals?.[cls.id]
      const pt = prev.class_totals?.[cls.id]
      if ((ct?.total ?? 0) !== (pt?.total ?? 0) || (ct?.last_scored_at || '') !== (pt?.last_scored_at || '')) {
        currentRank = index + 1
      }
    }
    return { ...entry, rank: currentRank, completed: true }
  })

  const rankedIncomplete = incompleteRiders.map(entry => ({ ...entry, rank: 0, completed: false }))
  return [...rankedCompleted, ...rankedIncomplete]
}

function StandingsTable({ title, color, entries, sections, laps, scores }: {
  title: string
  color: string
  entries: (LeaderboardEntry & { rank: number; completed: boolean })[]
  sections: Section[]
  laps: number
  scores: Score[]
}) {
  if (entries.length === 0) {
    return (
      <div>
        <h3 className="text-2xl font-display font-bold mb-2" style={{ color }}>{title}</h3>
        <p className="text-gray-500 text-sm">No competitors</p>
      </div>
    )
  }

  const hasCompleted = entries.some(e => e.completed)
  const hasIncomplete = entries.some(e => !e.completed)

  const columns: { sec: Section; lap: number; label: string }[] = []
  for (let lap = 1; lap <= laps; lap++) {
    sections.forEach((sec, i) => {
      columns.push({ sec, lap, label: `S${i + 1}L${lap}` })
    })
  }

  function getScore(riderId: number, sectionId: number, lap: number): number {
    const score = scores.find(s => s.competitor_id === riderId && s.section_id === sectionId && s.lap === lap)
    if (!score || score.points === null) return 20
    return score.points
  }

  return (
    <div>
      <h3 className="text-2xl font-display font-bold mb-3" style={{ color }}>{title}</h3>
      <div className="bg-trials-darker rounded-lg overflow-x-auto">
        <table className="w-max min-w-full">
          <thead>
            <tr className="border-b border-gray-700 text-xs text-gray-400">
              <th className="px-2 py-2 text-left sticky left-0 bg-trials-darker z-10 w-10">#</th>
              <th className="px-2 py-2 text-left sticky left-10 bg-trials-darker z-10 w-12">No.</th>
              <th className="px-2 py-2 text-left sticky left-[5.5rem] bg-trials-darker z-10 min-w-[80px]">Name</th>
              {columns.map((col, i) => (
                <th key={i} className={`px-1 py-2 text-center w-10 ${i > 0 && col.lap !== columns[i - 1].lap ? 'border-l border-gray-700' : ''}`}>{col.label}</th>
              ))}
              <th className="px-2 py-2 text-center w-14 border-l border-gray-700 font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.map((entry, idx) => {
              const showSeparator = hasCompleted && hasIncomplete && !entry.completed && (idx === 0 || entries[idx - 1].completed)
              let total = 0
              const cellValues = columns.map(col => { const pts = getScore(entry.id, col.sec.id, col.lap); total += pts; return pts })

              return (
                <tr key={entry.id} className={`${!entry.completed ? 'opacity-60' : ''} ${showSeparator ? 'border-t-2 border-dashed border-gray-600' : ''}`}>
                  <td className={`px-2 py-2 font-display font-bold text-sm sticky left-0 bg-trials-darker z-10 ${!entry.completed ? 'text-gray-600' : entry.rank === 1 ? 'text-yellow-400' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {entry.completed ? entry.rank : '-'}
                  </td>
                  <td className="px-2 py-2 font-display font-bold text-trials-orange text-sm sticky left-10 bg-trials-darker z-10">#{entry.number}</td>
                  <td className="px-2 py-2 text-sm truncate max-w-[100px] sticky left-[5.5rem] bg-trials-darker z-10">{entry.name}</td>
                  {cellValues.map((pts, i) => (
                    <td key={i} className={`px-1 py-2 text-center text-xs font-mono font-bold ${getScoreCellColor(pts)} ${i > 0 && columns[i].lap !== columns[i - 1].lap ? 'border-l border-gray-700' : ''}`}>{pts}</td>
                  ))}
                  <td className={`px-2 py-2 text-center font-display font-bold text-sm border-l border-gray-700 ${total === 0 && entry.completed ? 'text-trials-success' : ''}`}>{total}</td>
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
  const [showTimeline, setShowTimeline] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [scoresData, secs, lb, sett] = await Promise.all([getScores(), getSections(), getLeaderboard(), getSettings()])
      setScores(scoresData); setSections(secs); setLeaderboard(lb); setSettings(sett)
    } catch (err) { console.error('Failed to load data', err) }
    finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-trials-orange text-xl font-display animate-pulse">Loading...</div>
      </div>
    )
  }

  if (showTimeline) return <Timeline onBack={() => setShowTimeline(false)} />

  const classes = settings?.classes || []

  return (
    <div className="min-h-screen bg-trials-darker text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-trials-orange mb-2">
            {settings?.event_name || 'Trial Score'}
          </h1>
          <p className="text-lg text-gray-400">Final Standings</p>
          {settings?.event_date && <p className="text-sm text-gray-500 mt-1">{settings.event_date}</p>}
          <button onClick={() => setShowTimeline(true)}
            className="mt-4 px-6 py-2 bg-trials-orange text-black font-display font-bold rounded-lg hover:bg-trials-orange/90 transition-colors inline-flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Event Timeline
          </button>
        </div>

        <div className="space-y-10">
          {classes.map(cls => {
            const classSections = sections.filter(s => cls.section_ids.includes(s.id))
            return (
              <StandingsTable
                key={cls.id}
                title={cls.name}
                color={cls.color}
                entries={getRankedByClass(cls, leaderboard)}
                sections={classSections}
                laps={cls.laps}
                scores={scores}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
