import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getScores,
  getSections,
  getCompetitors,
  type Score,
  type Section,
  type Competitor
} from '../api'

// Normalized coordinates for each section on the map image
const SECTION_COORDS: Record<string, { x: number; y: number }> = {
  'Section 1': { x: 0.595, y: 0.388 },
  'Section 2': { x: 0.438, y: 0.155 },
  'Section 3': { x: 0.291, y: 0.107 },
  'Section 4': { x: 0.303, y: 0.581 },
  'Section 5': { x: 0.184, y: 0.873 },
  'Section 6': { x: 0.472, y: 0.802 },
  'Kids 1':    { x: 0.224, y: 0.208 },
  'Kids 2':    { x: 0.231, y: 0.352 },
  'Kids 3':    { x: 0.113, y: 0.359 },
  'Enduro 1':  { x: 0.416, y: 0.415 },
  'Enduro 2':  { x: 0.317, y: 0.413 },
}

const CLASS_COLORS: Record<string, string> = {
  kids: '#facc15',
  clubman: '#10b981',
  advanced: '#ef4444',
  'enduro-trial': '#9ca3af',
}

// Neutral position (bottom-right corner, normalized) — used only before first score
const NEUTRAL_POS = { x: 0.88, y: 0.92 }

// Animation timing (in event-time milliseconds)
const APPROACH_DURATION = 60 * 1000   // 1 minute before score: start moving
const POPUP_DURATION = 36 * 1000      // 36 event-sec (~3 real sec at 1x): show score bubble

// Playback
const TICK_INTERVAL = 50 // ms real time between updates
const SPEED_OPTIONS = [
  { label: '1x', multiplier: 12 * 1000 },        // 12 event-sec per real sec
  { label: '2x', multiplier: 24 * 1000 },        // 24 event-sec per real sec
  { label: '4x', multiplier: 48 * 1000 },        // 48 event-sec per real sec
]

interface ScoreEvent {
  time: number
  score: Score
  sectionName: string
  competitorId: number
}

// For a given competitor at a given time, determine position & popup state.
// Riders stay at their last scored section (never return to neutral).
function getCompetitorAnimState(
  compId: number,
  currentTime: number,
  events: ScoreEvent[]
): { x: number; y: number; showPopup: boolean; popupScore: Score | null; isActive: boolean } {
  const compEvents = events.filter(e => e.competitorId === compId)

  // Small per-competitor offset at neutral only
  const offset = ((compId * 7) % 20 - 10) * 0.006
  const neutralX = NEUTRAL_POS.x + offset
  const neutralY = NEUTRAL_POS.y + offset * 0.3

  if (compEvents.length === 0) {
    return { x: neutralX, y: neutralY, showPopup: false, popupScore: null, isActive: false }
  }

  // Before first event's approach → at neutral
  const firstApproachStart = compEvents[0].time - APPROACH_DURATION
  if (currentTime < firstApproachStart) {
    return { x: neutralX, y: neutralY, showPopup: false, popupScore: null, isActive: false }
  }

  for (let i = 0; i < compEvents.length; i++) {
    const evt = compEvents[i]
    const prevEvt = i > 0 ? compEvents[i - 1] : null
    const nextEvt = i + 1 < compEvents.length ? compEvents[i + 1] : null

    const sectionCoords = SECTION_COORDS[evt.sectionName]
    if (!sectionCoords) continue

    // Where does approach start & from where?
    let approachStart = evt.time - APPROACH_DURATION
    let startX = neutralX
    let startY = neutralY

    if (prevEvt) {
      const prevCoords = SECTION_COORDS[prevEvt.sectionName]
      const prevPopupEnd = prevEvt.time + POPUP_DURATION
      if (prevCoords) {
        startX = prevCoords.x
        startY = prevCoords.y
        // Approach starts either naturally, or right after prev popup (whichever is later)
        approachStart = Math.max(prevPopupEnd, approachStart)
      }
    }

    const popupEnd = evt.time + POPUP_DURATION

    // Determine when idle at this section ends (= next event's approach start)
    let idleEnd = Infinity
    if (nextEvt) {
      const nextNaturalApproach = nextEvt.time - APPROACH_DURATION
      idleEnd = Math.max(popupEnd, nextNaturalApproach)
    }

    if (currentTime >= approachStart && currentTime < evt.time) {
      // Approaching this section
      const duration = evt.time - approachStart
      const progress = Math.min(1, Math.max(0, (currentTime - approachStart) / duration))
      const eased = easeInOutCubic(progress)
      return {
        x: startX + (sectionCoords.x - startX) * eased,
        y: startY + (sectionCoords.y - startY) * eased,
        showPopup: false, popupScore: null, isActive: true
      }
    } else if (currentTime >= evt.time && currentTime < popupEnd) {
      // At section, showing score popup
      return {
        x: sectionCoords.x, y: sectionCoords.y,
        showPopup: true, popupScore: evt.score, isActive: true
      }
    } else if (currentTime >= popupEnd && currentTime < idleEnd) {
      // Idle at this section, waiting for next
      return {
        x: sectionCoords.x, y: sectionCoords.y,
        showPopup: false, popupScore: null, isActive: false
      }
    }
  }

  // Past all events: stay at last scored section
  const lastEvt = compEvents[compEvents.length - 1]
  const lastCoords = SECTION_COORDS[lastEvt.sectionName]
  if (lastCoords) {
    return { x: lastCoords.x, y: lastCoords.y, showPopup: false, popupScore: null, isActive: false }
  }

  return { x: neutralX, y: neutralY, showPopup: false, popupScore: null, isActive: false }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Natural aspect ratio of back.JPEG (will be measured on load)
const DEFAULT_ASPECT = 16 / 9

export default function Timeline({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [allCompetitors, setAllCompetitors] = useState<Competitor[]>([])
  const [, setSections] = useState<Section[]>([])
  const [events, setEvents] = useState<ScoreEvent[]>([])
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 })
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [imageAspect, setImageAspect] = useState(DEFAULT_ASPECT)
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null)

  // Map container ref for computing image rect
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageRect, setImageRect] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const playRef = useRef(false)
  const currentTimeRef = useRef(0)
  const speedIdxRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsRef = useRef<ScoreEvent[]>([])
  const selectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs in sync
  useEffect(() => { speedIdxRef.current = speedIdx }, [speedIdx])
  useEffect(() => { eventsRef.current = events }, [events])

  // Compute the image's displayed rect within the container (object-contain logic)
  const computeImageRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const containerAspect = cw / ch

    let imgW: number, imgH: number, imgLeft: number, imgTop: number

    if (containerAspect > imageAspect) {
      // Container is wider than image: image height fills, width has black bars
      imgH = ch
      imgW = ch * imageAspect
      imgLeft = (cw - imgW) / 2
      imgTop = 0
    } else {
      // Container is taller than image: image width fills, height has black bars
      imgW = cw
      imgH = cw / imageAspect
      imgLeft = 0
      imgTop = (ch - imgH) / 2
    }

    setImageRect({ left: imgLeft, top: imgTop, width: imgW, height: imgH })
  }, [imageAspect])

  useEffect(() => {
    computeImageRect()
    window.addEventListener('resize', computeImageRect)
    return () => window.removeEventListener('resize', computeImageRect)
  }, [computeImageRect])

  // Load image to get natural aspect ratio
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageAspect(img.naturalWidth / img.naturalHeight)
    }
    img.src = '/back.JPEG'
  }, [])

  useEffect(() => {
    loadData()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current)
    }
  }, [])

  async function loadData() {
    try {
      const [scoresData, secs, comps] = await Promise.all([
        getScores(),
        getSections(),
        getCompetitors()
      ])

      setAllCompetitors(comps)
      setSections(secs)

      const sectionMap = new Map<number, Section>()
      secs.forEach(s => sectionMap.set(s.id, s))

      const scoreEvents: ScoreEvent[] = scoresData
        .map(score => {
          const section = sectionMap.get(score.section_id)
          return {
            time: new Date(score.created_at).getTime(),
            score,
            sectionName: section?.name || '',
            competitorId: score.competitor_id
          }
        })
        .filter(e => e.sectionName && SECTION_COORDS[e.sectionName])
        .sort((a, b) => a.time - b.time)

      setEvents(scoreEvents)
      eventsRef.current = scoreEvents

      if (scoreEvents.length > 0) {
        const start = scoreEvents[0].time - APPROACH_DURATION - 10000
        const end = scoreEvents[scoreEvents.length - 1].time + POPUP_DURATION + 10000
        setTimeRange({ start, end })
        setCurrentTime(start)
        currentTimeRef.current = start
      }
    } catch (err) {
      console.error('Failed to load timeline data', err)
    } finally {
      setLoading(false)
    }
  }

  function handlePlay() {
    if (playing) {
      setPlaying(false)
      playRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    } else {
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

        const speed = SPEED_OPTIONS[speedIdxRef.current].multiplier
        const nextTime = currentTimeRef.current + (speed * TICK_INTERVAL / 1000)

        if (nextTime >= timeRange.end) {
          currentTimeRef.current = timeRange.end
          setCurrentTime(timeRange.end)
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
      }, TICK_INTERVAL)
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const time = Number(e.target.value)
    currentTimeRef.current = time
    setCurrentTime(time)
  }

  function formatTime(ms: number): string {
    if (!ms) return '--:--'
    const d = new Date(ms)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Convert normalized coords to pixel position within container
  function toPixel(nx: number, ny: number): { left: number; top: number } {
    return {
      left: imageRect.left + nx * imageRect.width,
      top: imageRect.top + ny * imageRect.height
    }
  }

  function handleAvatarTap(compId: number) {
    if (selectedTimerRef.current) clearTimeout(selectedTimerRef.current)
    setSelectedCompId(prev => prev === compId ? null : compId)
    selectedTimerRef.current = setTimeout(() => setSelectedCompId(null), 10000)
  }

  // Get scores for selected competitor up to current time
  const selectedComp = selectedCompId != null ? allCompetitors.find(c => c.id === selectedCompId) : null
  const selectedScores = selectedCompId != null
    ? events
        .filter(e => e.competitorId === selectedCompId && e.time <= currentTime)
        .map(e => ({ section: e.sectionName, score: e.score }))
    : []

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
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 z-30 shrink-0">
        <button
          onClick={onBack}
          className="text-white hover:text-trials-orange transition-colors font-display font-bold text-sm"
        >
          &larr; Back
        </button>
        <div className="text-gray-400 text-sm">
          {formatTime(currentTime)} &middot; {eventsHappened}/{events.length} scores
        </div>
      </div>

      {/* Map area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-black">
        {/* Background image - object-contain so full image always visible */}
        <img
          src="/back.JPEG"
          alt="Event map"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
        {/* Slight overlay */}
        <div
          className="absolute bg-black/15 pointer-events-none"
          style={{
            left: imageRect.left,
            top: imageRect.top,
            width: imageRect.width,
            height: imageRect.height
          }}
        />

        {/* Section labels are already on the background image */}

        {/* Competitor avatars */}
        {allCompetitors.map(comp => {
          const animState = getCompetitorAnimState(comp.id, currentTime, events)
          const { x, y, showPopup, popupScore, isActive } = animState
          const borderColor = CLASS_COLORS[comp.primary_class] || '#9ca3af'
          const pos = toPixel(x, y)
          const isSelected = selectedCompId === comp.id
          // Active (moving/popup) riders on top, then selected, then idle
          const zClass = showPopup ? 'z-[25]' : isActive ? 'z-[24]' : isSelected ? 'z-[23]' : 'z-20'

          return (
            <div
              key={comp.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${zClass}`}
              style={{ left: pos.left, top: pos.top }}
            >
              {/* Score popup */}
              {showPopup && popupScore && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap animate-fade-in z-[35]">
                  <div className={`px-3 py-1 rounded-lg text-sm font-bold shadow-lg ${
                    popupScore.is_dnf ? 'bg-gray-600 text-white' :
                    popupScore.points === 0 ? 'bg-green-500 text-white' :
                    popupScore.points === 5 ? 'bg-red-500 text-white' :
                    popupScore.points === 20 ? 'bg-gray-600 text-white' :
                    'bg-trials-orange text-black'
                  }`}>
                    {popupScore.is_dnf ? 'DNS' : popupScore.points}
                  </div>
                </div>
              )}

              {/* Avatar */}
              <div
                className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full border-[3px] overflow-hidden shadow-lg bg-gray-800 cursor-pointer ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''}`}
                style={{ borderColor }}
                onClick={() => handleAvatarTap(comp.id)}
              >
                {comp.photo_url ? (
                  <img
                    src={comp.photo_url}
                    alt={comp.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base font-bold text-white">
                    {comp.number}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected competitor score card */}
      {selectedComp && selectedScores.length > 0 && (
        <div className="bg-black/85 px-3 py-2 z-30 shrink-0 border-t border-gray-700 animate-fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-xs">#{selectedComp.number} {selectedComp.name}</span>
              <button onClick={() => setSelectedCompId(null)} className="text-gray-500 hover:text-white text-xs ml-auto">&times;</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedScores.map((s, i) => {
                const label = s.section.replace('Section ', 'S').replace('Kids ', 'K').replace('Enduro ', 'E')
                return (
                  <div key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    s.score.is_dnf ? 'bg-gray-600 text-white' :
                    s.score.points === 0 ? 'bg-green-600 text-white' :
                    s.score.points === 5 ? 'bg-red-500 text-white' :
                    'bg-trials-orange/90 text-black'
                  }`}>
                    {label}: {s.score.is_dnf ? 'DNS' : s.score.points}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="bg-black/90 px-4 py-3 z-30 shrink-0">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          {/* Play/Pause button */}
          <button
            onClick={handlePlay}
            className="w-11 h-11 rounded-full bg-trials-orange text-black flex items-center justify-center hover:bg-trials-orange/90 transition-colors shrink-0"
          >
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {/* Speed selector */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
            {SPEED_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setSpeedIdx(i)}
                className={`px-2 py-1 text-xs font-bold transition-colors ${
                  speedIdx === i
                    ? 'bg-trials-orange text-black'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Timeline slider */}
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <input
              type="range"
              min={timeRange.start}
              max={timeRange.end}
              value={currentTime}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-trials-orange"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>{formatTime(timeRange.start)}</span>
              <span className="text-trials-orange font-bold text-xs">{formatTime(currentTime)}</span>
              <span>{formatTime(timeRange.end)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
