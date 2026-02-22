import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getScores,
  getSections,
  getCompetitors,
  getSettings,
  type Score,
  type Section,
  type Competitor,
  type Settings
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

const APPROACH_DURATION = 60 * 1000
const POPUP_DURATION = 36 * 1000
const TICK_INTERVAL = 50
const SPEED_OPTIONS = [
  { label: '1x', multiplier: 12 * 1000 },
  { label: '2x', multiplier: 24 * 1000 },
  { label: '4x', multiplier: 48 * 1000 },
]

interface ScoreEvent {
  time: number
  score: Score
  sectionName: string
  competitorId: number
}

function getCompetitorAnimState(
  compId: number,
  currentTime: number,
  events: ScoreEvent[]
): { x: number; y: number; showPopup: boolean; popupScore: Score | null; visible: boolean; opacity: number } {
  const compEvents = events.filter(e => e.competitorId === compId)
  const hidden = { x: 0, y: 0, showPopup: false, popupScore: null, visible: false, opacity: 0 }
  if (compEvents.length === 0) return hidden

  const firstApproachStart = compEvents[0].time - APPROACH_DURATION
  if (currentTime < firstApproachStart) return hidden

  for (let i = 0; i < compEvents.length; i++) {
    const evt = compEvents[i]
    const prevEvt = i > 0 ? compEvents[i - 1] : null
    const nextEvt = i + 1 < compEvents.length ? compEvents[i + 1] : null
    const sectionCoords = SECTION_COORDS[evt.sectionName]
    if (!sectionCoords) continue

    const isFirst = !prevEvt
    let approachStart = evt.time - APPROACH_DURATION
    let startX = sectionCoords.x
    let startY = sectionCoords.y

    if (prevEvt) {
      const prevCoords = SECTION_COORDS[prevEvt.sectionName]
      const prevPopupEnd = prevEvt.time + POPUP_DURATION
      if (prevCoords) {
        startX = prevCoords.x
        startY = prevCoords.y
        approachStart = Math.max(prevPopupEnd, approachStart)
      }
    }

    const popupEnd = evt.time + POPUP_DURATION
    let idleEnd = Infinity
    if (nextEvt) {
      const nextNaturalApproach = nextEvt.time - APPROACH_DURATION
      idleEnd = Math.max(popupEnd, nextNaturalApproach)
    }

    if (currentTime >= approachStart && currentTime < evt.time) {
      if (isFirst) {
        const progress = Math.min(1, Math.max(0, (currentTime - approachStart) / APPROACH_DURATION))
        return { x: sectionCoords.x, y: sectionCoords.y, showPopup: false, popupScore: null, visible: true, opacity: progress }
      } else {
        const duration = evt.time - approachStart
        const progress = Math.min(1, Math.max(0, (currentTime - approachStart) / duration))
        const eased = easeInOutCubic(progress)
        return {
          x: startX + (sectionCoords.x - startX) * eased,
          y: startY + (sectionCoords.y - startY) * eased,
          showPopup: false, popupScore: null, visible: true, opacity: 1
        }
      }
    } else if (currentTime >= evt.time && currentTime < popupEnd) {
      return { x: sectionCoords.x, y: sectionCoords.y, showPopup: true, popupScore: evt.score, visible: true, opacity: 1 }
    } else if (currentTime >= popupEnd && currentTime < idleEnd) {
      return { x: sectionCoords.x, y: sectionCoords.y, showPopup: false, popupScore: null, visible: true, opacity: 1 }
    }
  }

  const lastEvt = compEvents[compEvents.length - 1]
  const lastCoords = SECTION_COORDS[lastEvt.sectionName]
  if (lastCoords) return { x: lastCoords.x, y: lastCoords.y, showPopup: false, popupScore: null, visible: true, opacity: 1 }
  return hidden
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const DEFAULT_ASPECT = 16 / 9

export default function Timeline({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [allCompetitors, setAllCompetitors] = useState<Competitor[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [events, setEvents] = useState<ScoreEvent[]>([])
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 })
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [imageAspect, setImageAspect] = useState(DEFAULT_ASPECT)
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null)
  const [visibleClasses, setVisibleClasses] = useState<Set<string>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const [imageRect, setImageRect] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const playRef = useRef(false)
  const currentTimeRef = useRef(0)
  const speedIdxRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsRef = useRef<ScoreEvent[]>([])

  useEffect(() => { speedIdxRef.current = speedIdx }, [speedIdx])
  useEffect(() => { eventsRef.current = events }, [events])

  const computeImageRect = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const containerAspect = cw / ch
    let imgW: number, imgH: number, imgLeft: number, imgTop: number
    if (containerAspect > imageAspect) {
      imgH = ch; imgW = ch * imageAspect; imgLeft = (cw - imgW) / 2; imgTop = 0
    } else {
      imgW = cw; imgH = cw / imageAspect; imgLeft = 0; imgTop = (ch - imgH) / 2
    }
    setImageRect({ left: imgLeft, top: imgTop, width: imgW, height: imgH })
  }, [imageAspect])

  useEffect(() => {
    computeImageRect()
    window.addEventListener('resize', computeImageRect)
    return () => window.removeEventListener('resize', computeImageRect)
  }, [computeImageRect])

  useEffect(() => {
    const img = new Image()
    img.onload = () => setImageAspect(img.naturalWidth / img.naturalHeight)
    img.src = '/back.JPEG'
  }, [])

  useEffect(() => {
    loadData()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function loadData() {
    try {
      const [scoresData, secs, comps, sett] = await Promise.all([getScores(), getSections(), getCompetitors(), getSettings()])
      setAllCompetitors(comps)
      setSettings(sett)

      // Initialize visible classes from settings
      if (sett?.classes) setVisibleClasses(new Set(sett.classes.map(c => c.id)))

      const sectionMap = new Map<number, Section>()
      secs.forEach(s => sectionMap.set(s.id, s))

      const scoreEvents: ScoreEvent[] = scoresData
        .map(score => {
          const section = sectionMap.get(score.section_id)
          return { time: new Date(score.created_at).getTime(), score, sectionName: section?.name || '', competitorId: score.competitor_id }
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
    } catch (err) { console.error('Failed to load timeline data', err) }
    finally { setLoading(false) }
  }

  function handlePlay() {
    if (playing) {
      setPlaying(false); playRef.current = false
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    } else {
      let startFrom = currentTimeRef.current
      if (startFrom >= timeRange.end) {
        startFrom = timeRange.start; setCurrentTime(timeRange.start); currentTimeRef.current = timeRange.start
      }
      setPlaying(true); playRef.current = true
      timerRef.current = setInterval(() => {
        if (!playRef.current) return
        const speed = SPEED_OPTIONS[speedIdxRef.current].multiplier
        const nextTime = currentTimeRef.current + (speed * TICK_INTERVAL / 1000)
        if (nextTime >= timeRange.end) {
          currentTimeRef.current = timeRange.end; setCurrentTime(timeRange.end); setPlaying(false); playRef.current = false
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          return
        }
        currentTimeRef.current = nextTime; setCurrentTime(nextTime)
      }, TICK_INTERVAL)
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const time = Number(e.target.value); currentTimeRef.current = time; setCurrentTime(time)
  }

  function formatTime(ms: number): string {
    if (!ms) return '--:--'
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function toPixel(nx: number, ny: number): { left: number; top: number } {
    return { left: imageRect.left + nx * imageRect.width, top: imageRect.top + ny * imageRect.height }
  }

  function handleAvatarTap(compId: number, e: React.MouseEvent) {
    e.stopPropagation(); setSelectedCompId(prev => prev === compId ? null : compId)
  }

  function handleMapClick() { if (selectedCompId != null) setSelectedCompId(null) }

  function toggleClass(clsId: string) {
    setVisibleClasses(prev => { const next = new Set(prev); if (next.has(clsId)) next.delete(clsId); else next.add(clsId); return next })
  }

  const classes = settings?.classes || []

  // Get border color for a competitor from their first matching visible class
  function getCompBorderColor(comp: Competitor): string {
    for (const cls of classes) {
      if ((comp.classes || []).includes(cls.id)) return cls.color
    }
    return '#9ca3af'
  }

  // Filter competitors: show if any of their classes are visible
  const filteredCompetitors = allCompetitors.filter(c =>
    (c.classes || []).some(clsId => visibleClasses.has(clsId))
  )

  const selectedComp = selectedCompId != null ? allCompetitors.find(c => c.id === selectedCompId) : null
  const selectedScores = selectedCompId != null
    ? events.filter(e => e.competitorId === selectedCompId && e.time <= currentTime).map(e => ({ section: e.sectionName, score: e.score }))
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
        <button onClick={onBack} className="text-white hover:text-trials-orange transition-colors font-display font-bold text-sm">&larr; Back</button>
        <div className="flex gap-1">
          {classes.map(cls => {
            const active = visibleClasses.has(cls.id)
            return (
              <button key={cls.id} onClick={() => toggleClass(cls.id)}
                className="w-7 h-7 rounded-full text-[10px] font-bold border-2 transition-all"
                style={{ borderColor: cls.color, backgroundColor: active ? cls.color : 'transparent', color: active ? '#000' : cls.color, opacity: active ? 1 : 0.4 }}>
                {cls.name.charAt(0).toUpperCase()}
              </button>
            )
          })}
        </div>
        <div className="text-gray-400 text-sm">{eventsHappened}/{events.length}</div>
      </div>

      {/* Map area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-black" onClick={handleMapClick}>
        <img src="/back.JPEG" alt="Event map" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
        <div className="absolute bg-black/15 pointer-events-none" style={{ left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height }} />

        {/* Competitor avatars */}
        {(() => {
          const arrivalMap = new Map<number, number>()
          for (const comp of filteredCompetitors) {
            const compEvts = events.filter(e => e.competitorId === comp.id && e.time <= currentTime)
            if (compEvts.length > 0) arrivalMap.set(comp.id, compEvts[compEvts.length - 1].time)
          }
          const arrivals = [...arrivalMap.entries()].sort((a, b) => a[1] - b[1])
          const zMap = new Map<number, number>()
          arrivals.forEach(([id], idx) => zMap.set(id, 20 + idx))

          return filteredCompetitors.map(comp => {
            const animState = getCompetitorAnimState(comp.id, currentTime, events)
            if (!animState.visible) return null

            const borderColor = getCompBorderColor(comp)
            const pos = toPixel(animState.x, animState.y)
            const isSelected = selectedCompId === comp.id
            const isFocusMode = selectedCompId != null
            const zIndex = isSelected ? 200 : (zMap.get(comp.id) ?? 19)
            const focusOpacity = isFocusMode && !isSelected ? 0.2 : 1
            const finalOpacity = animState.opacity * focusOpacity

            return (
              <div key={comp.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
                style={{ left: pos.left, top: pos.top, zIndex, opacity: finalOpacity }}>
                {animState.showPopup && animState.popupScore && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap animate-fade-in" style={{ zIndex: 999 }}>
                    <div className={`px-3 py-1 rounded-lg text-sm font-bold shadow-lg ${
                      animState.popupScore.is_dnf ? 'bg-gray-600 text-white' :
                      animState.popupScore.points === 0 ? 'bg-green-500 text-white' :
                      animState.popupScore.points === 5 ? 'bg-red-500 text-white' :
                      animState.popupScore.points === 20 ? 'bg-gray-600 text-white' :
                      'bg-trials-orange text-black'
                    }`}>
                      {animState.popupScore.is_dnf ? 'DNS' : animState.popupScore.points}
                    </div>
                  </div>
                )}
                <div className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full border-[3px] overflow-hidden shadow-lg bg-gray-800 cursor-pointer ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''}`}
                  style={{ borderColor }} onClick={(e) => handleAvatarTap(comp.id, e)}>
                  {comp.photo_url ? (
                    <img src={comp.photo_url} alt={comp.name} className="w-full h-full object-cover" draggable={false} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base font-bold text-white">{comp.number}</div>
                  )}
                </div>
              </div>
            )
          })
        })()}

        {/* Live ranking overlay */}
        {selectedCompId == null && (
          <div className="absolute top-2 right-2 z-[100] pointer-events-none">
            <div className="bg-black/75 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-gray-700/50">
              {classes.filter(cls => visibleClasses.has(cls.id)).map(cls => {
                const classComps = allCompetitors.filter(c => (c.classes || []).includes(cls.id))
                const ranked: { name: string; avg: number }[] = []
                for (const comp of classComps) {
                  // Only count scores for sections in this class
                  const compScores = events.filter(e =>
                    e.competitorId === comp.id &&
                    e.time <= currentTime &&
                    cls.section_ids.includes(e.score.section_id)
                  )
                  if (compScores.length === 0) continue
                  const total = compScores.reduce((sum, e) => sum + (e.score.points ?? 0), 0)
                  ranked.push({ name: comp.name, avg: total / compScores.length })
                }
                ranked.sort((a, b) => a.avg - b.avg)
                const top3 = ranked.slice(0, 3)
                if (top3.length === 0) return null

                const medals = ['#fbbf24', '#d1d5db', '#d97706']
                return (
                  <div key={cls.id} className="mb-1 last:mb-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center" style={{ backgroundColor: cls.color, color: '#000' }}>
                        {cls.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {top3.map((r, i) => (
                      <div key={i} className="flex items-center gap-1 pl-1">
                        <span className="text-[9px] font-bold w-3 text-right" style={{ color: medals[i] || '#9ca3af' }}>{i + 1}</span>
                        <span className="text-[9px] text-gray-300 truncate max-w-[80px]">{r.name}</span>
                        <span className="text-[9px] text-gray-500 ml-auto">{r.avg.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected competitor score card */}
        {selectedComp && selectedScores.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 z-[100] animate-fade-in pointer-events-none" onClick={(e) => e.stopPropagation()}>
            <div className="bg-black/85 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 max-w-md mx-auto pointer-events-auto">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-xs">#{selectedComp.number} {selectedComp.name}</span>
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
      </div>

      {/* Controls bar */}
      <div className="bg-black/90 px-4 py-3 z-30 shrink-0">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button onClick={handlePlay} className="w-11 h-11 rounded-full bg-trials-orange text-black flex items-center justify-center hover:bg-trials-orange/90 transition-colors shrink-0">
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
            )}
          </button>
          <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
            {SPEED_OPTIONS.map((opt, i) => (
              <button key={opt.label} onClick={() => setSpeedIdx(i)}
                className={`px-2 py-1 text-xs font-bold transition-colors ${speedIdx === i ? 'bg-trials-orange text-black' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{opt.label}</button>
            ))}
          </div>
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <input type="range" min={timeRange.start} max={timeRange.end} value={currentTime} onChange={handleSliderChange}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-trials-orange" />
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
