import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import axios from 'axios'
import {
  Upload, FolderOpen, Users, DollarSign,
  CheckCircle, AlertCircle, Image as ImageIcon, X, Sparkles, Hash
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ─── Skill Level to Base Price Enum ───────────────────────────────────────
const SKILL_LEVEL_PRICES = {
  BEGINNER: 2,
  INTERMEDIATE: 4,
  EXPERT: 6
}

// ─── Captain Base Price Enum ─────────────────────────────────────────────
const CAPTAIN_BASE_PRICE = 10 // All captains have same base price (10 Lakhs)

const getBasePriceFromSkillLevel = (skillLevel) => {
  if (!skillLevel) return SKILL_LEVEL_PRICES.BEGINNER
  
  const normalized = skillLevel.toLowerCase().trim()
  
  if (normalized.includes('beginner')) return SKILL_LEVEL_PRICES.BEGINNER
  if (normalized.includes('intermediate')) return SKILL_LEVEL_PRICES.INTERMEDIATE
  if (normalized.includes('expert')) return SKILL_LEVEL_PRICES.EXPERT
  
  return SKILL_LEVEL_PRICES.BEGINNER // default
}

export default function SetupView({ onComplete, branding, onBrandingChange }) {
  const setupDraftKey = 'cricket-auction-setup-draft'
  const savedSetupDraft = (() => {
    try {
      return JSON.parse(localStorage.getItem(setupDraftKey) || 'null')
    } catch {
      return null
    }
  })()

  const logoFileRef = useRef()
  const fileRef = useRef()
  const rawDataRowsRef = useRef(null)
  const [orgName, setOrgName] = useState(branding?.orgName || '')
  const [logoDataUrl, setLogoDataUrl] = useState(branding?.logoDataUrl || '')
  const [idColumn, setIdColumn] = useState(savedSetupDraft?.idColumn || '')
  const [detectedHeaders, setDetectedHeaders] = useState(savedSetupDraft?.detectedHeaders || [])
  const [imagePath, setImagePath] = useState(savedSetupDraft?.imagePath || '')
  const [teamsInput, setTeamsInput] = useState(savedSetupDraft?.teamsInput || '')
  const [basePurse, setBasePurse] = useState(savedSetupDraft?.basePurse || 100)
  const [rosterFile, setRosterFile] = useState(savedSetupDraft?.rosterFileName ? { name: savedSetupDraft.rosterFileName } : null)
  const [parsedCount, setParsedCount] = useState(savedSetupDraft?.parsedCount || 0)
  const [parsedRoster, setParsedRoster] = useState(savedSetupDraft?.parsedRoster || [])
  const [captainPlayerIdsInput, setCaptainPlayerIdsInput] = useState(savedSetupDraft?.captainPlayerIdsInput || '')
  const [captainNamesInput, setCaptainNamesInput] = useState(savedSetupDraft?.captainNamesInput || '')
  const [status, setStatus] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (branding) {
      setOrgName(branding.orgName || '')
      setLogoDataUrl(branding.logoDataUrl || '')
    }
  }, [branding])

  const handleOrgNameChange = (val) => {
    setOrgName(val)
    onBrandingChange?.({ orgName: val, logoDataUrl })
  }

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo image size must be under 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (typeof dataUrl === 'string') {
        setLogoDataUrl(dataUrl)
        onBrandingChange?.({ orgName, logoDataUrl: dataUrl })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = (e) => {
    e.stopPropagation()
    setLogoDataUrl('')
    if (logoFileRef.current) logoFileRef.current.value = ''
    onBrandingChange?.({ orgName, logoDataUrl: '' })
  }

  useEffect(() => {
    localStorage.setItem(setupDraftKey, JSON.stringify({
      imagePath,
      teamsInput,
      basePurse,
      rosterFileName: rosterFile?.name || '',
      parsedCount,
      parsedRoster,
      captainPlayerIdsInput,
      captainNamesInput,
      idColumn,
      detectedHeaders
    }))
  }, [imagePath, teamsInput, basePurse, rosterFile, parsedCount, parsedRoster, captainPlayerIdsInput, captainNamesInput, idColumn, detectedHeaders])

  const normalizeHeader = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const readColumn = (row, aliases) => {
    const normalizedAliases = aliases.map(normalizeHeader)

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeHeader(key)

      if (
        normalizedAliases.includes(normalizedKey) ||
        normalizedAliases.some(alias => normalizedKey.includes(alias) || alias.includes(normalizedKey))
      ) {
        return value
      }
    }

    return ''
  }

  const parseList = (value) =>
    value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)

  const normalizeText = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const parseExcelRows = (headerRow, dataRows, chosenIdCol) => {
    const headerIndexMap = new Map(
      headerRow.map((header, index) => [normalizeHeader(header), index])
    )

    const findIndex = (aliases) => {
      for (const alias of aliases) {
        const normalizedAlias = normalizeHeader(alias)
        if (headerIndexMap.has(normalizedAlias)) return headerIndexMap.get(normalizedAlias)
      }

      for (let index = 0; index < headerRow.length; index++) {
        const normalizedHeader = normalizeHeader(headerRow[index])
        if (
          aliases.some(alias => {
            const normalizedAlias = normalizeHeader(alias)
            return normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)
          })
        ) {
          return index
        }
      }

      return -1
    }

    let playerIdIndex = -1
    if (chosenIdCol && chosenIdCol.trim()) {
      const normChosen = normalizeHeader(chosenIdCol)
      if (headerIndexMap.has(normChosen)) {
        playerIdIndex = headerIndexMap.get(normChosen)
      } else {
        playerIdIndex = headerRow.findIndex(h => normalizeHeader(h) === normChosen)
      }
    }

    if (playerIdIndex === -1) {
      playerIdIndex = findIndex([
        'PLAYER ID', 'Player ID', 'ID', 'PLAYERID',
        'EMP ID', 'Employee ID', 'EMP NO', 'Employee Number', 'EMPID',
        'KEKA ID', 'Keka ID', 'KEKAID',
        'SR NO', 'SL NO', 'Serial No', 'S NO', 'SNO', 'Reg ID', 'Registration ID'
      ])
    }

    const nameIndex = findIndex(['FULL NAME', 'Full Name', 'Name', 'PLAYER NAME', 'Player Name'])
    const roleIndex = findIndex(['Select your cricket category', 'Cricket Category', 'Role', 'Category', 'Specialization'])
    const skillLevelIndex = findIndex([
      'Select your SKILL level',
      'Select your skill level',
      'Skill Level',
      'Skill',
      'SKILL LEVEL'
    ])
    const emailIndex = findIndex(['Email', 'E-mail', 'Email ID', 'Email Address'])
    const photoIndex = findIndex([
      'PLEASE UPLOAD YOUR RECENT PHOTO FOR THE AUCTION PROCESS.',
      'PLEASE UPLOAD YOUR RECENT PHOTO FOR THE AUCTION PROCESS',
      'Recent Photo for the Auction Process',
      'Photo', 'Image', 'Photo URL', 'Image Path'
    ])

    const cleanData = dataRows
      .map((row, index) => {
        const rawId = playerIdIndex >= 0 ? String(row[playerIdIndex] ?? '').trim() : ''
        const name = nameIndex >= 0 ? String(row[nameIndex] ?? '').trim() : ''
        const skillLevel = String(skillLevelIndex >= 0 ? row[skillLevelIndex] ?? '' : '').trim()

        const fallbackId = `P${index + 1}`
        const id = rawId || fallbackId

        return {
          ID: id,
          Name: name,
          Role: String(roleIndex >= 0 ? row[roleIndex] ?? '' : '').trim(),
          SkillLevel: skillLevel,
          Email: String(emailIndex >= 0 ? row[emailIndex] ?? '' : '').trim(),
          ImagePath: String(photoIndex >= 0 ? row[photoIndex] ?? '' : '').trim(),
          BasePrice: getBasePriceFromSkillLevel(skillLevel),
          Status: 'Unsold',
          WinningTeam: 'None',
          WinningBid: 0
        }
      })
      .filter(p => p.Name !== '' || p.ID !== '')

    const matchedHeader = playerIdIndex >= 0 ? headerRow[playerIdIndex] : ''
    return { cleanData, matchedHeader }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRosterFile(file)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const [headerRow = [], ...dataRows] = rows

        const validHeaders = headerRow
          .map(h => String(h ?? '').trim())
          .filter(Boolean)

        setDetectedHeaders(validHeaders)
        rawDataRowsRef.current = { headerRow, dataRows }

        const { cleanData, matchedHeader } = parseExcelRows(headerRow, dataRows, idColumn)
        if (!idColumn && matchedHeader) {
          setIdColumn(matchedHeader)
        }

        setParsedRoster(cleanData)
        setParsedCount(cleanData.length)
        setRosterFile({ name: file.name })
      } catch (err) {
        setErrorMsg('Failed to parse Excel file: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleIdColumnChange = (newCol) => {
    setIdColumn(newCol)
    if (rawDataRowsRef.current) {
      const { headerRow, dataRows } = rawDataRowsRef.current
      const { cleanData } = parseExcelRows(headerRow, dataRows, newCol)
      setParsedRoster(cleanData)
      setParsedCount(cleanData.length)
    }
  }

  const handleSubmit = async () => {
    if (!imagePath.trim()) { setErrorMsg('Image directory path is required'); return }
    if (!teamsInput.trim()) { setErrorMsg('At least one team name is required'); return }
    if (parsedRoster.length === 0) { setErrorMsg('Please upload a valid roster Excel file'); return }

    const captainPlayerIds = parseList(captainPlayerIdsInput)
    const captainNames = parseList(captainNamesInput)
    if (captainPlayerIds.length === 0 && captainNames.length === 0) {
      setErrorMsg('Please provide captain player IDs or captain names')
      return
    }

    setErrorMsg('')
    setStatus('loading')

    const teamNames = teamsInput.split(',').map(t => t.trim()).filter(Boolean)
    const captainPlayerIdSet = new Set(captainPlayerIds.map(normalizeText))
    const captainNameSet = new Set(captainNames.map(normalizeText))
    
    // Mark captains in roster and set their base price
    const rosterWithCaptains = parsedRoster.map(player => {
      const isCaptain =
        captainPlayerIdSet.has(normalizeText(player.ID)) ||
        captainNameSet.has(normalizeText(player.Name))

      return {
        ...player,
        IsCaptain: isCaptain,
        WasOriginalCaptain: isCaptain,
        SkillLevel: isCaptain ? 'Captain' : player.SkillLevel,
        BasePrice: isCaptain ? CAPTAIN_BASE_PRICE : player.BasePrice
      }
    })

    try {
      await axios.post(`${API}/api/set-config`, {
        image_path: imagePath.trim(),
        teams: teamNames,
        base_purse: parseInt(basePurse),
        captain_ids: captainPlayerIds,
        captain_names: captainNames
      })
      setStatus('success')
      setTimeout(() => {
        onComplete(rosterWithCaptains, {
          image_path: imagePath.trim(),
          teams: teamNames,
          base_purse: parseInt(basePurse),
          captain_ids: captainPlayerIds,
          captain_names: captainNames
        })
      }, 800)
    } catch (err) {
      setStatus('error')
      const msg = err.response?.data?.detail
        || (typeof err.response?.data === 'string' ? err.response.data : null)
        || err.message
        || 'Could not connect to backend. Make sure backend server is running on :8080'
      setErrorMsg(msg)
    }
  }

  const liveCaptainPlayerIds = parseList(captainPlayerIdsInput)
  const liveCaptainNames = parseList(captainNamesInput)
  const liveCaptainPlayerIdSet = new Set(liveCaptainPlayerIds.map(normalizeText))
  const liveCaptainNameSet = new Set(liveCaptainNames.map(normalizeText))
  const matchedCaptains = parsedRoster.filter(player =>
    liveCaptainPlayerIdSet.has(normalizeText(player.ID)) ||
    liveCaptainNameSet.has(normalizeText(player.Name))
  )

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 2rem' }} className="slide-in">
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '3rem', color: 'var(--green)', margin: 0, lineHeight: 1 }}>
          AUCTION SETUP
        </h1>
        <p style={{ color: 'var(--muted)', margin: '8px 0 0', fontSize: '0.95rem' }}>
          Configure your tournament before the bidding begins
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Custom Branding Section (Optional) */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: 'var(--gold)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
                Custom Branding <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>(Optional)</span>
              </span>
            </div>
            {(orgName || logoDataUrl) && (
              <span style={{
                fontSize: '0.72rem', color: 'var(--green)',
                background: 'rgba(0,200,83,0.1)', padding: '2px 8px',
                borderRadius: '100px', fontWeight: 600
              }}>
                ● Active
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Org Name */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                ORGANIZATION / TOURNAMENT NAME
              </label>
              <input
                className="themed-control"
                type="text"
                value={orgName}
                onChange={e => handleOrgNameChange(e.target.value)}
                placeholder="e.g. Acme Premier League"
                style={inputStyle}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                Replaces "CRICKET AUCTION" in the top bar
              </span>
            </div>

            {/* Custom Logo Upload */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                CUSTOM LOGO
              </label>
              <input
                ref={logoFileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />

              {logoDataUrl ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  height: '42px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={logoDataUrl}
                      alt="Logo preview"
                      style={{ maxHeight: '28px', maxWidth: '80px', objectFit: 'contain' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>
                      Logo uploaded
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    style={{
                      background: 'none', border: 'none', color: 'var(--red)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px'
                    }}
                    title="Remove logo"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoFileRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg2)',
                    border: '1px dashed var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    height: '42px',
                    transition: 'all 0.2s'
                  }}
                >
                  <ImageIcon size={15} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Upload logo (PNG, JPG, SVG &lt; 2MB)
                  </span>
                </div>
              )}
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                Replaces default logo in the top bar
              </span>
            </div>
          </div>
        </div>

        <Field icon={<FolderOpen size={16} />} label="Image Directory Path" hint="Full local path to player photos folder">
          <input
            className="themed-control"
            type="text"
            value={imagePath}
            onChange={e => setImagePath(e.target.value)}
            placeholder="C:\\Photos\\Players"
            style={inputStyle}
          />
        </Field>

        <Field icon={<Users size={16} />} label="Tournament Teams" hint="Comma-separated team names">
          <input
            className="themed-control"
            type="text"
            value={teamsInput}
            onChange={e => setTeamsInput(e.target.value)}
            placeholder="Hawks, Bulls, Eagles, Lions"
            style={inputStyle}
          />
        </Field>

        <Field icon={<DollarSign size={16} />} label="Starting Purse per Team" hint="Use lakhs (100 = 1 Cr)">
          <input
            className="themed-control"
            type="number"
            value={basePurse}
            onChange={e => setBasePurse(e.target.value)}
            min={1}
            step={1}
            style={inputStyle}
          />
        </Field>

        <Field icon={<Upload size={16} />} label="Master Roster (.xlsx)" hint="Upload the player registration Excel file">
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${rosterFile ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '1.25rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: rosterFile ? 'rgba(0,200,83,0.05)' : 'var(--bg2)',
              transition: 'all 0.2s'
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {rosterFile ? (
              <div>
                <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.95rem' }}>
                  ✓ {rosterFile.name}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                  {parsedCount} players parsed
                </div>
              </div>
            ) : (
              <div>
                <Upload size={24} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Click to upload Excel file
                </div>
              </div>
            )}
          </div>
        </Field>

        {/* Player ID Column Configuration Card */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={16} style={{ color: 'var(--gold)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
                Player ID Column Mapping
              </span>
            </div>
            {idColumn && (
              <span style={{
                fontSize: '0.72rem', color: 'var(--green)',
                background: 'rgba(0,200,83,0.1)', padding: '2px 8px',
                borderRadius: '100px', fontWeight: 600
              }}>
                ● Mapped: {idColumn}
              </span>
            )}
          </div>

          <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0, lineHeight: 1.4 }}>
            Specify or select which column contains your Player IDs so the system identifies players and captains with zero ambiguity.
          </p>

          {detectedHeaders.length > 0 ? (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                DETECTED COLUMNS FROM UPLOADED SHEET
              </label>
              <select
                className="themed-control"
                value={idColumn}
                onChange={e => handleIdColumnChange(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Auto-detect best match</option>
                {detectedHeaders.map((header, idx) => (
                  <option key={`${header}-${idx}`} value={header}>
                    Column {idx + 1}: {header}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                ID COLUMN NAME (OPTIONAL PRESET)
              </label>
              <input
                className="themed-control"
                type="text"
                value={idColumn}
                onChange={e => handleIdColumnChange(e.target.value)}
                placeholder="e.g. Employee ID, Emp ID, or Player ID"
                style={inputStyle}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                Leave empty to auto-detect. Column selector appears once you upload a roster.
              </span>
            </div>
          )}

          {parsedRoster.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.78rem',
              color: 'var(--text)',
              background: 'var(--bg2)',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)'
            }}>
              <span>
                <strong>Sample IDs:</strong> {parsedRoster.slice(0, 4).map(p => p.ID).join(', ')}{parsedRoster.length > 4 ? '...' : ''}
              </span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                {parsedCount} players ready
              </span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            padding: '12px 16px',
            background: 'rgba(255,61,61,0.1)',
            border: '1px solid rgba(255,61,61,0.3)',
            borderRadius: '8px',
            color: 'var(--red)',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            {errorMsg}
          </div>
        )}

        <Field icon={<Users size={16} />} label="Captain Player IDs" hint="Comma- or newline-separated IDs from backend">
          <textarea
            className="themed-control"
            value={captainPlayerIdsInput}
            onChange={e => setCaptainPlayerIdsInput(e.target.value)}
            placeholder="P101, P102, P103"
            style={{ ...inputStyle, minHeight: '88px', resize: 'vertical' }}
          />
        </Field>

        <Field icon={<Users size={16} />} label="Captain Names" hint="Optional fallback if IDs are not available">
          <textarea
            className="themed-control"
            value={captainNamesInput}
            onChange={e => setCaptainNamesInput(e.target.value)}
            placeholder="Rahul Sharma, Arjun Patel, Vikram Singh"
            style={{ ...inputStyle, minHeight: '88px', resize: 'vertical' }}
          />
        </Field>

        {parsedRoster.length > 0 && (captainPlayerIdsInput.trim() || captainNamesInput.trim()) && (
          <div style={{
            fontSize: '0.78rem',
            padding: '8px 12px',
            borderRadius: '6px',
            background: matchedCaptains.length > 0 ? 'rgba(0,200,83,0.08)' : 'rgba(255,61,61,0.08)',
            border: `1px solid ${matchedCaptains.length > 0 ? 'rgba(0,200,83,0.25)' : 'rgba(255,61,61,0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {matchedCaptains.length > 0 ? (
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                ✓ {matchedCaptains.length} captain{matchedCaptains.length > 1 ? 's' : ''} matched: {matchedCaptains.map(c => c.Name || c.ID).join(', ')}
              </span>
            ) : (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                ⚠️ 0 captains matched the roster IDs/names. Verify Player ID column or spelling.
              </span>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={status === 'loading' || status === 'success'}
          style={{
            marginTop: '0.5rem',
            padding: '14px',
            background: status === 'success' ? 'var(--green-dim)' : 'var(--green)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'Bebas Neue',
            fontSize: '1.25rem',
            letterSpacing: '0.1em',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            opacity: status === 'loading' ? 0.7 : 1
          }}
        >
          {status === 'loading' && <span className="pulse">⏳</span>}
          {status === 'success' && <CheckCircle size={18} />}
          {status === 'loading' ? 'CONNECTING TO BACKEND...' :
           status === 'success' ? 'LAUNCHING AUCTION...' :
           'START AUCTION →'}
        </button>

        <p style={{ color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
          Make sure your backend server is running on <code style={{ background: 'var(--bg2)', padding: '2px 4px', borderRadius: '4px' }}>http://localhost:8080</code> for the setup to work.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center', margin: '6px 0 0' }}>
          Setup autosaves locally so you can recover after a refresh.
        </p>
      </div>
    </div>
  )
}

function Field({ icon, label, hint, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: '6px'
      }}>
        <span style={{ color: 'var(--green)' }}>{icon}</span>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{label}</label>
        {hint && <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>— {hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.9rem',
  outline: 'none',
  fontFamily: 'DM Sans',
  transition: 'border-color 0.2s'
}
