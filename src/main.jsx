import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom'
import HostDashboard from './HostDashboard'
import PlayerRoom from './PlayerRoom'
import BigScreen from './BigScreen'

function App() {
  const [params] = useSearchParams()
  const role = params.get('role')
  const gameId = params.get('game')

  // If URL has ?game=XXX&role=player → show player view
  // Optional &name=Sarah pre-fills the guest's name on the join screen
  if (role === 'player' && gameId) {
    return <PlayerRoom gameId={gameId} initialName={params.get('name') || ''} />
  }

  // ?game=XXX&role=screen → read-only TV/big-screen view for the whole room
  if (role === 'screen' && gameId) {
    return <BigScreen gameId={gameId} />
  }

  // ?game=XXX&role=host&key=SECRET → host view locked to one game
  // (the customer can edit and run their game but not see the admin portal)
  if (role === 'host' && gameId) {
    return <HostDashboard hostGameId={gameId} hostAccessKey={params.get('key') || ''} />
  }

  // Otherwise → admin dashboard (all games)
  return <HostDashboard />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>
)
