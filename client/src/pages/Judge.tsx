import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getCompetitors,
  getSections,
  getScoresBySection,
  getNextLap,
  createScore,
  updateScore,
  deleteScore,
  getAuthRequired,
  verifyPin,
  type Competitor,
  type Section,
  type Score
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
  { value: -1, label: 'DNF', className: 'score-btn-dnf' }
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
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [sectionScores, setSectionScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  
  // Auth state
  const [needsAuth, setNeedsAuth] = useState(false)

  // Scoring modal state
  const [scoringCompetitor, setScoringCompetitor] = useState<Competitor | null>(null)
  const [nextLap, setNextLap] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Edit modal state
  const [editingScore, setEditingScore] = useState<Score | null>(null)

  // View mode
  const [showHistory, setShowHistory] = useState(false)

  // Search
  const [search, setSearch] = useState('')

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const required = await getAuthRequired()
      if (!required.judge) {
        loadInitialData()
        return
      }

      const savedPin = getPinCookie('judge')
      if (savedPin) {
        const result = await verifyPin(savedPin, 'judge')
        if (result.valid) {
          loadInitialData()
          return
        }
      }

      setNeedsAuth(true)
      setLoading(false)
    } catch {
      loadInitialData()
    }
  }

  function handleAuthSuccess() {
    setNeedsAuth(false)
    setLoading(true)
    loadInitialData()
  }

  useEffect(() => {
    if (selectedSection) {
      localStorage.setItem(STORAGE_KEY, selectedSection.toString())
      // Clear old scores immediately and show loading state
      setSectionScores([])
      setLoadingScores(true)
      loadSectionScores()
    }
  }, [selectedSection])

  async function loadInitialData() {
    try {
      const [sects, comps] = await Promise.all([getSections(), getCompetitors()])
      setSections(sects)
      setCompetitors(comps)

      // Restore saved section
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && sects.find(s => s.id === parseInt(saved))) {
        setSelectedSection(parseInt(saved))
      }
    } catch (err) {
      console.error('Load error:', err)
      setError('Failed to load data. Pull down to refresh.')
    } finally {
      setLoading(false)
    }
  }

  async function loadSectionScores() {
    if (!selectedSection) return
    try {
      const scores = await getScoresBySection(selectedSection)
      setSectionScores(scores)
    } catch {
      console.error('Failed to load section scores')
    } finally {
      setLoadingScores(false)
    }
  }

  function getSelectedSectionData(): Section | undefined {
    return sections.find(s => s.id === selectedSection)
  }

  function getFilteredCompetitors(): Competitor[] {
    const section = getSelectedSectionData()
    if (!section) return []

    let filtered = competitors

    // For enduro sections, only show competitors registered for enduro
    if (section.type === 'enduro') {
      filtered = filtered.filter(c => c.enduro_trial === 1)
    }
    // For kids sections, only show kids class competitors
    else if (section.type === 'kids') {
      filtered = filtered.filter(c => c.primary_class === 'kids')
    }
    // For main sections, exclude kids (they have their own sections)
    else if (section.type === 'main') {
      filtered = filtered.filter(c => c.primary_class !== 'kids')
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.number.toString().includes(search)
      )
    }

    return filtered
  }

  function getCompetitorScores(competitorId: number): (Score | null)[] {
    const competitorScores = sectionScores.filter(s => s.competitor_id === competitorId)
    // Return array of 3 scores (or null if not yet scored)
    return [1, 2, 3].map(lap => {
      const score = competitorScores.find(s => s.lap === lap)
      return score || null
    })
  }

  function getCompetitorLapStatus(competitorId: number): number {
    const competitorScores = sectionScores.filter(s => s.competitor_id === competitorId)
    return competitorScores.length
  }

  async function openScoringModal(competitor: Competitor) {
    if (!selectedSection) return
    
    try {
      const { nextLap: lap, canScore, currentLap, incompleteSections } = await getNextLap(competitor.id, selectedSection)
      if (lap > 3) {
        setError(`${competitor.name} has completed all 3 laps at this section`)
        return
      }
      if (!canScore) {
        const missing = incompleteSections.join(', ')
        setError(`${competitor.name} must complete Lap ${currentLap} first. Missing: ${missing}`)
        return
      }
      setNextLap(lap)
      setScoringCompetitor(competitor)
    } catch {
      setError('Failed to get lap info')
    }
  }

  async function submitScore(points: number, isDnf: boolean) {
    if (!scoringCompetitor || !selectedSection) return
    
    setSubmitting(true)
    try {
      await createScore({
        competitor_id: scoringCompetitor.id,
        section_id: selectedSection,
        points: isDnf ? undefined : points,
        is_dnf: isDnf
      })
      setScoringCompetitor(null)
      loadSectionScores()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit score')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitEditScore(points: number, isDnf: boolean) {
    if (!editingScore) return
    
    setSubmitting(true)
    try {
      await updateScore(editingScore.id, {
        points: isDnf ? undefined : points,
        is_dnf: isDnf
      })
      setEditingScore(null)
      loadSectionScores()
    } catch {
      setError('Failed to update score')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteScore(scoreId: number) {
    if (deletingId) return // Prevent double-tap
    if (!confirm('Delete this score entry?')) return
    
    setDeletingId(scoreId)
    try {
      await deleteScore(scoreId)
      await loadSectionScores()
    } catch {
      setError('Failed to delete score')
    } finally {
      setDeletingId(null)
    }
  }

  // Show PIN modal if needed
  if (needsAuth) {
    return <PinModal role="judge" onSuccess={handleAuthSuccess} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-2xl text-trials-accent animate-pulse">Loading...</div>
      </div>
    )
  }

  // Section selection screen
  if (!selectedSection) {
    const mainSections = sections.filter(s => s.type === 'main')
    const kidsSections = sections.filter(s => s.type === 'kids')
    const enduroSections = sections.filter(s => s.type === 'enduro')

    return (
      <div className="min-h-screen bg-trials-darker p-3 sm:p-4">
        <header className="mb-6 sm:mb-8">
          <Link to="/" className="text-gray-400 hover:text-white text-sm">← Home</Link>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-trials-accent mt-2">SELECT SECTION</h1>
        </header>

        <div className="grid gap-4 max-w-2xl mx-auto">
          {/* Main sections */}
          <div>
            <h2 className="text-base sm:text-lg text-gray-400 mb-2 sm:mb-3">Main Competition (Clubman / Advanced)</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {mainSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setSelectedSection(section.id)}
                  className="py-4 sm:py-6 bg-trials-dark border-2 border-trials-accent rounded-xl text-lg sm:text-xl font-display font-bold hover:bg-trials-accent/20 active:scale-95 transition-all"
                >
                  {section.name}
                </button>
              ))}
            </div>
          </div>

          {/* Kids sections */}
          {kidsSections.length > 0 && (
            <div className="mt-2 sm:mt-4">
              <h2 className="text-base sm:text-lg text-gray-400 mb-2 sm:mb-3">Kids</h2>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {kidsSections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className="py-4 sm:py-6 bg-trials-dark border-2 border-yellow-400 rounded-xl text-lg sm:text-xl font-display font-bold hover:bg-yellow-400/20 active:scale-95 transition-all"
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Enduro sections */}
          <div className="mt-2 sm:mt-4">
            <h2 className="text-base sm:text-lg text-gray-400 mb-2 sm:mb-3">Enduro Trial</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {enduroSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setSelectedSection(section.id)}
                  className="py-4 sm:py-6 bg-gray-800 border-2 border-gray-500 rounded-xl text-lg sm:text-xl font-display font-bold hover:bg-gray-700 active:scale-95 transition-all"
                >
                  {section.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const section = getSelectedSectionData()
  const filteredCompetitors = getFilteredCompetitors()

  return (
    <div className="min-h-screen bg-trials-darker flex flex-col">
      {/* Header */}
      <header className="bg-trials-dark border-b border-trials-accent/30 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setSelectedSection(null)}
              className="text-gray-400 hover:text-white text-sm shrink-0"
            >
              ← Change
            </button>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-trials-accent truncate">
              {section?.name}
              {section?.type === 'enduro' && (
                <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-gray-400">(Enduro)</span>
              )}
              {section?.type === 'kids' && (
                <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-yellow-400">(Kids)</span>
              )}
            </h1>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 sm:px-4 sm:py-2 rounded-lg border transition-colors flex items-center gap-2 shrink-0 ${
              showHistory
                ? 'bg-trials-accent text-trials-darker border-trials-accent'
                : 'border-gray-600 hover:border-trials-accent'
            }`}
          >
            {showHistory ? (
              <><ClipboardIcon className="w-5 h-5" /><span className="hidden sm:inline">Competitors</span></>
            ) : (
              <><HistoryIcon className="w-5 h-5" /><span className="hidden sm:inline">History</span></>
            )}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-4 p-4 bg-trials-danger/20 border border-trials-danger rounded-lg text-trials-danger">
          {error}
          <button onClick={() => setError('')} className="ml-4 text-white">×</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3 sm:p-4">
        {loadingScores ? (
          // Loading state while fetching section scores
          <div className="flex items-center justify-center py-12">
            <div className="text-lg text-trials-accent animate-pulse">Loading scores...</div>
          </div>
        ) : showHistory ? (
          // Score History View
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-base sm:text-lg text-gray-400 mb-3 sm:mb-4">
              Recent Scores ({sectionScores.length})
            </h2>
            {sectionScores.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No scores entered yet</p>
            ) : (
              sectionScores.map(score => (
                <div
                  key={score.id}
                  className="bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-4"
                >
                  {/* Photo - hidden on small screens */}
                  <div className="hidden sm:block w-12 h-12 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                    {score.photo_url ? (
                      <img src={score.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <UserIcon className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1 sm:gap-2">
                      <span className="text-lg sm:text-xl font-display font-bold text-trials-orange">
                        #{score.competitor_number}
                      </span>
                      <span className="font-semibold text-sm sm:text-base truncate">{score.competitor_name}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400">
                      Lap {score.lap}
                      {score.updated_at && <span className="ml-1 sm:ml-2 text-trials-warning">(edited)</span>}
                    </div>
                  </div>

                  {/* Score */}
                  <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-display text-lg sm:text-2xl font-bold shrink-0 ${getScoreColor(score.points, !!score.is_dnf)}`}>
                    {score.is_dnf ? 'DNF' : score.points}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 sm:gap-2 shrink-0">
                    <button
                      onClick={() => setEditingScore(score)}
                      disabled={deletingId !== null}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50"
                    >
                      <EditIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteScore(score.id)}
                      disabled={deletingId !== null}
                      className={`p-2 bg-trials-danger/20 hover:bg-trials-danger/40 text-trials-danger rounded-lg disabled:opacity-50 ${
                        deletingId === score.id ? 'animate-pulse' : ''
                      }`}
                    >
                      <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // Competitors View
          <div className="space-y-2 sm:space-y-3">
            {/* Search */}
            <div className="sticky top-0 bg-trials-darker pb-2 sm:pb-3 z-10">
              <input
                type="text"
                placeholder="Search by number or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-trials-dark border border-gray-700 rounded-lg focus:border-trials-accent focus:outline-none text-base"
              />
            </div>

            {filteredCompetitors.map(comp => {
              const scores = getCompetitorScores(comp.id)
              const lapsCompleted = getCompetitorLapStatus(comp.id)
              const isComplete = lapsCompleted >= 3

              return (
                <button
                  key={comp.id}
                  onClick={() => !isComplete && openScoringModal(comp)}
                  disabled={isComplete}
                  className={`w-full bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-4 text-left transition-colors ${
                    isComplete
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-trials-dark/80 active:scale-[0.99]'
                  }`}
                >
                  {/* Photo - hidden on small screens */}
                  <div className="hidden sm:block w-14 h-14 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                    {comp.photo_url ? (
                      <img src={comp.photo_url} alt={comp.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <UserIcon className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1 sm:gap-2">
                      <span className="text-xl sm:text-2xl font-display font-bold text-trials-orange">
                        #{comp.number}
                      </span>
                      <span className="text-base sm:text-lg font-semibold truncate">{comp.name}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400 capitalize">{comp.primary_class}</div>
                  </div>

                  {/* Score indicators - show actual scores */}
                  <div className="flex gap-1 shrink-0">
                    {scores.map((score, idx) => (
                      <div
                        key={idx}
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded flex items-center justify-center text-xs sm:text-sm font-bold ${
                          score ? getScoreColor(score.points, !!score.is_dnf) : 'bg-gray-700 text-gray-500'
                        }`}
                      >
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
            {/* Competitor info */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-gray-700 overflow-hidden">
                {scoringCompetitor.photo_url ? (
                  <img src={scoringCompetitor.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <UserIcon className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div>
                <div className="text-3xl font-display font-bold text-trials-orange">
                  #{scoringCompetitor.number}
                </div>
                <div className="text-lg">{scoringCompetitor.name}</div>
                <div className="text-trials-accent font-display">LAP {nextLap}</div>
              </div>
            </div>

            {/* Score buttons */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {SCORE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => submitScore(opt.value, opt.value === -1)}
                  disabled={submitting}
                  className={`score-btn ${opt.className} ${submitting ? 'opacity-50' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setScoringCompetitor(null)}
              className="w-full py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit Score Modal */}
      {editingScore && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-display font-bold text-trials-orange mb-4">Edit Score</h2>
            
            <div className="mb-4 text-gray-400">
              #{editingScore.competitor_number} {editingScore.competitor_name} - Lap {editingScore.lap}
            </div>

            <div className="mb-2 text-sm text-gray-500">
              Current: {editingScore.is_dnf ? 'DNF' : editingScore.points}
            </div>

            {/* Score buttons */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {SCORE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => submitEditScore(opt.value, opt.value === -1)}
                  disabled={submitting}
                  className={`score-btn ${opt.className} ${submitting ? 'opacity-50' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setEditingScore(null)}
              className="w-full py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
