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
  getLeaderboard,
  getAuthRequired,
  verifyPin,
  getExportJsonUrl,
  getExportCsvUrl,
  importJson,
  type Competitor,
  type Settings,
  type Score,
  type LeaderboardEntry
} from '../api'
import { UserIcon, SettingsIcon, PlusIcon, CameraIcon, UploadIcon, TrashIcon, HistoryIcon, FileJsonIcon, FileSpreadsheetIcon, DownloadIcon, LoaderIcon } from '../components/Icons'
import PinModal, { getPinCookie } from '../components/PinModal'

const CLASSES = [
  { value: 'kids', label: 'Kids' },
  { value: 'clubman', label: 'Clubman' },
  { value: 'advanced', label: 'Advanced' }
]

type ClassFilter = 'all' | 'kids' | 'clubman' | 'advanced' | 'enduro'

const CLASS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  kids: { bg: 'bg-yellow-400', text: 'text-yellow-400', border: 'border-yellow-400' },
  clubman: { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500' },
  advanced: { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
  enduro: { bg: 'bg-gray-800', text: 'text-gray-300', border: 'border-gray-500' }
}

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
  const [classFilter, setClassFilter] = useState<ClassFilter>('all')

  // Auth state
  const [needsAuth, setNeedsAuth] = useState(false)

  // Log data
  const [allScores, setAllScores] = useState<Score[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [logTab, setLogTab] = useState<'timeline' | 'standings'>('timeline')

  // Form state
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [primaryClass, setPrimaryClass] = useState('clubman')
  const [enduroTrial, setEnduroTrial] = useState(false)
  const [photoData, setPhotoData] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const required = await getAuthRequired()
      if (!required.manager) {
        // No PIN required
        loadData()
        return
      }

      // Check cookie
      const savedPin = getPinCookie('manager')
      if (savedPin) {
        const result = await verifyPin(savedPin, 'manager')
        if (result.valid) {
          loadData()
          return
        }
      }

      // Need to show PIN modal
      setNeedsAuth(true)
      setLoading(false)
    } catch {
      // If auth check fails, allow access (for backwards compatibility)
      loadData()
    }
  }

  function handleAuthSuccess() {
    setNeedsAuth(false)
    setLoading(true)
    loadData()
  }

  async function loadData() {
    try {
      const [comps, sett] = await Promise.all([getCompetitors(), getSettings()])
      setCompetitors(comps)
      setSettings(sett)
    } catch (err) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function openLog() {
    try {
      const [scores, lb] = await Promise.all([getScores(), getLeaderboard()])
      setAllScores(scores)
      setLeaderboard(lb)
      setShowLog(true)
    } catch {
      setError('Failed to load log data')
    }
  }

  function getFilteredCompetitors(): Competitor[] {
    if (classFilter === 'all') return competitors
    if (classFilter === 'enduro') return competitors.filter(c => c.enduro_trial === 1)
    return competitors.filter(c => c.primary_class === classFilter)
  }

  function resetForm() {
    setNumber('')
    setName('')
    setPrimaryClass('clubman')
    setEnduroTrial(false)
    setPhotoData(null)
    setPhotoFile(null)
    setEditingId(null)
  }

  function openAddForm() {
    resetForm()
    setShowForm(true)
  }

  function openEditForm(comp: Competitor) {
    setNumber(comp.number.toString())
    setName(comp.name)
    setPrimaryClass(comp.primary_class)
    setEnduroTrial(comp.enduro_trial === 1)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const formData = new FormData()
    formData.append('number', number)
    formData.append('name', name)
    formData.append('primary_class', primaryClass)
    formData.append('enduro_trial', enduroTrial ? 'true' : 'false')
    if (photoFile) {
      formData.append('photo', photoFile)
    }

    try {
      if (editingId) {
        await updateCompetitor(editingId, formData)
      } else {
        await createCompetitor(formData)
      }
      setShowForm(false)
      resetForm()
      loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save competitor')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this competitor and all their scores?')) return
    try {
      await deleteCompetitor(id)
      loadData()
    } catch {
      setError('Failed to delete competitor')
    }
  }

  const [savingSettings, setSavingSettings] = useState(false)
  const [importing, setImporting] = useState(false)

  async function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    setImporting(true)
    setError('')
    
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await importJson(data)
      alert(`Imported ${result.imported.competitors} competitors and ${result.imported.scores} scores`)
      // Reload data
      loadData()
      setShowSettings(false)
    } catch (err) {
      console.error('Import error:', err)
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      // Reset file input
      e.target.value = ''
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    if (savingSettings) {
      console.log('Already saving, skipping...')
      return
    }
    setSavingSettings(true)
    setError('')
    try {
      const updated = await updateSettings(settings)
      setSettings(updated)
      setShowSettings(false)
    } catch (err) {
      console.error('Settings save error:', err)
      setError('Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  function getRankedByClass(cls: string): (LeaderboardEntry & { rank: number })[] {
    let filtered: LeaderboardEntry[]
    
    if (cls === 'enduro') {
      filtered = leaderboard.filter(c => c.enduro_trial === 1)
    } else {
      filtered = leaderboard.filter(c => c.primary_class === cls)
    }

    const isEnduro = cls === 'enduro'
    const sorted = [...filtered].sort((a, b) => {
      const aTotal = isEnduro ? a.enduro_total : a.main_total
      const bTotal = isEnduro ? b.enduro_total : b.main_total
      if (aTotal !== bTotal) return aTotal - bTotal
      const aSections = isEnduro ? a.enduro_sections_done : a.main_sections_done
      const bSections = isEnduro ? b.enduro_sections_done : b.main_sections_done
      return bSections - aSections
    })

    let currentRank = 1
    return sorted.map((entry, index) => {
      if (index > 0) {
        const prev = sorted[index - 1]
        const currentTotal = isEnduro ? entry.enduro_total : entry.main_total
        const prevTotal = isEnduro ? prev.enduro_total : prev.main_total
        if (currentTotal !== prevTotal) {
          currentRank = index + 1
        }
      }
      return { ...entry, rank: currentRank }
    })
  }

  // Show PIN modal if needed
  if (needsAuth) {
    return <PinModal role="manager" onSuccess={handleAuthSuccess} />
  }

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
            <button
              onClick={openLog}
              className="p-2 sm:px-4 sm:py-2 bg-trials-dark border border-gray-600 rounded-lg hover:border-trials-success transition-colors flex items-center gap-2"
              title="Log"
            >
              <HistoryIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Log</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 sm:px-4 sm:py-2 bg-trials-dark border border-gray-600 rounded-lg hover:border-trials-accent transition-colors flex items-center gap-2"
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={openAddForm}
              className="p-2 sm:px-4 sm:py-2 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors flex items-center gap-2"
              title="Add"
            >
              <PlusIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* Class filter tabs */}
      <div className="bg-trials-dark/50 border-b border-gray-800 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 flex gap-1 sm:gap-2 min-w-max">
          {(['all', 'kids', 'clubman', 'advanced', 'enduro'] as ClassFilter[]).map(cls => (
            <button
              key={cls}
              onClick={() => setClassFilter(cls)}
              className={`px-2 sm:px-4 py-2 font-display text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
                classFilter === cls
                  ? cls === 'all'
                    ? 'bg-white text-trials-darker'
                    : `${CLASS_COLORS[cls].bg} text-trials-darker`
                  : 'bg-trials-dark text-gray-400 hover:text-white'
              }`}
            >
              {cls === 'all' ? 'ALL' : cls === 'enduro' ? 'END' : cls.substring(0, 3).toUpperCase()}
              <span className="ml-1 sm:ml-2 text-xs opacity-70">
                ({cls === 'all' ? competitors.length : 
                  cls === 'enduro' ? competitors.filter(c => c.enduro_trial === 1).length :
                  competitors.filter(c => c.primary_class === cls).length})
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

        {/* Competitors List */}
        <div className="grid gap-4">
          {filteredCompetitors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-xl mb-4">
                {classFilter === 'all' ? 'No competitors registered yet' : `No ${classFilter === 'enduro' ? 'Enduro Trial' : classFilter} competitors`}
              </p>
              {classFilter === 'all' && (
                <button
                  onClick={openAddForm}
                  className="px-6 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg"
                >
                  Add First Competitor
                </button>
              )}
            </div>
          ) : (
            filteredCompetitors.map(comp => (
              <div
                key={comp.id}
                className="bg-trials-dark rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 border border-gray-800 hover:border-trials-orange/50 transition-colors"
              >
                {/* Photo */}
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                  {comp.photo_url ? (
                    <img src={comp.photo_url} alt={comp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <UserIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 sm:gap-3">
                    <span className="text-xl sm:text-3xl font-display font-bold text-trials-orange">#{comp.number}</span>
                    <span className="text-base sm:text-xl font-semibold truncate">{comp.name}</span>
                  </div>
                  <div className="flex gap-1 sm:gap-2 mt-1 flex-wrap">
                    <span className={`px-2 py-0.5 text-xs sm:text-sm rounded capitalize ${
                      comp.primary_class === 'kids' ? 'bg-yellow-400/20 text-yellow-400' :
                      comp.primary_class === 'advanced' ? 'bg-red-500/20 text-red-500' :
                      'bg-emerald-500/20 text-emerald-500'
                    }`}>
                      {comp.primary_class}
                    </span>
                    {comp.enduro_trial === 1 && (
                      <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs sm:text-sm rounded">
                        Enduro
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 sm:gap-2 shrink-0">
                  <button
                    onClick={() => openEditForm(comp)}
                    className="px-2 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(comp.id)}
                    className="p-2 sm:px-4 sm:py-2 bg-trials-danger/20 hover:bg-trials-danger/40 text-trials-danger rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-4 h-4 sm:hidden" />
                    <span className="hidden sm:inline">Delete</span>
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
            {/* Log Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-trials-orange">Event Log</h2>
              <button
                onClick={() => setShowLog(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Tab buttons */}
            <div className="p-4 border-b border-gray-700 flex gap-2">
              <button
                onClick={() => setLogTab('timeline')}
                className={`px-4 py-2 rounded-lg font-display font-bold transition-colors ${
                  logTab === 'timeline' ? 'bg-trials-accent text-trials-darker' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Score Timeline
              </button>
              <button
                onClick={() => setLogTab('standings')}
                className={`px-4 py-2 rounded-lg font-display font-bold transition-colors ${
                  logTab === 'standings' ? 'bg-trials-accent text-trials-darker' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Final Standings
              </button>
            </div>

            {/* Log Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {logTab === 'timeline' ? (
                <div className="space-y-2">
                  {allScores.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No scores recorded yet</p>
                  ) : (
                    allScores.map(score => (
                      <div key={score.id} className="flex items-center gap-4 bg-trials-darker rounded-lg p-3">
                        <div className="text-sm text-gray-500 w-40">
                          {new Date(score.created_at).toLocaleString()}
                        </div>
                        <div className="flex-1">
                          <span className="font-display font-bold text-trials-orange">#{score.competitor_number}</span>
                          <span className="ml-2">{score.competitor_name}</span>
                        </div>
                        <div className="text-gray-400">
                          {score.section_name} • Lap {score.lap}
                        </div>
                        <div className={`w-10 h-10 rounded flex items-center justify-center font-bold ${getScoreColor(score.points, !!score.is_dnf)}`}>
                          {score.is_dnf ? 'X' : score.points}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Kids standings */}
                  <StandingsTable 
                    title="Kids" 
                    entries={getRankedByClass('kids')} 
                    colorClass="text-yellow-400"
                    isEnduro={false}
                  />
                  
                  {/* Clubman standings */}
                  <StandingsTable 
                    title="Clubman" 
                    entries={getRankedByClass('clubman')} 
                    colorClass="text-emerald-500"
                    isEnduro={false}
                  />
                  
                  {/* Advanced standings */}
                  <StandingsTable 
                    title="Advanced" 
                    entries={getRankedByClass('advanced')} 
                    colorClass="text-red-500"
                    isEnduro={false}
                  />
                  
                  {/* Enduro standings */}
                  <StandingsTable 
                    title="Enduro Trial" 
                    entries={getRankedByClass('enduro')} 
                    colorClass="text-gray-300"
                    isEnduro={true}
                  />
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
              {/* Number */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bib Number</label>
                <input
                  type="number"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  required
                  min="1"
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none text-xl font-display"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none"
                />
              </div>

              {/* Class */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Class</label>
                <select
                  value={primaryClass}
                  onChange={e => setPrimaryClass(e.target.value)}
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none"
                >
                  {CLASSES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Enduro Trial */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enduroTrial}
                  onChange={e => setEnduroTrial(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-trials-darker text-trials-orange focus:ring-trials-orange"
                />
                <span>Also competing in Enduro Trial</span>
              </label>

              {/* Photo */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Photo</label>
                
                {photoData ? (
                  <div className="space-y-2">
                    <img src={photoData} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                    <div className="flex gap-2">
                      <label className="flex-1 py-2 bg-gray-700 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-600 transition-colors">
                        <CameraIcon className="w-5 h-5" /> Retake
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoCapture}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => { setPhotoData(null); setPhotoFile(null) }}
                        className="px-4 py-2 bg-trials-danger/20 text-trials-danger rounded-lg flex items-center gap-2"
                      >
                        <TrashIcon className="w-4 h-4" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="flex-1 py-4 bg-trials-accent/20 border-2 border-dashed border-trials-accent rounded-lg hover:bg-trials-accent/30 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                      <CameraIcon className="w-6 h-6" /> Take Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                    </label>
                    <label className="flex-1 py-4 bg-gray-700/50 border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-center gap-2">
                      <UploadIcon className="w-6 h-6" /> Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="flex-1 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors"
                >
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
          <div className="bg-trials-dark rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-display font-bold text-trials-orange mb-6">Event Settings</h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Event Name</label>
                <input
                  type="text"
                  value={settings.event_name}
                  onChange={e => setSettings({ ...settings, event_name: e.target.value })}
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Event Date</label>
                <input
                  type="date"
                  value={settings.event_date || ''}
                  onChange={e => setSettings({ ...settings, event_date: e.target.value })}
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Email Backup Address</label>
                <input
                  type="email"
                  value={settings.email_backup_address || ''}
                  onChange={e => setSettings({ ...settings, email_backup_address: e.target.value })}
                  placeholder="scores@example.com"
                  className="w-full px-4 py-3 bg-trials-darker border border-gray-700 rounded-lg focus:border-trials-orange focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email_backup_enabled === 1}
                  onChange={e => setSettings({ ...settings, email_backup_enabled: e.target.checked ? 1 : 0 })}
                  className="w-5 h-5 rounded border-gray-600 bg-trials-darker text-trials-orange focus:ring-trials-orange"
                />
                <span>Enable email backup for each score</span>
              </label>

              {/* Export/Import buttons */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <label className="block text-sm text-gray-400 mb-2">Data Backup</label>
                <div className="flex gap-2 mb-2">
                  <a
                    href={getExportJsonUrl()}
                    download
                    className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <FileJsonIcon className="w-4 h-4" /> Export JSON
                  </a>
                  <a
                    href={getExportCsvUrl()}
                    download
                    className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <FileSpreadsheetIcon className="w-4 h-4" /> Export CSV
                  </a>
                </div>
                <label className={`w-full py-2 bg-trials-accent/20 border border-trials-accent rounded-lg hover:bg-trials-accent/30 transition-colors text-sm cursor-pointer flex items-center justify-center gap-2 ${importing ? 'opacity-50' : ''}`}>
                  {importing ? <><LoaderIcon className="w-4 h-4 animate-spin" /> Importing...</> : <><DownloadIcon className="w-4 h-4" /> Import JSON Backup</>}
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportJson}
                    disabled={importing}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-3 bg-trials-orange text-trials-darker font-bold rounded-lg hover:bg-trials-orange/90 transition-colors disabled:opacity-50"
                >
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

// Standings table component
function StandingsTable({ 
  title, 
  entries, 
  colorClass,
  isEnduro 
}: { 
  title: string; 
  entries: (LeaderboardEntry & { rank: number })[]; 
  colorClass: string;
  isEnduro: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div>
        <h3 className={`text-xl font-display font-bold ${colorClass} mb-2`}>{title}</h3>
        <p className="text-gray-500 text-sm">No competitors</p>
      </div>
    )
  }

  const maxSections = isEnduro ? 6 : (entries[0]?.primary_class === 'kids' ? 9 : 18)

  return (
    <div>
      <h3 className={`text-xl font-display font-bold ${colorClass} mb-3`}>{title}</h3>
      <div className="bg-trials-darker rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
              <th className="px-4 py-2 w-16">Rank</th>
              <th className="px-4 py-2 w-20">No.</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2 w-24 text-center">Sections</th>
              <th className="px-4 py-2 w-20 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {entries.map(entry => {
              const total = isEnduro ? entry.enduro_total : entry.main_total
              const sections = isEnduro ? entry.enduro_sections_done : entry.main_sections_done
              const dnf = isEnduro ? entry.enduro_dnf_count : entry.main_dnf_count

              return (
                <tr key={entry.id} className="hover:bg-gray-800/50">
                  <td className={`px-4 py-3 font-display font-bold text-lg ${
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-amber-600' :
                    'text-gray-500'
                  }`}>
                    {entry.rank}
                  </td>
                  <td className="px-4 py-3 font-display font-bold text-trials-orange">
                    #{entry.number}
                  </td>
                  <td className="px-4 py-3">{entry.name}</td>
                  <td className="px-4 py-3 text-center text-gray-400">
                    {sections}/{maxSections}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-display font-bold text-xl ${total === 0 ? 'text-trials-success' : ''}`}>
                      {total}
                    </span>
                    {dnf > 0 && <span className="text-xs text-gray-500 ml-1">({dnf}×DNF)</span>}
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
