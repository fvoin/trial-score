import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Manager from './pages/Manager'
import Judge from './pages/Judge'
import Display from './pages/Display'
import { ClipboardIcon, BoltIcon, TvIcon } from './components/Icons'

function Home() {
  return (
    <div className="min-h-screen bg-trials-darker flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-display font-bold text-trials-orange mb-4">
          TRIAL SCORE
        </h1>
        <p className="text-xl text-gray-400 mb-12">Moto Trials Scoring System</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
          <Link
            to="/manager"
            className="bg-trials-dark hover:bg-trials-dark/80 border-2 border-trials-orange rounded-xl p-8 transition-all hover:scale-105"
          >
            <div className="flex justify-center mb-4">
              <ClipboardIcon className="w-16 h-16 text-trials-orange" />
            </div>
            <h2 className="text-2xl font-display font-bold text-trials-orange mb-2">MANAGER</h2>
            <p className="text-gray-400">Register competitors, manage event</p>
          </Link>
          
          <Link
            to="/judge"
            className="bg-trials-dark hover:bg-trials-dark/80 border-2 border-trials-accent rounded-xl p-8 transition-all hover:scale-105"
          >
            <div className="flex justify-center mb-4">
              <BoltIcon className="w-16 h-16 text-trials-accent" />
            </div>
            <h2 className="text-2xl font-display font-bold text-trials-accent mb-2">JUDGE</h2>
            <p className="text-gray-400">Enter scores at your section</p>
          </Link>
          
          <Link
            to="/display"
            className="bg-trials-dark hover:bg-trials-dark/80 border-2 border-trials-success rounded-xl p-8 transition-all hover:scale-105"
          >
            <div className="flex justify-center mb-4">
              <TvIcon className="w-16 h-16 text-trials-success" />
            </div>
            <h2 className="text-2xl font-display font-bold text-trials-success mb-2">DISPLAY</h2>
            <p className="text-gray-400">Live scoreboard for spectators</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/judge" element={<Judge />} />
        <Route path="/display" element={<Display />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
