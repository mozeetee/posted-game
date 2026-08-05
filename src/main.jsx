import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HostDashboard from './HostDashboard'
import PlayerRoom from './PlayerRoom'
import BigScreen from './BigScreen'
import BrideSurvey from './BrideSurvey'
import GuestSurvey from './GuestSurvey'

// Read the query string defensively. Links we share (host/player/screen/bride)
// all separate params with "&", and email/messaging/notes apps sometimes mangle
// that on the way to a customer — HTML-encoding "&" as "&amp;", or wedging a
// stray ";" after each param name (e.g. "?game=X&role;=host&key;=abc"). Either
// way a plain parser then sees a param named "amp;role" or "role;" instead of
// "role", the app can't tell it's a host link, and it falls back to the admin
// dashboard. Normalizing here makes a garbled link still open the right view.
function getParams() {
  let search = (typeof window !== 'undefined' ? window.location.search : '') || ''
  search = search
    .replace(/&amp;/gi, '&') // undo HTML-entity-encoded ampersands
    .replace(/;(?==)/g, '')  // stray ";" right before "="  → role;=host  → role=host
    .replace(/;(?=&)/g, '')  // stray ";" right before "&"
    .replace(/;$/,'')        // trailing ";"
  return new URLSearchParams(search)
}

function App() {
  const params = getParams()
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

  // ?game=XXX&role=bride&key=SECRET → private survey for the bride to fill in
  // her real answers before the host builds the Bride Edition trivia.
  if (role === 'bride' && gameId) {
    return <BrideSurvey gameId={gameId} surveyKey={params.get('key') || ''} />
  }

  // ?game=XXX&role=guest&key=SECRET → the Social Media edition's guest survey,
  // where each guest digs up and submits their OWN posts for the host to build
  // into the game (an alternative to the host sourcing every post themselves).
  if (role === 'guest' && gameId) {
    return <GuestSurvey gameId={gameId} surveyKey={params.get('key') || ''} />
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
