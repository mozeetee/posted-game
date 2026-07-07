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
  // Optional &name=Sarah pre-fills the guest's name on the join screen
  if (role === 'player' && gameId) {
    return <PlayerRoom gameId={gameId} initialName={params.get('name') || ''} />
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
