import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom'
import HostDashboard from './HostDashboard'
import PlayerRoom from './PlayerRoom'

function App() {
  const [params] = useSearchParams()
  const role = params.get('role')
  const gameId = params.get('game')

  // If URL has ?game=XXX&role=player → show player view
  if (role === 'player' && gameId) {
    return <PlayerRoom gameId={gameId} />
  }

  // Otherwise → host dashboard
  return <HostDashboard />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>
)
