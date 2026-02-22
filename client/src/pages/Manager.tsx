import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getSettings,
  updateSettings,
  getScores,
  getSections,
  getLeaderboard,
  getAuthRequired,
  verifyPin,
  getExportEventUrl,
  getExportCsvUrl,
  importEvent,
  deleteAllScores,
  deleteEverything,
  type Competitor,
  type Settings,
  type Score,
  type Section,
  type ClassConfig,
  type LeaderboardEntry
} from '../api'
import { UserIcon, SettingsIcon, PlusIcon, CameraIcon, UploadIcon, TrashIcon, HistoryIcon, FileSpreadsheetIcon, DownloadIcon, LoaderIcon } from '../components/Icons'
import PinModal, { getPinCookie } from '../components/PinModal'

function getScoreColor(points: number | null, isDnf: boolean): string {
  if (isDnf) return 'bg-gray-600 text-white'
  if (points === 0) return 'bg-trials-success text-trials-darker'
  if (points === 1) return 'bg-emerald-400 text-trials-darker'
  if (points === 2) return 'bg-trials-warning text-trials-darker'
  if (points === 3) return 'bg-orange-500 text-white'
  if (points === 5) return 'bg-trials-danger text-white'
  return 'bg-gray-700 text-gray-500'
}

export default function Manager() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [classFilter, setClassFilter] = useState<string>('all')

  const [needsAuth, setNeedsAuth] = useState(false)

  const [allScores, setAllScores] = useState<Score[]>([])
  const [allSections, setAllSections] = useState<Section[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [logTab, setLogTab] = useState<'timeline' | 'standings'>('timeline')

  // Form state
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [photoData, setPhotoData] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  const [savingSettings, setSavingSettings] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0)
  const [deleteAllStep, setDeleteAllStep] = useState(0)

  const classes: ClassConfig[] = settings?.classes || []

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    try {
      const required = await getAuthRequired()
      if (!required.manager) { loadData(); return }
      const savedPin = getPinCookie('manager')
      if (savedPin) {
        const result = await verifyPin(savedPin, 'manager')
        if (result.valid) { loadData(); return }
      }
      setNeedsAuth(true)
      setLoading(false)
    } catch { loadData() }
  }

  function handleAuthSuccess() { setNeedsAuth(false); setLoading(true); loadData() }

  async function loadData() {
    try {
      const [comps, sett] = await Promise.all([getCompetitors(), getSettings()])
      setCompetitors(comps)
      setSettings(sett)
    } catch { setError('Failed to load data') }
    finally { setLoading(false) }
  }

  async function openLog() {
    try {
      const [scores, secs, lb] = await Promise.all([getScores(), getSections(), getLeaderboard()])
      setAllScores(scores)
      setAllSections(secs)
      setLeaderboard(lb)
      setShowLog(true)
    } catch { setError('Failed to load log data') }
  }

  function getFilteredCompetitors(): Competitor[] {
    if (classFilter === 'all') return competitors
    return competitors.filter(c => (c.classes || []).includes(classFilter))
  }

  function resetForm() {
    setNumber(''); setName(''); setSelectedClasses([]); setPhotoData(null); setPhotoFile(null); setEditingId(null)
  }

  function openAddForm() { resetForm(); setShowForm(true) }

  function openEditForm(comp: Competitor) {
    setNumber(comp.number.toString())
    setName(comp.name)
    setSelectedClasses(comp.classes || [])
    setPhotoData(comp.photo_url)
    setPhotoFile(null)
    setEditingId(comp.id)
    setShowForm(true)
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoData(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  function toggleFormClass(clsId: string) {
    setSelectedClasses(prev =>
      prev.includes(clsId) ? prev.filter(c => c !== clsId) : [...prev, clsId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const formData = new FormData()
    formData.append('number', number)
    formData.append('name', name)
    formData.append('classes', JSON.stringify(selectedClasses))
    if (photoFile) formData.append('photo', photoFile)

    try {
      if (editingId) await updateCompetitor(editingId, formData)
      else await createCompetitor(formData)
      setShowForm(false)
      resetForm()
      loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save competitor')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this competitor and all their scores?')) return
    try { await deleteCompetitor(id); loadData() }
    catch { setError('Failed to delete competitor') }
  }

  async function handleDeleteAllScores() {
    if (deleteConfirmStep === 0) { setDeleteConfirmStep(1); return }
    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2)
      try { await deleteAllScores(); setAllScores([]); loadData(); setDeleteConfirmStep(0); alert('All scores deleted') }
      catch { setError('Failed to delete all scores'); setDeleteConfirmStep(0) }
    }
  }

  async function handleDeleteAll() {
    if (deleteAllStep === 0) { setDeleteAllStep(1); return }
    if (deleteAllStep === 1) {
      setDeleteAllStep(2)
      try { await deleteEverything(); setAllScores([]); loadData(); setDeleteAllStep(0); setShowSettings(false); alert('All data deleted') }
      catch { setError('Failed to delete all data'); setDeleteAllStep(0) }
    }
  }

  async function handleImportEvent(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setError('')
    try {
      const result = await importEvent(file)
      alert(`Imported ${result.imported.competitors} competitors, ${result.imported.scores} scores, ${result.imported.photos} photos`)
      loadData(); setShowSettings(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally { setImporting(false); e.target.value = '' }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!settings || savingSettings) return
    setSavingSettings(true); setError('')
    try {
      const updated = await updateSettings(settings)
      setSettings(updated)
      setShowSettings(false)
    } catch { setError('Failed to save settings') }
    finally { setSavingSettings(false) }
  }

  // --- Settings editors ---
  function addSection() {
    if (!settings) return
    const maxId = settings.sections.reduce((m, s) => Math.max(m, s.id), 0)
    setSettings({
      ...settings,
      sections: [...settings.sections, { id: maxId + 1, name: `Section ${settings.sections.length + 1}` }]
    })
  }

  function removeSection(id: number) {
    if (!settings) return
    setSettings({
      ...settings,
      sections: settings.sections.filter(s => s.id !== id),
      classes: settings.classes.map(cls => ({
        ...cls,
        section_ids: cls.section_ids.filter(sid => sid !== id)
      }))
    })
  }

  function renameSection(id: number, newName: string) {
    if (!settings) return
    setSettings({
      ...settings,
      sections: settings.sections.map(s => s.id === id ? { ...s, name: newName } : s)
    })
  }

  function addClass() {
    if (!settings) return
    const maxNum = settings.classes.reduce((m, c) => {
      const n = parseInt(c.id.replace('cls_', ''))
      return isNaN(n) ? m : Math.max(m, n)
    }, 0)
    const colors = ['#ef4444', '#10b981', '#facc15', '#9ca3af', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
    setSettings({
      ...settings,
      classes: [...settings.classes, {
        id: `cls_${maxNum + 1}`,
        name: `Class ${settings.classes.length + 1}`,
        laps: 3,
        section_ids: [],
        color: colors[settings.classes.length % colors.length]
      }]
    })
  }

  function removeClass(clsId: string) {
    if (!settings) return
    setSettings({ ...settings, classes: settings.classes.filter(c => c.id !== clsId) })
  }

  function updateClass(clsId: string, updates: Partial<ClassConfig>) {
    if (!settings) return
    setSettings({
      ...settings,
      classes: settings.classes.map(c => c.id === clsId ? { ...c, ...updates } : c)
    })
  }

  function toggleClassSection(clsId: string, secId: number) {
    if (!settings) return
    const cls = settings.classes.find(c => c.id === clsId)
    if (!cls) return
    const newIds = cls.section_ids.includes(secId)
      ? cls.section_ids.filter(id => id !== secId)
      : [...cls.section_ids, secId]
    updateClass(clsId, { section_ids: newIds })
  }

  // --- Rankings ---
  function getRankedByClass(cls: ClassConfig): (LeaderboardEntry & { rank: number; completed: boolean })[] {
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

  if (needsAuth) return <PinModal role="manager" onSuccess={handleAuthSuccess} />

  if (loading) {
    return (
      <div className="min-h-screen bg-trials-darker flex items-center justify-center">
        <div className="text-2xl text-trials-orange animate-pulse">Loading...</div>
      </div>
    )
  }

  const filteredCompetitors = getFilteredCompetitors()

  return (
    <div className="min-h-screen bg-trials-darker">
      {/* Header */}
      <header className="bg-trials-dark border-b border-trials-orange/30 p-3 sm:p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/" className="text-gray-400 hover:text-white text-sm sm:text-base shrink-0">← Home</Link>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-trials-orange truncate">MANAGER</h1>
          </div>
          <div className="flex gap-1 sm:gap-2 shrink-0">
            <button onClick={openLog} className="p-2 sm:px-4 sm:py-2 bg-trials-dark border border-gray-600 rounded-lg hover:border-trials-success transition-colors flex items-center gap-2" title="Log">
              <HistoryIcon className="w-5 h-5" /><span className="hidden sm:inline">Log</span>
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 sm:px-4 sm:py-2 bg-trials-dark border border-gray-600 rounded-lg hover:border-trials-accent transition-colors flex items-center gap-2" title="Settings">
              <SettingsIcon className="w-5 h-5" /><span className="hidden sm:inline">Settings</span>
            </button>
            <button onClick={openAddForm} className="p-2 sm:px-4 sm:py-2 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors flex items-center gap-2" title="Add">
              <PlusIcon className="w-5 h-5" /><span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* Class filter tabs */}
      <div className="bg-trials-dark/50 border-b border-gray-800 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 flex gap-1 sm:gap-2 min-w-max">
          <button
            onClick={() => setClassFilter('all')}
            className={`px-2 sm:px-4 py-2 font-display text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
              classFilter === 'all' ? 'bg-white text-trials-darker' : 'bg-trials-dark text-gray-400 hover:text-white'
            }`}
          >
            ALL <span className="ml-1 text-xs opacity-70">({competitors.length})</span>
          </button>
          {classes.map(cls => (
            <button
              key={cls.id}
              onClick={() => setClassFilter(cls.id)}
              className={`px-2 sm:px-4 py-2 font-display text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap`}
              style={classFilter === cls.id ? { backgroundColor: cls.color, color: '#1a1a2e' } : {}}
            >
              {cls.name.substring(0, 4).toUpperCase()}
              <span className="ml-1 text-xs opacity-70">
                ({competitors.filter(c => (c.classes || []).includes(cls.id)).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-4 bg-trials-danger/20 border border-trials-danger rounded-lg text-trials-danger">
            {error}
            <button onClick={() => setError('')} className="ml-4 text-white">×</button>
          </div>
        )}

        <div className="grid gap-4">
          {filteredCompetitors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-xl mb-4">
                {classFilter === 'all' ? 'No competitors registered yet' : 'No competitors in this class'}
              </p>
              {classFilter === 'all' && (
                <button onClick={openAddForm} className="px-6 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg">
                  Add First Competitor
                </button>
              )}
            </div>
          ) : (
            filteredCompetitors.map(comp => (
              <div key={comp.id} className="bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border border-gray-800 hover:border-trials-orange/50 transition-colors">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                  {comp.photo_url ? (
                    <img src={comp.photo_url} alt={comp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500"><UserIcon className="w-6 h-6 sm:w-8 sm:h-8" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 sm:gap-3">
                    <span className="text-xl sm:text-3xl font-display font-bold text-trials-orange">#{comp.number}</span>
                    <span className="text-base sm:text-xl font-semibold truncate">{comp.name}</span>
                  </div>
                  <div className="flex gap-1 sm:gap-2 mt-1 flex-wrap">
                    {(comp.classes || []).map(clsId => {
                      const cls = classes.find(c => c.id === clsId)
                      if (!cls) return null
                      return (
                        <span key={clsId} className="px-2 py-0.5 text-xs sm:text-sm rounded font-semibold" style={{ backgroundColor: cls.color + '33', color: cls.color }}>
                          {cls.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-1 sm:gap-2 shrink-0">
                  <button onClick={() => openEditForm(comp)} className="px-2 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm">Edit</button>
                  <button onClick={() => handleDelete(comp.id)} className="p-2 sm:px-4 sm:py-2 bg-trials-danger/20 hover:bg-trials-danger/40 text-trials-danger rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4 sm:hidden" /><span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Log Modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-trials-orange">Event Log</h2>
              <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-4 border-b border-gray-700 flex gap-2">
              <button onClick={() => setLogTab('timeline')} className={`px-4 py-2 rounded-lg font-display font-bold transition-colors ${logTab === 'timeline' ? 'bg-trials-accent text-trials-darker' : 'bg-gray-700 hover:bg-gray-600'}`}>Score Timeline</button>
              <button onClick={() => setLogTab('standings')} className={`px-4 py-2 rounded-lg font-display font-bold transition-colors ${logTab === 'standings' ? 'bg-trials-accent text-trials-darker' : 'bg-gray-700 hover:bg-gray-600'}`}>Final Standings</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logTab === 'timeline' ? (
                <div className="space-y-2">
                  {allScores.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No scores recorded yet</p>
                  ) : (
                    allScores.map(score => (
                      <div key={score.id} className="flex items-center gap-4 bg-trials-darker rounded-lg p-3">
                        <div className="text-sm text-gray-500 w-40">{new Date(score.created_at).toLocaleString()}</div>
                        <div className="flex-1">
                          <span className="font-display font-bold text-trials-orange">#{score.competitor_number}</span>
                          <span className="ml-2">{score.competitor_name}</span>
                        </div>
                        <div className="text-gray-400">{score.section_name} • Lap {score.lap}</div>
                        <div className={`w-10 h-10 rounded flex items-center justify-center font-bold ${getScoreColor(score.points, !!score.is_dnf)}`}>
                          {score.is_dnf ? 'X' : score.points}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {classes.map(cls => {
                    const classSections = allSections.filter(s => cls.section_ids.includes(s.id))
                    return (
                      <StandingsTable
                        key={cls.id}
                        title={cls.name}
                        color={cls.color}
                        entries={getRankedByClass(cls)}
                        sections={classSections}
                        laps={cls.laps}
                        scores={allScores}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold text-trials-orange mb-6">
              {editingId ? 'Edit Competitor' : 'Add Competitor'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bib Number</label>
                <input type="number" value={number} onChange={e => setNumber(e.target.value)} required min="1"
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none text-xl font-display" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none" />
              </div>

              {/* Classes multi-select */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Classes</label>
                <div className="flex flex-wrap gap-2">
                  {classes.map(cls => {
                    const isActive = selectedClasses.includes(cls.id)
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => toggleFormClass(cls.id)}
                        className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition-all ${isActive ? 'text-black' : 'text-gray-400 bg-transparent'}`}
                        style={{
                          borderColor: cls.color,
                          backgroundColor: isActive ? cls.color : 'transparent',
                          color: isActive ? '#000' : cls.color
                        }}
                      >
                        {cls.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Photo */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Photo</label>
                {photoData ? (
                  <div className="space-y-2">
                    <img src={photoData} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                    <div className="flex gap-2">
                      <label className="flex-1 py-2 bg-gray-700 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-600 transition-colors">
                        <CameraIcon className="w-5 h-5" /> Retake
                        <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                      </label>
                      <button type="button" onClick={() => { setPhotoData(null); setPhotoFile(null) }} className="px-4 py-2 bg-trials-danger/20 text-trials-danger rounded-lg flex items-center gap-2">
                        <TrashIcon className="w-4 h-4" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="flex-1 py-4 bg-trials-accent/20 border-2 border-dashed border-trials-accent rounded-lg hover:bg-trials-accent/30 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                      <CameraIcon className="w-6 h-6" /> Take Photo
                      <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                    </label>
                    <label className="flex-1 py-4 bg-gray-700/50 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-center gap-2">
                      <UploadIcon className="w-6 h-6" /> Upload
                      <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="flex-1 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors">
                  {editingId ? 'Save Changes' : 'Add Competitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && settings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-display font-bold text-trials-orange mb-6">Event Settings</h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Event Name</label>
                <input type="text" value={settings.event_name} onChange={e => setSettings({ ...settings, event_name: e.target.value })}
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Event Date</label>
                <input type="date" value={settings.event_date || ''} onChange={e => setSettings({ ...settings, event_date: e.target.value })}
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none" />
              </div>

              {/* Sections editor */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-400">Sections</label>
                  <button type="button" onClick={addSection} className="text-xs px-2 py-1 bg-trials-accent/30 text-trials-accent rounded hover:bg-trials-accent/50">+ Add</button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {settings.sections.map(sec => (
                    <div key={sec.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={sec.name}
                        onChange={e => renameSection(sec.id, e.target.value)}
                        className="flex-1 px-2 py-1 bg-trials-darker border border-gray-700 rounded text-sm focus:border-trials-orange focus:outline-none"
                      />
                      <button type="button" onClick={() => removeSection(sec.id)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classes editor */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-400">Classes</label>
                  <button type="button" onClick={addClass} className="text-xs px-2 py-1 bg-trials-accent/30 text-trials-accent rounded hover:bg-trials-accent/50">+ Add</button>
                </div>
                <div className="space-y-3">
                  {settings.classes.map(cls => (
                    <div key={cls.id} className="bg-trials-darker rounded-lg p-3 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="color"
                          value={cls.color}
                          onChange={e => updateClass(cls.id, { color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={cls.name}
                          onChange={e => updateClass(cls.id, { name: e.target.value })}
                          className="flex-1 px-2 py-1 bg-trials-dark border border-gray-700 rounded text-sm focus:border-trials-orange focus:outline-none"
                        />
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">Laps:</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={cls.laps}
                            onChange={e => updateClass(cls.id, { laps: parseInt(e.target.value) || 1 })}
                            className="w-12 px-1 py-1 bg-trials-dark border border-gray-700 rounded text-sm text-center focus:border-trials-orange focus:outline-none"
                          />
                        </div>
                        <button type="button" onClick={() => removeClass(cls.id)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {settings.sections.map(sec => {
                          const active = cls.section_ids.includes(sec.id)
                          return (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => toggleClassSection(cls.id, sec.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                active ? 'border-white/50 text-black' : 'border-gray-600 text-gray-500 hover:text-gray-300'
                              }`}
                              style={active ? { backgroundColor: cls.color } : {}}
                            >
                              {sec.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export/Import */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <label className="block text-sm text-gray-400 mb-2">Event Backup</label>
                <div className="flex gap-2 mb-2">
                  <a href={getExportEventUrl()} download className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center justify-center gap-2">
                    <DownloadIcon className="w-4 h-4" /> Export Event
                  </a>
                  <a href={getExportCsvUrl()} download className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center justify-center gap-2">
                    <FileSpreadsheetIcon className="w-4 h-4" /> Export CSV
                  </a>
                </div>
                <label className={`w-full py-2 bg-trials-accent/20 border border-trials-accent rounded-lg hover:bg-trials-accent/30 transition-colors text-sm cursor-pointer flex items-center justify-center gap-2 ${importing ? 'opacity-50' : ''}`}>
                  {importing ? <><LoaderIcon className="w-4 h-4 animate-spin" /> Importing...</> : <><UploadIcon className="w-4 h-4" /> Import Event Backup</>}
                  <input type="file" accept=".zip,application/zip" onChange={handleImportEvent} disabled={importing} className="hidden" />
                </label>
              </div>

              {/* Danger Zone */}
              <div className="border-t border-red-900/50 pt-4 mt-4">
                <label className="block text-sm text-red-400 mb-2">Danger Zone</label>
                <button type="button" onClick={handleDeleteAllScores} onBlur={() => deleteConfirmStep === 1 && setDeleteConfirmStep(0)} disabled={deleteConfirmStep === 2}
                  className={`w-full py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 ${deleteConfirmStep === 0 ? 'bg-red-900/30 border border-red-900 text-red-400 hover:bg-red-900/50' : deleteConfirmStep === 1 ? 'bg-red-600 border border-red-500 text-white animate-pulse' : 'bg-red-900/50 text-red-300 opacity-50'}`}>
                  <TrashIcon className="w-4 h-4" />
                  {deleteConfirmStep === 0 && 'Delete All Scores'}
                  {deleteConfirmStep === 1 && 'Click again to confirm!'}
                  {deleteConfirmStep === 2 && 'Deleting...'}
                </button>
                {deleteConfirmStep === 1 && <p className="text-xs text-red-400 mt-1 text-center">This will permanently delete all scores. Cannot be undone.</p>}
                <button type="button" onClick={handleDeleteAll} onBlur={() => deleteAllStep === 1 && setDeleteAllStep(0)} disabled={deleteAllStep === 2}
                  className={`w-full py-2 mt-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 ${deleteAllStep === 0 ? 'bg-red-900/30 border border-red-900 text-red-400 hover:bg-red-900/50' : deleteAllStep === 1 ? 'bg-red-600 border border-red-500 text-white animate-pulse' : 'bg-red-900/50 text-red-300 opacity-50'}`}>
                  <TrashIcon className="w-4 h-4" />
                  {deleteAllStep === 0 && 'Delete All Data'}
                  {deleteAllStep === 1 && 'Click again to confirm!'}
                  {deleteAllStep === 2 && 'Deleting...'}
                </button>
                {deleteAllStep === 1 && <p className="text-xs text-red-400 mt-1 text-center">This will delete ALL competitors, scores, and photos. Cannot be undone.</p>}
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
                <button type="submit" disabled={savingSettings} className="flex-1 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors disabled:opacity-50">
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function getScoreCellColor(points: number): string {
  if (points === 0) return 'bg-trials-success/20 text-trials-success'
  if (points === 1) return 'bg-emerald-400/20 text-emerald-400'
  if (points === 2) return 'bg-yellow-400/20 text-yellow-400'
  if (points === 3) return 'bg-orange-500/20 text-orange-500'
  if (points === 5) return 'bg-red-500/20 text-red-500'
  if (points === 20) return 'bg-gray-700/50 text-gray-500'
  return 'text-gray-400'
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
        <h3 className="text-xl font-display font-bold mb-2" style={{ color }}>{title}</h3>
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
      <h3 className="text-xl font-display font-bold mb-3" style={{ color }}>{title}</h3>
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
