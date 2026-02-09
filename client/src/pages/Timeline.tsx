import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getScores,
  getSections,
  getCompetitors,
  type Score,
  type Section,
  type Competitor
} from '../api'

// Normalized coordinates for each section on the map
const SECTION_COORDS: Record<string, { x: number; y: number }> = {
  'Section 1': { x: 0.618, y: 0.365 },
  'Section 2': { x: 0.505, y: 0.218 },
  'Section 3': { x: 0.413, y: 0.188 },
  'Section 4': { x: 0.458, y: 0.777 },
  'Section 5': { x: 0.163, y: 0.859 },
  'Section 6': { x: 0.514, y: 0.846 },
  'Kids 1':    { x: 0.309, y: 0.252 },
  'Kids 2':    { x: 0.305, y: 0.358 },
  'Kids 3':    { x: 0.163, y: 0.356 },
  'Enduro 1':  { x: 0.469, y: 0.399 },
  'Enduro 2':  { x: 0.410, y: 0.444 },
}

// Short labels for map markers
const SECTION_LABELS: Record<string, string> = {
  'Section 1': '1', 'Section 2': '2', 'Section 3': '3',
  'Section 4': '4', 'Section 5': '5', 'Section 6': '6',
  'Kids 1': 'K1', 'Kids 2': 'K2', 'Kids 3': 'K3',
  'Enduro 1': 'E1', 'Enduro 2': 'E2',
}

const CLASS_COLORS: Record<string, string> = {
  kids: '#facc15',
  clubman: '#10b981',
  advanced: '#ef4444',
  'enduro-trial': '#9ca3af',
}

// Start position for competitors before any scores
const START_POS = { x: 0.5, y: 0.95 }

// Playback: 1 real second = this many ms of event time
const PLAYBACK_SPEED = 5 * 60 * 1000 // 5 minutes per second
const TICK_INTERVAL = 50 // ms between updates

interface ScoreEvent {
  time: number
  score: Score
  sectionName: string
}

interface CompetitorState {
  competitor: Competitor
  x: number
  y: number
  lastScore: Score | null
  showPopup: boolean
}

export default function Timeline({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [, setCompetitors] = useState<Competitor[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [events, setEvents] = useState<ScoreEvent[]>([])
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 })
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [competitorStates, setCompetitorStates] = useState<Map<number, CompetitorState>>(new Map())
  
  const playRef = useRef(false)
  const currentTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const popupTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    loadData()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      popupTimersRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  async function loadData() {
    try {
      const [scoresData, secs, comps] = await Promise.all([
        getScores(),
        getSections(),
        getCompetitors()
      ])
      
      setCompetitors(comps)
      setSections(secs)

      // Build section name lookup
      const sectionMap = new Map<number, Section>()
      secs.forEach(s => sectionMap.set(s.id, s))

      // Build chronological events
      const scoreEvents: ScoreEvent[] = scoresData
        .map(score => {
          const section = sectionMap.get(score.section_id)
          return {
            time: new Date(score.created_at).getTime(),
            score,
            sectionName: section?.name || ''
          }
        })
        .filter(e => e.sectionName && SECTION_COORDS[e.sectionName])
        .sort((a, b) => a.time - b.time)

      setEvents(scoreEvents)

      if (scoreEvents.length > 0) {
        const start = scoreEvents[0].time - 60000 // 1 min before first score
        const end = scoreEvents[scoreEvents.length - 1].time + 60000
        setTimeRange({ start, end })
        setCurrentTime(start)
        currentTimeRef.current = start

        // Initialize competitor states at start position
        const states = new Map<number, CompetitorState>()
        comps.forEach(c => {
          states.set(c.id, {
            competitor: c,
            x: START_POS.x,
            y: START_POS.y,
            lastScore: null,
            showPopup: false
          })
        })
        setCompetitorStates(states)
      }
    } catch (err) {
      console.error('Failed to load timeline data', err)
    } finally {
      setLoading(false)
    }
  }

  const updateStates = useCallback((time: number) => {
    setCompetitorStates(prev => {
      const next = new Map(prev)
      
      // For each competitor, find their latest score at or before `time`
      const competitorLatest = new Map<number, ScoreEvent>()
      for (const evt of events) {
        if (evt.time > time) break
        competitorLatest.set(evt.score.competitor_id, evt)
      }

      // Check for newly triggered events (scores that just became active)
      const prevTime = currentTimeRef.current

      next.forEach((state, compId) => {
        const latest = competitorLatest.get(compId)
        if (latest) {
          const coords = SECTION_COORDS[latest.sectionName]
          if (coords) {
            // Add small offset based on competitor id to avoid stacking
            const offset = ((compId * 7) % 20 - 10) * 0.008
            next.set(compId, {
              ...state,
              x: coords.x + offset,
              y: coords.y + offset * 0.5,
              lastScore: latest.score,
              showPopup: state.showPopup
            })
          }
        } else {
          next.set(compId, {
            ...state,
            x: START_POS.x + ((compId * 7) % 20 - 10) * 0.008,
            y: START_POS.y,
            lastScore: null,
            showPopup: false
          })
        }
      })

      // Trigger popups for events crossing the time boundary
      for (const evt of events) {
        if (evt.time > prevTime && evt.time <= time) {
          const compId = evt.score.competitor_id
          const state = next.get(compId)
          if (state) {
            next.set(compId, { ...state, showPopup: true })
            // Clear previous popup timer
            const existingTimer = popupTimersRef.current.get(compId)
            if (existingTimer) clearTimeout(existingTimer)
            // Auto-hide popup after 2 seconds
            const timer = setTimeout(() => {
              setCompetitorStates(p => {
                const updated = new Map(p)
                const s = updated.get(compId)
                if (s) updated.set(compId, { ...s, showPopup: false })
                return updated
              })
            }, 2000)
            popupTimersRef.current.set(compId, timer)
          }
        }
      }

      return next
    })
  }, [events])

  function handlePlay() {
    if (playing) {
      // Pause
      setPlaying(false)
      playRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    } else {
      // If at end, restart
      let startFrom = currentTimeRef.current
      if (startFrom >= timeRange.end) {
        startFrom = timeRange.start
        setCurrentTime(timeRange.start)
        currentTimeRef.current = timeRange.start
      }
      
      setPlaying(true)
      playRef.current = true
      
      timerRef.current = setInterval(() => {
        if (!playRef.current) return
        
        const nextTime = currentTimeRef.current + (PLAYBACK_SPEED * TICK_INTERVAL / 1000)
        if (nextTime >= timeRange.end) {
          currentTimeRef.current = timeRange.end
          setCurrentTime(timeRange.end)
          updateStates(timeRange.end)
          setPlaying(false)
          playRef.current = false
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          return
        }
        
        currentTimeRef.current = nextTime
        setCurrentTime(nextTime)
        updateStates(nextTime)
      }, TICK_INTERVAL)
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const time = Number(e.target.value)
    currentTimeRef.current = time
    setCurrentTime(time)
    updateStates(time)
    // Clear all popups on manual scrub
    popupTimersRef.current.forEach(t => clearTimeout(t))
    popupTimersRef.current.clear()
  }

  function formatTime(ms: number): string {
    const d = new Date(ms)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Count events that have happened
  const eventsHappened = events.filter(e => e.time <= currentTime).length

  if (loading) {
    return (
      <div className="fixed inset-0 bg-trials-darker flex items-center justify-center z-50">
        <div className="text-trials-orange text-xl font-display animate-pulse">Loading Timeline...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 z-20">
        <button
          onClick={onBack}
          className="text-white hover:text-trials-orange transition-colors font-display font-bold text-sm"
        >
          &larr; Back to Standings
        </button>
        <div className="text-gray-400 text-sm">
          {formatTime(currentTime)} &middot; {eventsHappened}/{events.length} scores
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Background image */}
        <img
          src="/back.JPEG"
          alt="Event map"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/20" />

        {/* Section markers */}
        {sections.map(sec => {
          const coords = SECTION_COORDS[sec.name]
          if (!coords) return null
          const label = SECTION_LABELS[sec.name] || sec.name
          return (
            <div
              key={sec.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ left: `${coords.x * 100}%`, top: `${coords.y * 100}%` }}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 ${
                sec.type === 'kids' ? 'bg-yellow-400/90 border-yellow-300 text-black' :
                sec.type === 'enduro' ? 'bg-gray-600/90 border-gray-400 text-white' :
                'bg-white/90 border-white text-black'
              }`}>
                {label}
              </div>
            </div>
          )
        })}

        {/* Competitor avatars */}
        {Array.from(competitorStates.values()).map(state => {
          const { competitor, x, y, lastScore, showPopup } = state
          const borderColor = CLASS_COLORS[competitor.primary_class] || '#9ca3af'
          const points = lastScore?.points
          const isDns = lastScore?.is_dnf
          
          return (
            <div
              key={competitor.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                transition: 'left 1s ease-in-out, top 1s ease-in-out'
              }}
            >
              {/* Score popup */}
              {showPopup && lastScore && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap animate-fade-in">
                  <div className={`px-2 py-0.5 rounded text-xs font-bold shadow-lg ${
                    isDns ? 'bg-gray-600 text-white' :
                    points === 0 ? 'bg-green-500 text-white' :
                    points === 5 ? 'bg-red-500 text-white' :
                    'bg-trials-orange text-black'
                  }`}>
                    #{competitor.number}: {isDns ? 'DNS' : points}
                  </div>
                </div>
              )}
              
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full border-[3px] overflow-hidden shadow-lg bg-gray-800"
                style={{ borderColor }}
              >
                {competitor.photo_url ? (
                  <img
                    src={competitor.photo_url}
                    alt={competitor.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                    {competitor.number}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Controls bar */}
      <div className="bg-black/90 px-4 py-3 z-20">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          {/* Play/Pause button */}
          <button
            onClick={handlePlay}
            className="w-12 h-12 rounded-full bg-trials-orange text-black flex items-center justify-center hover:bg-trials-orange/90 transition-colors shrink-0"
          >
            {playing ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {/* Timeline slider */}
          <div className="flex-1 flex flex-col gap-1">
            <input
              type="range"
              min={timeRange.start}
              max={timeRange.end}
              value={currentTime}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-trials-orange"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{formatTime(timeRange.start)}</span>
              <span>{formatTime(timeRange.end)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
