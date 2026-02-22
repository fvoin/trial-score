import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getCompetitors,
  getSections,
  getSettings,
  getScoresBySection,
  getNextLap,
  createScore,
  updateScore,
  deleteScore,
  getAuthRequired,
  verifyPin,
  type Competitor,
  type Section,
  type Score,
  type Settings
} from '../api'
import { UserIcon, ClipboardIcon, HistoryIcon, EditIcon, TrashIcon } from '../components/Icons'
import PinModal, { getPinCookie } from '../components/PinModal'

const STORAGE_KEY = 'trial_score_judge_section'

const SCORE_OPTIONS = [
  { value: 0, label: '0', className: 'score-btn-0' },
  { value: 1, label: '1', className: 'score-btn-1' },
  { value: 2, label: '2', className: 'score-btn-2' },
  { value: 3, label: '3', className: 'score-btn-3' },
  { value: 5, label: '5', className: 'score-btn-5' },
  { value: 20, label: 'DNS', className: 'score-btn-dnf', isDns: true }
]

function getScoreColor(points: number | null, isDnf: boolean): string {
  if (isDnf) return 'bg-gray-600 text-white'
  if (points === 0) return 'bg-trials-success text-trials-darker'
  if (points === 1) return 'bg-emerald-400 text-trials-darker'
  if (points === 2) return 'bg-trials-warning text-trials-darker'
  if (points === 3) return 'bg-orange-500 text-white'
  if (points === 5) return 'bg-trials-danger text-white'
  return 'bg-gray-700 text-gray-500'
}

export default function Judge() {
  const [sections, setSections] = useState<Section[]>([])
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [sectionScores, setSectionScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const isInitialLoad = useRef(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [scoringCompetitor, setScoringCompetitor] = useState<Competitor | null>(null)
  const [nextLap, setNextLap] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [editingScore, setEditingScore] = useState<Score | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    try {
      const required = await getAuthRequired()
      if (!required.judge) { loadInitialData(); return }
      const savedPin = getPinCookie('judge')
      if (savedPin) {
        const result = await verifyPin(savedPin, 'judge')
        if (result.valid) { loadInitialData(); return }
      }
      setNeedsAuth(true); setLoading(false)
    } catch { loadInitialData() }
  }

  function handleAuthSuccess() { setNeedsAuth(false); setLoading(true); loadInitialData() }

  useEffect(() => {
    if (selectedSection) {
      localStorage.setItem(STORAGE_KEY, selectedSection.toString())
      setError('')
      if (isInitialLoad.current) { isInitialLoad.current = false; loadSectionScores() }
      else { setSectionScores([]); setLoadingScores(true); loadSectionScores() }
    } else { setError('') }
  }, [selectedSection])

  async function loadInitialData() {
    try {
      const [sects, comps, sett] = await Promise.all([getSections(), getCompetitors(), getSettings()])
      setSections(sects)
      setCompetitors(comps)
      setSettings(sett)
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && sects.find(s => s.id === parseInt(saved))) setSelectedSection(parseInt(saved))
    } catch { setError('Failed to load data. Pull down to refresh.') }
    finally { setLoading(false) }
  }

  async function loadSectionScores() {
    if (!selectedSection) return
    try { setSectionScores(await getScoresBySection(selectedSection)) }
    catch { /* ignore */ }
    finally { setLoadingScores(false) }
  }

  function getSelectedSectionData(): Section | undefined {
    return sections.find(s => s.id === selectedSection)
  }

  // Filter competitors: show only those enrolled in a class that includes the selected section
  function getFilteredCompetitors(): Competitor[] {
    const section = getSelectedSectionData()
    if (!section || !settings) return []

    const classesForSection = settings.classes.filter(cls => cls.section_ids.includes(section.id))
    const classIds = new Set(classesForSection.map(c => c.id))

    let filtered = competitors.filter(c =>
      (c.classes || []).some(clsId => classIds.has(clsId))
    )

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchLower) || c.number.toString().includes(search)
      )
    }
    return filtered
  }

  // Max laps for the current section (use max laps from relevant classes)
  function getMaxLaps(): number {
    if (!settings || !selectedSection) return 3
    const relevant = settings.classes.filter(cls => cls.section_ids.includes(selectedSection))
    return relevant.length > 0 ? Math.max(...relevant.map(c => c.laps)) : 3
  }

  function getCompetitorScores(competitorId: number): (Score | null)[] {
    const competitorScores = sectionScores.filter(s => s.competitor_id === competitorId)
    const maxLaps = getMaxLaps()
    return Array.from({ length: maxLaps }, (_, i) => {
      return competitorScores.find(s => s.lap === i + 1) || null
    })
  }

  function getCompetitorLapStatus(competitorId: number): number {
    return sectionScores.filter(s => s.competitor_id === competitorId).length
  }

  async function openScoringModal(competitor: Competitor) {
    if (!selectedSection) return
    try {
      const { nextLap: lap, canScore, currentLap, incompleteSections } = await getNextLap(competitor.id, selectedSection)
      const maxLaps = getMaxLaps()
      if (lap > maxLaps) { setError(`${competitor.name} has completed all ${maxLaps} laps at this section`); return }
      if (!canScore) {
        setError(`${competitor.name} must complete Lap ${currentLap} first. Missing: ${incompleteSections.join(', ')}`)
        return
      }
      setNextLap(lap)
      setScoringCompetitor(competitor)
    } catch { setError('Failed to get lap info') }
  }

  async function submitScore(points: number, isDns: boolean) {
    if (!scoringCompetitor || !selectedSection) return
    setSubmitting(true)
    try {
      await createScore({ competitor_id: scoringCompetitor.id, section_id: selectedSection, points, is_dnf: isDns })
      setScoringCompetitor(null)
      loadSectionScores()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to submit score') }
    finally { setSubmitting(false) }
  }

  async function submitEditScore(points: number, isDns: boolean) {
    if (!editingScore) return
    setSubmitting(true)
    try { await updateScore(editingScore.id, { points, is_dnf: isDns }); setEditingScore(null); loadSectionScores() }
    catch { setError('Failed to update score') }
    finally { setSubmitting(false) }
  }

  function handleDeleteClick(scoreId: number) {
    if (deletingId) return
    setConfirmDeleteId(scoreId)
  }

  async function confirmDelete() {
    if (!confirmDeleteId || deletingId) return
    const scoreId = confirmDeleteId
    setConfirmDeleteId(null); setDeletingId(scoreId)
    try { setSectionScores(prev => prev.filter(s => s.id !== scoreId)); await deleteScore(scoreId) }
    catch { setError('Failed to delete score'); loadSectionScores() }
    finally { setDeletingId(null) }
  }

  if (needsAuth) return <PinModal role="judge" onSuccess={handleAuthSuccess} />

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-2xl text-trials-accent animate-pulse">Loading...</div>
      </div>
    )
  }

  // Section selection screen — group by class
  if (!selectedSection) {
    const classes = settings?.classes || []

    // Find sections not assigned to any class
    const assignedIds = new Set(classes.flatMap(c => c.section_ids))
    const unassigned = sections.filter(s => !assignedIds.has(s.id))

    return (
      <div className="min-h-screen bg-trials-darker p-3 sm:p-4">
        <header className="mb-6 sm:mb-8">
          <Link to="/" className="text-gray-400 hover:text-white text-sm">← Home</Link>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-trials-accent mt-2">SELECT SECTION</h1>
        </header>

        <div className="grid gap-4 max-w-2xl mx-auto">
          {classes.map(cls => {
            const classSections = sections.filter(s => cls.section_ids.includes(s.id))
            if (classSections.length === 0) return null
            return (
              <div key={cls.id}>
                <h2 className="text-base sm:text-lg mb-2 sm:mb-3 font-bold" style={{ color: cls.color }}>{cls.name}</h2>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {classSections.map(section => (
                    <button
                      key={section.id}
                      onClick={() => setSelectedSection(section.id)}
                      className="py-4 sm:py-6 bg-trials-dark border-2 rounded-xl text-lg sm:text-xl font-display font-bold hover:opacity-80 active:scale-95 transition-all"
                      style={{ borderColor: cls.color }}
                    >
                      {section.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {unassigned.length > 0 && (
            <div>
              <h2 className="text-base sm:text-lg text-gray-400 mb-2 sm:mb-3">Other</h2>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {unassigned.map(section => (
                  <button key={section.id} onClick={() => setSelectedSection(section.id)}
                    className="py-4 sm:py-6 bg-trials-dark border-2 border-gray-600 rounded-xl text-lg sm:text-xl font-display font-bold hover:bg-gray-700 active:scale-95 transition-all">
                    {section.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const section = getSelectedSectionData()
  const filteredCompetitors = getFilteredCompetitors()
  const maxLaps = getMaxLaps()

  // Determine class label for the header
  const sectionClasses = (settings?.classes || []).filter(cls => cls.section_ids.includes(selectedSection))
  const classLabel = sectionClasses.map(c => c.name).join(' / ')

  return (
    <div className="min-h-screen bg-trials-darker flex flex-col">
      <header className="bg-trials-dark border-b border-trials-accent/30 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => setSelectedSection(null)} className="text-gray-400 hover:text-white text-sm shrink-0">← Change</button>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-trials-accent truncate">
              {section?.name}
              {classLabel && <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-gray-400">({classLabel})</span>}
            </h1>
          </div>
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-2 sm:px-4 sm:py-2 rounded-lg border transition-colors flex items-center gap-2 shrink-0 ${showHistory ? 'bg-trials-accent text-trials-darker border-trials-accent' : 'border-gray-600 hover:border-trials-accent'}`}>
            {showHistory ? <><ClipboardIcon className="w-5 h-5" /><span className="hidden sm:inline">Competitors</span></> : <><HistoryIcon className="w-5 h-5" /><span className="hidden sm:inline">History</span></>}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-4 p-4 bg-trials-danger/20 border border-trials-danger rounded-lg text-trials-danger">
          {error}<button onClick={() => setError('')} className="ml-4 text-white">×</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3 sm:p-4">
        {loadingScores ? (
          <div className="flex items-center justify-center py-12"><div className="text-lg text-trials-accent animate-pulse">Loading scores...</div></div>
        ) : showHistory ? (
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-base sm:text-lg text-gray-400 mb-3 sm:mb-4">Recent Scores ({sectionScores.length})</h2>
            {sectionScores.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No scores entered yet</p>
            ) : sectionScores.map(score => (
              <div key={score.id} className="bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-4">
                <div className="hidden sm:block w-12 h-12 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                  {score.photo_url ? <img src={score.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500"><UserIcon className="w-6 h-6" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <span className="text-lg sm:text-xl font-display font-bold text-trials-orange">#{score.competitor_number}</span>
                    <span className="font-semibold text-sm sm:text-base truncate">{score.competitor_name}</span>
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400">
                    Lap {score.lap}{score.updated_at && <span className="ml-1 sm:ml-2 text-trials-warning">(edited)</span>}
                  </div>
                </div>
                <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-display text-lg sm:text-2xl font-bold shrink-0 ${getScoreColor(score.points, !!score.is_dnf)}`}>
                  {score.is_dnf ? 'DNS' : score.points}
                </div>
                <div className="flex gap-1 sm:gap-2 shrink-0">
                  <button onClick={() => setEditingScore(score)} disabled={deletingId !== null} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50"><EditIcon className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                  <button onClick={() => handleDeleteClick(score.id)} disabled={deletingId !== null} className={`p-2 bg-trials-danger/20 hover:bg-trials-danger/40 text-trials-danger rounded-lg disabled:opacity-50 ${deletingId === score.id ? 'animate-pulse' : ''}`}><TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            <div className="sticky top-0 bg-trials-darker pb-2 sm:pb-3 z-10">
              <input type="text" placeholder="Search by number or name..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-trials-dark border border-gray-700 rounded-lg focus:border-trials-accent focus:outline-none text-base" />
            </div>
            {filteredCompetitors.map(comp => {
              const scores = getCompetitorScores(comp.id)
              const lapsCompleted = getCompetitorLapStatus(comp.id)
              const isComplete = lapsCompleted >= maxLaps

              // Get class names for display
              const compClasses = (settings?.classes || []).filter(cls => (comp.classes || []).includes(cls.id))
              const classLabel = compClasses.map(c => c.name).join(', ')

              return (
                <button key={comp.id} onClick={() => !isComplete && openScoringModal(comp)} disabled={isComplete}
                  className={`w-full bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-4 text-left transition-colors ${isComplete ? 'opacity-50 cursor-not-allowed' : 'hover:bg-trials-dark/80 active:scale-[0.99]'}`}>
                  <div className="hidden sm:block w-14 h-14 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                    {comp.photo_url ? <img src={comp.photo_url} alt={comp.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500"><UserIcon className="w-7 h-7" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1 sm:gap-2">
                      <span className="text-xl sm:text-2xl font-display font-bold text-trials-orange">#{comp.number}</span>
                      <span className="text-base sm:text-lg font-semibold truncate">{comp.name}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400">{classLabel}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {scores.map((score, idx) => (
                      <div key={idx} className={`w-8 h-8 sm:w-10 sm:h-10 rounded flex items-center justify-center text-xs sm:text-sm font-bold ${score ? getScoreColor(score.points, !!score.is_dnf) : 'bg-gray-700 text-gray-500'}`}>
                        {score ? (score.is_dnf ? 'X' : score.points) : '-'}
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Scoring Modal */}
      {scoringCompetitor && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-gray-700 overflow-hidden">
                {scoringCompetitor.photo_url ? <img src={scoringCompetitor.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500"><UserIcon className="w-8 h-8" /></div>}
              </div>
              <div>
                <div className="text-3xl font-display font-bold text-trials-orange">#{scoringCompetitor.number}</div>
                <div className="text-lg">{scoringCompetitor.name}</div>
                <div className="text-trials-accent font-display">LAP {nextLap}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {SCORE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => submitScore(opt.value, 'isDns' in opt && !!opt.isDns)} disabled={submitting}
                  className={`score-btn ${opt.className} ${submitting ? 'opacity-50' : ''}`}>{opt.label}</button>
              ))}
            </div>
            <button onClick={() => setScoringCompetitor(null)} className="w-full py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Score Modal */}
      {editingScore && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-display font-bold text-trials-orange mb-4">Edit Score</h2>
            <div className="mb-4 text-gray-400">#{editingScore.competitor_number} {editingScore.competitor_name} - Lap {editingScore.lap}</div>
            <div className="mb-2 text-sm text-gray-500">Current: {editingScore.is_dnf ? 'DNS' : editingScore.points}</div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {SCORE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => submitEditScore(opt.value, 'isDns' in opt && !!opt.isDns)} disabled={submitting}
                  className={`score-btn ${opt.className} ${submitting ? 'opacity-50' : ''}`}>{opt.label}</button>
              ))}
            </div>
            <button onClick={() => setEditingScore(null)} className="w-full py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-display font-bold text-trials-danger mb-4">Delete Score?</h2>
            <p className="text-gray-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-3 bg-trials-danger rounded-lg hover:bg-trials-danger/80 transition-colors font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
