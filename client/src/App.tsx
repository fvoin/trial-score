import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Manager from './pages/Manager'
import Judge from './pages/Judge'
import Display from './pages/Display'
import FinalScores from './pages/FinalScores'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/judge" element={<Judge />} />
        <Route path="/display" element={<Display />} />
        <Route path="/finalscores" element={<FinalScores />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
