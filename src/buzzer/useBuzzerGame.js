import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

// Shared data layer for all three buzzer screens (TV / host / player).
//
// Loads the static board config from the games table, then subscribes to the
// two live tables (buzzer_state + buzzer_players) over Supabase Realtime so the
// screens react instantly — polling would be far too slow for a buzz-in. Every
// mutation is a SECURITY DEFINER RPC; the client never writes tables directly.
//
// role: 'tv' | 'host' | 'player'. For host, pass hostKey. For player, pass
// playerId + playerKey once joined. TV/player never receive clue answers.
export function useBuzzerGame({ gameId, role, hostKey = '', playerId = '', playerKey = '' }) {
  const [config, setConfig] = useState(null)   // { title, board, settings }
  const [state, setState] = useState(null)      // buzzer_state row
  const [players, setPlayers] = useState([])    // buzzer_players rows (join order)
  const [ready, setReady] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const refetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('buzzer_players').select('*').eq('game_id', gameId).order('joined_at')
    if (data) setPlayers(data)
  }, [gameId])

  const refetchState = useCallback(async () => {
    const { data } = await supabase
      .from('buzzer_state').select('*').eq('game_id', gameId).maybeSingle()
    if (data) setState(data)
  }, [gameId])

  // Load board config once. The host needs the real answers; the TV and player
  // screens get the answers stripped so they never leave the server to a guest.
  useEffect(() => {
    let alive = true
    supabase.from('games').select('data').eq('game_id', gameId).single().then(({ data }) => {
      if (!alive) return
      const g = data?.data
      if (!g || g.gameType !== 'buzzer') { setNotFound(true); return }
      const board = role === 'host' ? g.board : stripAnswers(g.board)
      setConfig({ title: g.title || '', board, settings: g.settings || {} })
    })
    return () => { alive = false }
  }, [gameId, role])

  // Initial state + live subscription.
  useEffect(() => {
    refetchState(); refetchPlayers()
    const ch = supabase
      .channel(`buzzer:${gameId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'buzzer_state', filter: `game_id=eq.${gameId}` },
        payload => { if (payload.new?.game_id) setState(payload.new) })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'buzzer_players', filter: `game_id=eq.${gameId}` },
        () => refetchPlayers())
      .subscribe(status => { if (status === 'SUBSCRIBED') setReady(true) })
    return () => { supabase.removeChannel(ch) }
  }, [gameId, refetchState, refetchPlayers])

  // ── Actions (thin RPC wrappers) ──────────────────────────────────────────
  const actions = {
    join: async (name, team, avatar) => {
      const { data } = await supabase.rpc('buzzer_join',
        { p_game: gameId, p_name: name, p_team: team || null, p_avatar: avatar || null })
      return data // { player_id, player_key }
    },
    pick: (cat, idx) => supabase.rpc('buzzer_pick',
      { p_game: gameId, p_actor: role === 'host' ? 'host' : playerId,
        p_key: role === 'host' ? hostKey : playerKey, p_cat: cat, p_idx: idx }),
    buzz: async () => {
      const { data } = await supabase.rpc('buzzer_buzz',
        { p_game: gameId, p_player: playerId, p_key: playerKey })
      return data === true
    },
    assignDD: (pid) => supabase.rpc('buzzer_assign_dd', { p_game: gameId, p_key: hostKey, p_player: pid }),
    wager: (amount) => supabase.rpc('buzzer_wager',
      { p_game: gameId, p_player: playerId, p_key: playerKey, p_amount: amount }),
    judge: (correct) => supabase.rpc('buzzer_judge', { p_game: gameId, p_key: hostKey, p_correct: correct }),
    pass: () => supabase.rpc('buzzer_pass', { p_game: gameId, p_key: hostKey }),
    next: () => supabase.rpc('buzzer_next', { p_game: gameId, p_key: hostKey }),
    reset: () => supabase.rpc('buzzer_reset', { p_game: gameId, p_key: hostKey }),
  }

  return { config, state, players, ready, notFound, actions, refetchState, refetchPlayers }
}

function stripAnswers(board) {
  if (!board) return board
  return { ...board, categories: board.categories.map(c => ({
    ...c, clues: c.clues.map(({ answer, ...rest }) => rest),
  })) }
}

// The clue object for the currently-selected cell (or null).
export function currentClue(config, state) {
  if (!config || !state || state.cur_cat == null) return null
  return config.board.categories[state.cur_cat]?.clues[state.cur_idx] || null
}
