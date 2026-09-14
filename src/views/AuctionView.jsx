import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  SkipForward, Gavel, Users,
  TrendingDown, CheckCircle, AlertCircle, RefreshCw, RotateCcw
} from 'lucide-react'

const API = 'http://localhost:8080'
const AUCTION_DRAFT_KEY = 'cricket-auction-auction-draft'
const BIDS_KEY = 'cricket-auction-bid-snapshots'

const formatInLakhs = (amount) => {
  const value = Number(amount || 0)
  if (value >= 100) {
    const crValue = value / 100
    return `${Number.isInteger(crValue) ? crValue : crValue.toFixed(2)} Cr`
  }
  return `${value.toLocaleString('en-IN')} L`
}

const readDraft = () => {
  try {
    return JSON.parse(localStorage.getItem(AUCTION_DRAFT_KEY) || 'null')
  } catch {
    return null
  }
}

const readBidSnapshots = () => {
  try {
    return JSON.parse(localStorage.getItem(BIDS_KEY) || '[]')
  } catch {
    return []
  }
}

const normalizeSkillLevel = (skillLevel, isCaptain = false) => {
  if (isCaptain) return 'captain'

  const normalized = String(skillLevel || '').toLowerCase().trim()
  if (normalized.includes('expert')) return 'expert'
  if (normalized.includes('intermediate')) return 'intermediate'
  if (normalized.includes('beginner')) return 'beginner'
  if (normalized.includes('captain')) return 'captain'
  return 'default'
}

const getSkillStyle = (skillLevel, isCaptain = false) => {
  const level = normalizeSkillLevel(skillLevel, isCaptain)

  if (level === 'captain') {
    return {
      textColor: 'var(--gold)',
      borderColor: 'rgba(255,214,0,0.3)',
      backgroundColor: 'rgba(255,214,0,0.08)'
    }
  }

  if (level === 'expert') {
    return {
      textColor: 'var(--skill-expert)',
      borderColor: 'var(--skill-expert)',
      backgroundColor: 'var(--skill-expert-bg)'
    }
  }

  if (level === 'intermediate') {
    return {
      textColor: 'var(--skill-intermediate)',
      borderColor: 'var(--skill-intermediate)',
      backgroundColor: 'var(--skill-intermediate-bg)'
    }
  }

  if (level === 'beginner') {
    return {
      textColor: 'var(--skill-beginner)',
      borderColor: 'var(--skill-beginner)',
      backgroundColor: 'var(--skill-beginner-bg)'
    }
  }

  return {
    textColor: 'var(--text)',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg)'
  }
}

export default function AuctionView({ masterRoster, config, onDone, isReauction }) {
  const savedDraft = readDraft()
  const savedBidSnapshots = isReauction ? [] : readBidSnapshots()
  const hasValidDraftRoster = Array.isArray(savedDraft?.roster)
  const canRestoreDraft = (() => {
    if (isReauction || !hasValidDraftRoster) return false

    const draftRoster = savedDraft.roster
    if (draftRoster.length !== masterRoster.length) return false

    const masterIds = new Set(masterRoster.map(player => player.ID))
    const draftIds = new Set(draftRoster.map(player => player.ID))
    if (masterIds.size !== draftIds.size) return false
    for (const id of masterIds) {
      if (!draftIds.has(id)) return false
    }

    const draftPhase = savedDraft?.auctionPhase === 'player' ? 'player' : 'captain'
    const hasActiveDraftPlayer = draftPhase === 'captain'
      ? draftRoster.some(player => player.IsCaptain && player.Status !== 'Sold')
      : draftRoster.some(player => !player.IsCaptain && player.Status !== 'Sold' && !player.Visited)

    return hasActiveDraftPlayer
  })()
  
  // Filter roster: if re-auction, only show unsold players; otherwise show all
  const initialRoster = isReauction 
    ? masterRoster
      .filter(p => p.Status === 'Unsold')
      .map(p => ({ ...p, Visited: false }))
    : masterRoster
  
  const hasCaptains = initialRoster.some(p => p.IsCaptain && p.Status !== 'Sold')
  const [roster, setRoster] = useState(canRestoreDraft ? savedDraft.roster : initialRoster)
  const [currentPlayerID, setCurrentPlayerID] = useState(
    (canRestoreDraft && (savedDraft?.currentPlayerID || initialRoster[savedDraft?.currentIndex || 0]?.ID))
      || (hasCaptains ? initialRoster.find(p => p.IsCaptain && p.Status !== 'Sold')?.ID : initialRoster[0]?.ID)
      || initialRoster[0]?.ID
      || null
  )
  const [auctionPhase, setAuctionPhase] = useState(
    isReauction ? 'player' : (canRestoreDraft ? (savedDraft?.auctionPhase || (hasCaptains ? 'captain' : 'player')) : (hasCaptains ? 'captain' : 'player'))
  ) // 'captain' or 'player'
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(isReauction ? '' : (canRestoreDraft ? (savedDraft?.selectedTeam || '') : ''))
  const [bidAmount, setBidAmount] = useState(isReauction ? '' : (canRestoreDraft ? (savedDraft?.bidAmount || '') : ''))
  const [bidSnapshots, setBidSnapshots] = useState(Array.isArray(savedBidSnapshots) ? savedBidSnapshots : [])
  const [bidStatus, setBidStatus] = useState(null)
  const [bidMsg, setBidMsg] = useState('')
  const [imgError, setImgError] = useState(false)
  const [storageWarning, setStorageWarning] = useState({ message: '', persistent: false })
  const [phaseNotice, setPhaseNotice] = useState({ visible: false, message: '' })
  const [showCaptainTransitionConfirm, setShowCaptainTransitionConfirm] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('ok')
  const failCountRef = useRef(0)
  const warningTimerRef = useRef(null)
  const phaseNoticeTimerRef = useRef(null)
  const advanceTimerRef = useRef(null)
  const captainTransitionPendingRef = useRef(null)
  const preserveBidAmountOnNextPlayerChangeRef = useRef(false)
  const advancePlayerRef = useRef(null)
  const selectedTeamRef = useRef(selectedTeam)

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  const scheduleAdvance = (updatedRoster, previousPlayerID, delayMs) => {
    clearAdvanceTimer()
    advanceTimerRef.current = setTimeout(() => {
      advancePlayerRef.current(updatedRoster, previousPlayerID)
      advanceTimerRef.current = null
    }, delayMs)
  }

  const showToast = (message, options = {}) => {
    const persistent = Boolean(options.persistent)

    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }

    setStorageWarning({ message, persistent })

    if (!persistent) {
      warningTimerRef.current = setTimeout(() => {
        setStorageWarning({ message: '', persistent: false })
        warningTimerRef.current = null
      }, 2600)
    }
  }

  const showPhaseNotice = (message) => {
    if (phaseNoticeTimerRef.current) {
      clearTimeout(phaseNoticeTimerRef.current)
      phaseNoticeTimerRef.current = null
    }

    setPhaseNotice({ visible: true, message })
    phaseNoticeTimerRef.current = setTimeout(() => {
      setPhaseNotice({ visible: false, message: '' })
      phaseNoticeTimerRef.current = null
    }, 2600)
  }

  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      if (e?.name === 'QuotaExceededError') {
        localStorage.removeItem('cricket-auction-bid-snapshots')
        setBidSnapshots([])
        try {
          localStorage.setItem(key, value)
          showToast('Storage full — bid history cleared.', { persistent: false })
        } catch {
          showToast(
            'Storage full — bid history cleared. Auction state is safe.',
            { persistent: true }
          )
        }
      }
    }
  }

  const persistAuctionState = (nextState) => {
    safeSetItem(AUCTION_DRAFT_KEY, JSON.stringify({
      roster: nextState.roster,
      currentPlayerID: nextState.currentPlayerID,
      selectedTeam: nextState.selectedTeam,
      bidAmount: nextState.bidAmount,
      auctionPhase: nextState.auctionPhase,
      savedAt: Date.now()
    }))
  }

  useEffect(() => {
    persistAuctionState({
      roster,
      currentPlayerID,
      selectedTeam,
      bidAmount,
      auctionPhase,
      savedAt: Date.now()
    })
    safeSetItem(BIDS_KEY, JSON.stringify(bidSnapshots.slice(0, 20)))
  }, [roster, currentPlayerID, selectedTeam, bidAmount, auctionPhase, bidSnapshots])

  useEffect(() => {
    if (!isReauction && !canRestoreDraft) {
      localStorage.removeItem(AUCTION_DRAFT_KEY)
      localStorage.removeItem(BIDS_KEY)
    }
  }, [canRestoreDraft, isReauction])

  useEffect(() => {
    return () => {
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current)
      }
      if (phaseNoticeTimerRef.current) {
        clearTimeout(phaseNoticeTimerRef.current)
      }
      clearAdvanceTimer()
    }
  }, [])

  useEffect(() => {
    selectedTeamRef.current = selectedTeam
  }, [selectedTeam])

  useEffect(() => {
    if (auctionPhase !== 'captain') {
      setShowCaptainTransitionConfirm(false)
      captainTransitionPendingRef.current = null
    }
  }, [auctionPhase])

  // Filter roster based on current phase
  const phaseRoster = auctionPhase === 'captain'
    ? roster.filter(p => p.IsCaptain)
    : roster.filter(p => !p.IsCaptain)

  const activePlayers = auctionPhase === 'captain'
    ? phaseRoster.filter(p => p.Status !== 'Sold')
    : phaseRoster.filter(p => p.Status !== 'Sold' && !p.Visited)
  const isTransitioningPlayer = bidStatus === 'loading' || bidStatus === 'success'
  const playerPoolForCurrent = isTransitioningPlayer ? phaseRoster : activePlayers

  const unsoldPlayers = activePlayers.filter(p => p.Status === 'Unsold')
  const soldCount = phaseRoster.filter(p => p.Status === 'Sold').length
  const currentPlayer = playerPoolForCurrent.find(p => p.ID === currentPlayerID) || activePlayers[0] || null
  const currentPhaseIndex = phaseRoster.findIndex(p => p.ID === currentPlayerID)
  const remainingCount = Math.max(phaseRoster.length - soldCount, 0)
  const displayTotal = phaseRoster.length
  const displayPosition = ((currentPhaseIndex >= 0 ? currentPhaseIndex : 0) + 1)

  useEffect(() => {
    // During sell/transition animations, avoid clearing current player
    // or the UI can jump to the auction-complete fallback prematurely.
    if (isTransitioningPlayer) {
      return
    }

    if (activePlayers.length === 0) {
      if (auctionPhase === 'captain' && roster.some(p => !p.IsCaptain && p.Status !== 'Sold')) {
        setAuctionPhase('player')
        return
      }
      if (currentPlayerID !== null) {
        setCurrentPlayerID(null)
      }
      return
    }

    if (!activePlayers.some(player => player.ID === currentPlayerID)) {
      setCurrentPlayerID(activePlayers[0].ID)
    }
  }, [activePlayers, currentPlayerID, isTransitioningPlayer, auctionPhase, roster])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/teams`)
      failCountRef.current = 0
      setConnectionStatus('ok')
      setTeams(res.data)
      if (!selectedTeamRef.current && res.data.length > 0) {
        setSelectedTeam(res.data[0].id)
      }
    } catch {
      failCountRef.current += 1
      if (failCountRef.current >= 3) {
        setConnectionStatus('lost')
      } else {
        setConnectionStatus('retrying')
      }
    }
  }, [])

  useEffect(() => {
    fetchTeams()
    const interval = setInterval(fetchTeams, 5000)
    return () => clearInterval(interval)
  }, [fetchTeams])

  useEffect(() => {
    if (teams.length === 0) return

    const selectedTeamName = teams.find(team => team.id === selectedTeam)?.name || ''

    if (auctionPhase !== 'captain') {
      if (!selectedTeamName || selectedTeamName === '') {
        setSelectedTeam(teams[0].id)
      }
      return
    }

    const eligibleTeam = teams.find(team => !roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === team.name
    ))

    if (!eligibleTeam) return

    if (!selectedTeamName || selectedTeamName === '' || (auctionPhase === 'captain' && roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === selectedTeamName
    ))) {
      setSelectedTeam(eligibleTeam.id)
    }
  }, [auctionPhase, teams, roster, selectedTeam])

  useEffect(() => {
    setImgError(false)
    setBidStatus(null)
    setBidMsg('')
    if (preserveBidAmountOnNextPlayerChangeRef.current) {
      preserveBidAmountOnNextPlayerChangeRef.current = false
      return
    }
    setBidAmount(currentPlayer?.BasePrice ? String(currentPlayer.BasePrice) : '')
  }, [currentPlayerID, currentPlayer?.BasePrice])

  const pushBidSnapshot = (snapshot) => {
    setBidSnapshots(currentSnapshots => [snapshot, ...currentSnapshots].slice(0, 20))
  }

  const resolveCaptainTransitionChoice = (moveToPlayerAuction) => {
    const pending = captainTransitionPendingRef.current
    captainTransitionPendingRef.current = null
    setShowCaptainTransitionConfirm(false)

    if (!pending) return

    if (moveToPlayerAuction) {
      showPhaseNotice('Moving to player auction...')
      scheduleAdvance(pending.updatedRoster, pending.previousPlayerID, 120)
    } else {
      showPhaseNotice('Finishing captain round...')
      scheduleAdvance(pending.updatedRoster, pending.previousPlayerID, 120)
    }
  }

  const reversePreviousBid = async () => {
    if (bidSnapshots.length === 0) {
      setBidStatus('error')
      setBidMsg('No previous bid to reverse')
      return
    }

    const previous = bidSnapshots[0]

    setBidStatus('loading')
    try {
      clearAdvanceTimer()
      setShowCaptainTransitionConfirm(false)
      captainTransitionPendingRef.current = null
      await axios.post(`${API}/api/reverse-bid`)

      const restoredRoster = roster.map(player =>
        player.ID === previous.changedPlayerID
          ? {
              ...player,
              Status: previous.previousPlayerState.Status,
              WinningTeam: previous.previousPlayerState.WinningTeam,
              WinningBid: previous.previousPlayerState.WinningBid,
              Round: previous.previousPlayerState.Round,
              Visited: previous.previousPlayerState.Visited
            }
          : player
      )
      const restoredPhaseForLookup = previous.auctionPhase || auctionPhase
      const restoredPhaseRoster = restoredPhaseForLookup === 'captain'
        ? restoredRoster.filter(player => player.IsCaptain && player.Status !== 'Sold')
        : restoredRoster.filter(player => !player.IsCaptain && player.Status !== 'Sold')

      preserveBidAmountOnNextPlayerChangeRef.current = true
      setRoster(restoredRoster)
      if (previous.auctionPhase && previous.auctionPhase !== auctionPhase) {
        setAuctionPhase(previous.auctionPhase)
      }
      setCurrentPlayerID(previous.currentPlayerID || restoredPhaseRoster[0]?.ID || null)
      setSelectedTeam(previous.selectedTeam)
      setBidAmount(previous.bidAmount)
      setBidSnapshots(currentSnapshots => currentSnapshots.slice(1))

      setBidStatus('success')
      setBidMsg(`Reversed bid for ${previous.playerName}`)
      await fetchTeams()
    } catch (err) {
      setBidStatus('error')
      const msg = err.response?.data?.detail
        || (typeof err.response?.data === 'string' ? err.response.data : null)
        || err.message
        || 'Could not reverse previous bid'
      setBidMsg(msg)
    }
  }

  const getPhotoUrl = (player) => {
    if (!player?.ImagePath) return ''
    const filename = decodeURIComponent(
      player.ImagePath.replace(/\\/g, '/').split('/').pop()
    )
    return filename ? `${API}/images/${filename}` : ''
  }

  const teamsWithoutCaptain = teams.filter(team => !roster.some(player =>
    player.IsCaptain &&
    player.Status === 'Sold' &&
    player.WinningTeam === team.name
  ))

  const allTeamsHaveCaptain = (rosterSnapshot) =>
    teams.length > 0 && teams.every(team => rosterSnapshot.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === team.name
    ))

  const teamHasCaptain = (teamName) =>
    roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === teamName
    )

  const handleSell = async (options = {}) => {
    const forceSell = Boolean(options.forceSell)

    if (!selectedTeam) { setBidMsg('Select a team'); setBidStatus('error'); return }
    const parsedBid = parseInt(bidAmount, 10)
    if (!currentPlayer) return
    const amount = Number.isFinite(parsedBid) && parsedBid > 0
      ? parsedBid
      : (forceSell ? currentPlayer.BasePrice : NaN)

    if (!amount || amount <= 0) {
      setBidMsg('Enter a valid bid amount')
      setBidStatus('error')
      return
    }

    if (!forceSell && amount < currentPlayer.BasePrice) {
      setBidMsg(`Minimum bid is ${formatInLakhs(currentPlayer.BasePrice)}`)
      setBidStatus('error')
      return
    }

    const team = teams.find(t => t.id === selectedTeam)
    if (!team) {
      setBidMsg('Selected team not found')
      setBidStatus('error')
      return
    }

    if (auctionPhase === 'captain' && teamHasCaptain(team.name)) {
      setBidMsg(`${team.name} already has a captain`)
      setBidStatus('error')
      return
    }

    if (!forceSell && amount > team.budget) {
      setBidMsg(`${team.name} only has ${formatInLakhs(team.budget)} left`)
      setBidStatus('error')
      return
    }

    setBidStatus('loading')
    try {
      const teamName = team.name
      const previousState = {
        changedPlayerID: currentPlayer.ID,
        previousPlayerState: {
          Status: currentPlayer.Status,
          WinningTeam: currentPlayer.WinningTeam,
          WinningBid: currentPlayer.WinningBid,
          Round: currentPlayer.Round,
          Visited: currentPlayer.Visited
        },
        currentPlayerID: currentPlayer.ID,
        selectedTeam,
        bidAmount,
        auctionPhase: auctionPhase,
        playerName: currentPlayer.Name || 'Unknown Player'
      }
      await axios.post(`${API}/api/bid`, {
        team_id: selectedTeam,
        player_id: currentPlayer.ID,
        bid_amount: amount,
        ignore_budget: forceSell
      })

      pushBidSnapshot(previousState)

      const updatedRoster = roster.map((p) => {
        if (p.ID === currentPlayer.ID) {
          return {
            ...p,
            Status: 'Sold',
            WinningTeam: teamName,
            WinningBid: amount,
            Round: isReauction ? 2 : 1
          }
        }
        return p
      })
      setRoster(updatedRoster)
      setBidStatus('success')
      setBidMsg(`${forceSell ? 'Force sold' : 'Sold'} to ${teamName} for ${formatInLakhs(amount)}!`)
      await fetchTeams()

      if (auctionPhase === 'captain' && allTeamsHaveCaptain(updatedRoster)) {
        captainTransitionPendingRef.current = {
          updatedRoster,
          previousPlayerID: currentPlayer.ID
        }
        setShowCaptainTransitionConfirm(true)
        return
      }

      scheduleAdvance(updatedRoster, currentPlayer.ID, 1200)
    } catch (err) {
      setBidStatus('error')
      const msg = err.response?.data?.detail
        || (typeof err.response?.data === 'string' ? err.response.data : null)
        || err.message
        || 'Bid failed'
      setBidMsg(msg)
    }
  }

  const handleSkip = () => {
    if (!currentPlayer) return

    if (auctionPhase === 'captain') {
      setBidStatus('skip')
      setBidMsg('Captain skipped — will appear again')
      scheduleAdvance(roster, currentPlayer.ID, 600)
      return
    }

    const updatedRoster = roster.map((p) =>
      p.ID === currentPlayer.ID ? { ...p, Status: 'Unsold', Visited: true } : p
    )
    setRoster(updatedRoster)
    setBidStatus('skip')
    setBidMsg('Player skipped')
    scheduleAdvance(updatedRoster, currentPlayer.ID, 600)
  }

  const advancePlayer = (updatedRoster, previousPlayerID = currentPlayerID) => {
    if (auctionPhase === 'captain') {
      const allCaptains = updatedRoster.filter(player => player.IsCaptain)
      const pendingCaptains = allCaptains.filter(player => player.Status !== 'Sold')

      if (allTeamsHaveCaptain(updatedRoster) || pendingCaptains.length === 0) {
        const rosterAfterCaptains = updatedRoster.map(p => {
          if (!p.IsCaptain && p.Status !== 'Sold') {
            return {
              ...p,
              Visited: false
            }
          }

          if (p.IsCaptain && p.Status === 'Unsold') {
            return {
              ...p,
              IsCaptain: false,
              SkillLevel: 'Expert',
              BasePrice: 6,
              Visited: false
            }
          }
          return p
        })

        setRoster(rosterAfterCaptains)
        setAuctionPhase('player')
        const firstPlayer = rosterAfterCaptains.find(player =>
          !player.IsCaptain && player.Status !== 'Sold' && !player.Visited
        )
        const fallbackPlayer = rosterAfterCaptains.find(player =>
          !player.IsCaptain && player.Status !== 'Sold'
        )
        const nextPlayer = firstPlayer || fallbackPlayer
        if (nextPlayer) {
          setCurrentPlayerID(nextPlayer.ID)
        } else {
          onDone(rosterAfterCaptains)
        }
        setSelectedTeam('')
        setBidAmount('')
        return
      }

      if (pendingCaptains.length > 0) {
        const currentPosition = allCaptains.findIndex(player => player.ID === previousPlayerID)
        let nextPosition = currentPosition >= 0 ? currentPosition + 1 : 0

        while (nextPosition < allCaptains.length && allCaptains[nextPosition].Status === 'Sold') {
          nextPosition++
        }

        if (nextPosition >= allCaptains.length) {
          nextPosition = 0
          while (nextPosition < allCaptains.length && allCaptains[nextPosition].Status === 'Sold') {
            nextPosition++
          }
        }

        setCurrentPlayerID(allCaptains[nextPosition]?.ID || pendingCaptains[0].ID)
        return
      }

      setAuctionPhase('player')
      return
    }

    const phasePlayers = updatedRoster.filter(p => !p.IsCaptain)

    const currentPos = phasePlayers.findIndex(p => p.ID === previousPlayerID)
    let next = currentPos >= 0 ? currentPos + 1 : 0

    // First pass: find next unvisited, unsold player
    while (next < phasePlayers.length && (phasePlayers[next].Status === 'Sold' || phasePlayers[next].Visited)) {
      next++
    }

    if (next < phasePlayers.length) {
      // Found a fresh player, go to them
      setCurrentPlayerID(phasePlayers[next].ID)
      return
    }

    // No fresh players left — check if any skipped (Visited + Unsold) players remain
    const skippedPlayers = phasePlayers.filter(p => p.Visited && p.Status !== 'Sold')

    if (skippedPlayers.length === 0) {
      // Truly done — no fresh, no skipped
      onDone(updatedRoster)
      return
    }

    // Re-queue skipped players by resetting their Visited flag
    const rosterWithSkippedReset = updatedRoster.map(p =>
      (!p.IsCaptain && p.Visited && p.Status !== 'Sold')
        ? { ...p, Visited: false }
        : p
    )
    setRoster(rosterWithSkippedReset)
    setCurrentPlayerID(skippedPlayers[0].ID)
  }

  const progress = phaseRoster.length > 0 ? Math.round((soldCount / phaseRoster.length) * 100) : 100
  const isActionLocked = bidStatus === 'loading' || bidStatus === 'success' || bidStatus === 'skip'

  advancePlayerRef.current = advancePlayer

  if (!currentPlayer) {
    if (auctionPhase === 'captain' && roster.some(p => !p.IsCaptain && p.Status !== 'Sold')) {
      setTimeout(() => setAuctionPhase('player'), 50)
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', color: 'var(--green)' }}>LOADING PLAYERS...</h2>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
          <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', color: 'var(--gold)' }}>AUCTION COMPLETE</h2>
          <button onClick={() => onDone(roster)} style={btnStyle('var(--gold)', '#000')}>
            GENERATE REPORT →
          </button>
        </div>
      </div>
    )
  }

  const photoUrl = getPhotoUrl(currentPlayer)
  const playerByID = new Map(masterRoster.map(player => [player.ID, player]))
  roster.forEach(player => {
    playerByID.set(player.ID, player)
  })

  const initials = (currentPlayer.Name || 'P')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const quickBidIncrements = [1, 2, 5, 10]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden'
    }}>
      {/* ── TOP ZONE: Player Showcase Card (45%) + Bidding Console (55%) ── */}
      <div style={{
        height: '35%',
        minHeight: '230px',
        maxHeight: '360px',
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: '45% 1fr',
        padding: '10px 14px',
        gap: '12px',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        {/* Left: Player Showcase Card (45% width) */}
        <div style={{
          minWidth: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden'
        }}>
          {/* Header row: Phase badge + counts + progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: auctionPhase === 'captain' ? 'var(--gold)' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span>{auctionPhase === 'captain' ? '👑 CAPTAIN AUCTION' : '🎯 PLAYER AUCTION'}</span>
                <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                  ({displayPosition} of {displayTotal})
                </span>
              </span>
              <span style={{ color: 'var(--green)', fontSize: '0.72rem', fontWeight: 600 }}>
                {soldCount} Sold · {remainingCount} Remaining
              </span>
            </div>
            <div style={{ height: '3px', background: 'var(--bg3)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--green)',
                borderRadius: '2px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          {/* Main Hero row: Photo + Details */}
          <div key={currentPlayerID || 'no-player'} className="pop" style={{
            display: 'flex',
            gap: '14px',
            alignItems: 'center',
            flex: 1,
            minHeight: 0,
            marginTop: '8px'
          }}>
            {/* Player Photo / Card Avatar */}
            <div style={{
              width: '125px',
              height: '100%',
              maxHeight: '190px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'linear-gradient(145deg, var(--bg3) 0%, var(--bg2) 100%)',
              position: 'relative',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {photoUrl && !imgError ? (
                <img
                  src={photoUrl}
                  alt={currentPlayer.Name}
                  onError={() => setImgError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '2.8rem', color: 'var(--gold)', lineHeight: 1 }}>
                    {initials}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: '2px' }}>
                    CRICKET
                  </div>
                </div>
              )}

              {/* Captain badge top-left */}
              {currentPlayer.IsCaptain && (
                <div style={{
                  position: 'absolute', top: '6px', left: '6px',
                  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,214,0,0.5)',
                  borderRadius: '100px', padding: '1px 6px',
                  fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 700
                }}>
                  👑 CAPTAIN
                </div>
              )}

              {/* Role banner bottom */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
                padding: '16px 4px 4px',
                textAlign: 'center',
                fontFamily: 'Bebas Neue', fontSize: '0.82rem',
                color: 'var(--gold)', letterSpacing: '0.1em'
              }}>
                {currentPlayer.Role || 'PLAYER'}
              </div>
            </div>

            {/* Details Column */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{
                fontFamily: 'Bebas Neue',
                fontSize: 'clamp(2.2rem, 3vw, 2.8rem)',
                lineHeight: 1,
                color: 'var(--text)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: '4px'
              }}>
                {currentPlayer.Name || 'Unknown Player'}
              </div>

              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginBottom: '8px' }}>
                {currentPlayer.ID} · {currentPlayer.Email}
              </div>

              {/* 4 Stat Badges */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <StatChip
                  label="SKILL LEVEL"
                  value={currentPlayer.IsCaptain ? 'Captain' : (currentPlayer.SkillLevel || 'N/A')}
                  skillStyle={getSkillStyle(currentPlayer.SkillLevel, currentPlayer.IsCaptain)}
                />
                <StatChip label="PLAYING ROLE" value={currentPlayer.Role || 'N/A'} />
                <StatChip label="BASE PRICE" value={formatInLakhs(currentPlayer.BasePrice)} highlight />
                <StatChip label="STATUS" value={currentPlayer.Status} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Bidding Console Card (60% width cockpit) */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              fontFamily: 'Bebas Neue', fontSize: '1.05rem',
              color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <Gavel size={15} /> BIDDING CONSOLE
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '0.68rem',
              color: connectionStatus === 'ok' ? 'var(--green)' :
                     connectionStatus === 'retrying' ? 'var(--gold)' : 'var(--red)'
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block',
                background: connectionStatus === 'ok' ? 'var(--green)' :
                             connectionStatus === 'retrying' ? 'var(--gold)' : 'var(--red)'
              }} />
              {connectionStatus === 'ok' ? 'Connected' :
               connectionStatus === 'retrying' ? 'Reconnecting...' : 'Lost'}
            </div>
          </div>

          {/* Console Body: 2 Sub-Columns (Inputs & Increments on left, Big Actions on right) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '16px', alignItems: 'center', flex: 1, minHeight: 0 }}>
            {/* Left Sub-Col: Team & Bid Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                    WINNING TEAM
                  </label>
                  <select
                    className="themed-control"
                    value={selectedTeam}
                    onChange={e => setSelectedTeam(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 8px',
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      borderRadius: '7px', color: 'var(--text)',
                      fontSize: '0.85rem', fontFamily: 'DM Sans', outline: 'none'
                    }}
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.id} disabled={auctionPhase === 'captain' && teamHasCaptain(t.name)}>
                        {t.name} ({formatInLakhs(t.budget)}){auctionPhase === 'captain' && teamHasCaptain(t.name) ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                    BID AMOUNT (L)
                  </label>
                  <input
                    className="themed-control"
                    type="number"
                    value={bidAmount}
                    onChange={e => setBidAmount(e.target.value)}
                    placeholder={`Min ${formatInLakhs(currentPlayer.BasePrice)}`}
                    min={currentPlayer.BasePrice}
                    step={1}
                    style={{
                      width: '100%', padding: '7px 8px',
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      borderRadius: '7px', color: 'var(--text)',
                      fontSize: '0.85rem', fontFamily: 'DM Sans', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Quick Bid Increment Buttons */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted)', marginRight: '2px' }}>QUICK:</span>
                {[1, 2, 5, 10, 20].map(inc => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(bidAmount, 10) || parseInt(currentPlayer?.BasePrice, 10) || 0
                      setBidAmount(String(cur + inc))
                    }}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: '5px',
                      color: 'var(--text)',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    +{inc}L
                  </button>
                ))}
              </div>

              {/* Bid Alert message */}
              {bidMsg && (
                <div style={{
                  padding: '5px 8px', borderRadius: '6px', fontSize: '0.74rem',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: bidStatus === 'success' ? 'rgba(0,200,83,0.1)' :
                              bidStatus === 'error' ? 'rgba(255,61,61,0.1)' : 'rgba(255,214,0,0.1)',
                  border: `1px solid ${bidStatus === 'success' ? 'rgba(0,200,83,0.3)' :
                                        bidStatus === 'error' ? 'rgba(255,61,61,0.3)' : 'rgba(255,214,0,0.3)'}`,
                  color: bidStatus === 'success' ? 'var(--green)' :
                         bidStatus === 'error' ? 'var(--red)' : 'var(--gold)'
                }}>
                  {bidStatus === 'success' ? <CheckCircle size={12} /> :
                   bidStatus === 'error' ? <AlertCircle size={12} /> : <SkipForward size={12} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bidMsg}</span>
                </div>
              )}
            </div>

            {/* Right Sub-Col: Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', justifyContent: 'center' }}>
              <button
                onClick={() => handleSell()}
                disabled={isActionLocked}
                style={{
                  ...btnStyle('var(--green)', '#000'),
                  width: '100%',
                  padding: '11px 16px',
                  fontSize: '1.1rem',
                  opacity: isActionLocked ? 0.6 : 1
                }}
              >
                <Gavel size={16} />
                {bidStatus === 'loading' ? 'PROCESSING...' : 'SELL'}
              </button>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleSkip}
                  disabled={isActionLocked}
                  style={{
                    ...btnStyle('var(--bg3)', 'var(--muted)'),
                    flex: 1,
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    opacity: isActionLocked ? 0.4 : 1
                  }}
                >
                  <SkipForward size={14} />
                  SKIP
                </button>

                {isReauction && (
                  <button
                    onClick={() => handleSell({ forceSell: true })}
                    disabled={isActionLocked}
                    style={{
                      ...btnStyle('var(--gold)', '#111'),
                      flex: 1.1,
                      padding: '8px 8px',
                      opacity: isActionLocked ? 0.6 : 1
                    }}
                    title="Force sell — ignores budget"
                  >
                    <Gavel size={14} /> FORCE
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2px' }}>
                <button
                  onClick={reversePreviousBid}
                  disabled={isActionLocked || bidSnapshots.length === 0}
                  style={{
                    background: 'none', border: 'none',
                    color: (isActionLocked || bidSnapshots.length === 0) ? 'var(--muted)' : 'var(--text)',
                    cursor: (isActionLocked || bidSnapshots.length === 0) ? 'not-allowed' : 'pointer',
                    fontSize: '0.72rem', display: 'flex', alignItems: 'center',
                    gap: '4px', padding: '0',
                    opacity: (isActionLocked || bidSnapshots.length === 0) ? 0.4 : 1,
                    fontFamily: 'DM Sans'
                  }}
                >
                  <RotateCcw size={11} />
                  Reverse previous bid {bidSnapshots.length > 0 ? `(${bidSnapshots.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ZONE: 10 Teams Standings (5×2 Grid) ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 14px 12px',
        gap: '8px',
        overflow: 'hidden'
      }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em' }}>
              TEAM STANDINGS (10 TEAMS)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {storageWarning.message && (
              <span style={{
                color: storageWarning.persistent ? 'var(--red)' : 'var(--gold)',
                fontSize: '0.72rem'
              }}>{storageWarning.message}</span>
            )}
            <button
              onClick={fetchTeams}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}
              title="Refresh teams"
            >
              <RefreshCw size={12} />
            </button>
            <button
              onClick={() => onDone(roster)}
              style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--muted)', cursor: 'pointer',
                padding: '3px 10px', borderRadius: '6px',
                fontSize: '0.72rem', fontFamily: 'Bebas Neue',
                letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <TrendingDown size={11} /> END AUCTION & EXPORT
            </button>
          </div>
        </div>

        {/* 5-column × 2-row team grid — Fills 100% of remaining height */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: '10px',
          flex: 1,
          minHeight: 0
        }}>
          {teams.map(team => {
            const pct = Math.round((team.budget / (config?.basePurse || 100)) * 100)
            const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : 'var(--red)'
            const isSelected = selectedTeam === team.id
            const rosterList = team.roster || []

            return (
              <div
                key={team.id}
                onClick={() => setSelectedTeam(team.id)}
                style={{
                  background: isSelected ? 'var(--grad-selected-card)' : 'var(--card)',
                  border: isSelected ? '2px solid var(--green)' : '1px solid var(--border)',
                  boxShadow: isSelected ? '0 0 14px rgba(34, 197, 94, 0.18)' : 'none',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Team Name + Budget */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{
                    fontWeight: 700, fontSize: '0.88rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: 'var(--text)', flex: 1, minWidth: 0
                  }}>
                    {team.name}
                  </div>
                  <div style={{
                    fontFamily: 'Bebas Neue', fontSize: '1.25rem',
                    color: barColor, flexShrink: 0, lineHeight: 1
                  }}>
                    {formatInLakhs(team.budget)}
                  </div>
                </div>

                {/* Sub-bar: Player count + purse % */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  color: 'var(--muted)', fontSize: '0.68rem', marginTop: '2px'
                }}>
                  <span>{rosterList.length} player{rosterList.length === 1 ? '' : 's'}</span>
                  <span>{pct}% purse</span>
                </div>

                {/* Progress bar */}
                <div style={{ height: '3px', background: 'var(--bg)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px', marginBottom: '6px' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: barColor, borderRadius: '2px',
                    transition: 'width 0.4s ease'
                  }} />
                </div>

                {/* Progressive Roster Area */}
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {rosterList.length === 0 ? (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--muted)', fontSize: '0.72rem', fontStyle: 'italic',
                      border: '1px dashed var(--border)', borderRadius: '6px', opacity: 0.65
                    }}>
                      No players acquired yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start' }}>
                      {rosterList.map(kid => {
                        const player = playerByID.get(kid)
                        const isCaptain = Boolean(player?.IsCaptain)
                        const skillStyle = getSkillStyle(player?.SkillLevel, isCaptain)
                        return (
                          <span
                            key={`${team.id}-${kid}`}
                            title={`${player?.Name || kid} · ${player?.Role || 'Player'}${player?.WinningBid ? ` · ${formatInLakhs(player.WinningBid)}` : ''}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              background: isCaptain ? 'rgba(245,158,11,0.12)' : (skillStyle.backgroundColor || 'var(--bg3)'),
                              border: isCaptain ? '1px solid var(--gold)' : `1px solid ${skillStyle.borderColor}`,
                              color: isCaptain ? 'var(--gold)' : (skillStyle.textColor || 'var(--text)'),
                              padding: '2px 6px',
                              borderRadius: '5px',
                              fontSize: '0.65rem',
                              fontWeight: isCaptain ? 700 : 500,
                              whiteSpace: 'nowrap',
                              lineHeight: 1.2
                            }}
                          >
                            {isCaptain && <span>👑</span>}
                            <span style={{ maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {player?.Name || kid}
                            </span>
                            {player?.WinningBid ? (
                              <span style={{ opacity: 0.75, fontSize: '0.6rem', fontWeight: 600 }}>
                                · {formatInLakhs(player.WinningBid)}
                              </span>
                            ) : null}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {phaseNotice.visible && (
        <div style={{
          position: 'fixed', right: '18px', bottom: '18px', zIndex: 1200,
          background: 'var(--grad-gold)', color: 'var(--text)',
          border: '1px solid rgba(255,214,0,0.35)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: '10px', padding: '10px 12px',
          fontSize: '0.82rem', maxWidth: '320px',
          boxShadow: '0 10px 26px rgba(0,0,0,0.35)'
        }}>
          {phaseNotice.message}
        </div>
      )}

      {showCaptainTransitionConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1300, padding: '1rem'
        }}>
          <div style={{
            width: '100%', maxWidth: '420px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '1rem'
          }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.35rem', color: 'var(--gold)', marginBottom: '0.5rem' }}>
              Captain Auction Complete?
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '0.9rem' }}>
              All teams now have captains. Move to player auction now?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => resolveCaptainTransitionChoice(false)}
                style={{ ...btnStyle('var(--bg3)', 'var(--muted)'), border: '1px solid var(--border)', padding: '9px 12px', fontSize: '0.88rem' }}
              >
                No, stay in captains
              </button>
              <button
                onClick={() => resolveCaptainTransitionChoice(true)}
                style={{ ...btnStyle('var(--gold)', '#111'), padding: '9px 12px', fontSize: '0.88rem' }}
              >
                Yes, move to players
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value, highlight, skillStyle }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      borderRadius: '8px',
      padding: '5px 8px',
      border: highlight
        ? '1px solid rgba(255,214,0,0.3)'
        : (skillStyle ? `1px solid ${skillStyle.borderColor}` : '1px solid var(--border)'),
      minWidth: 0,
      overflow: 'hidden'
    }}>
      <div style={{
        fontSize: '0.58rem',
        color: 'var(--muted)',
        marginBottom: '2px',
        letterSpacing: '0.06em',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {label}
      </div>
      <div style={{
        fontWeight: 700,
        fontSize: '0.85rem',
        color: highlight ? 'var(--gold)' : (skillStyle?.textColor || 'var(--text)'),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {value}
      </div>
    </div>
  )
}

function CompactChip({ value, highlight, skillStyle }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '100px',
      fontSize: '0.7rem',
      fontWeight: 500,
      background: highlight
        ? 'rgba(245,158,11,0.1)'
        : (skillStyle?.backgroundColor || 'var(--bg3)'),
      color: highlight
        ? 'var(--gold)'
        : (skillStyle?.textColor || 'var(--muted)'),
      border: highlight
        ? '1px solid rgba(245,158,11,0.3)'
        : (skillStyle ? `1px solid ${skillStyle.borderColor}` : '1px solid var(--border)'),
      whiteSpace: 'nowrap'
    }}>
      {value}
    </span>
  )
}

function btnStyle(bg, color) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '11px 16px',
    background: bg,
    color,
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Bebas Neue',
    fontSize: '1rem',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}
