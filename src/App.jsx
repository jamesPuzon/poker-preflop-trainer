import { useState, useMemo, useEffect, useRef } from 'react'
import React from 'react'
import cashData from './basic_cash_charts.json'
import mttData  from './basic_mtt_charts.json'
import CreateRangeModal from './CreateRangeModal'
import ChartGrid, { RANKS, getHandName, getRectSelection } from './ChartGrid'
import './App.css'

// ── Icons ────────────────────────────────────────────────────────────────────
const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="8" height="8" rx="1"/>
    <path d="M1 9V2a1 1 0 011-1h7"/>
  </svg>
)
const PasteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="11" height="8" rx="1"/>
    <path d="M4 4V2.5A.5.5 0 014.5 2h4a.5.5 0 01.5.5V4"/>
    <path d="M5 8h3M6.5 6.5v3"/>
  </svg>
)

// ── Constants ─────────────────────────────────────────────────────────────────
const POSITION_ORDER = ['UTG','MP','LJ','HJ','CO','BTN','SB','BB']

const BASE_RANGE_OPTIONS = [
  { value: 'cash', label: 'Cash 100 Simple Preflop Ranges', data: cashData },
  { value: 'mtt',  label: 'MTT 100 Simple Preflop Ranges',  data: mttData  },
]

const LS_CUSTOM          = 'poker-preflop-trainer-custom-ranges'
const LS_OVERRIDES       = 'poker-preflop-trainer-overrides'
const LS_LABEL_OVERRIDES = 'poker-preflop-trainer-label-overrides'

// ── Storage ───────────────────────────────────────────────────────────────────
function loadCustomRanges() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]') } catch { return [] }
}
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) || '{}') } catch { return {} }
}
function loadLabelOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_LABEL_OVERRIDES) || '{}') } catch { return {} }
}

// ── Data helpers ──────────────────────────────────────────────────────────────
const deepCopy = v => JSON.parse(JSON.stringify(v))

const DEFAULT_KEY_ITEMS = [
  { label: 'Raise', color: '#ff4961', selected: true },
  { label: 'Call',  color: '#2fdf75', selected: true },
  { label: 'Fold',  color: '#3a3a4a', selected: true },
]

// Default red label per scenario index: 1st→Raise, 2nd→3-bet, 3rd→4-bet, 4th→5-bet
const RED_LABELS_BY_SCENARIO_INDEX = ['Raise', '3-bet', '4-bet', '5-bet']

function getChartKeyItems(data, chartName, sectionNames = null) {
  const baseKeyItems = (chartName && data?.[chartName]?.keyItems)
    ? data[chartName].keyItems
    : (data?._meta?.keyItems ?? DEFAULT_KEY_ITEMS)

  if (!chartName) return baseKeyItems
  const scenario = data?.[chartName]?.scenario
  if (!scenario) return baseKeyItems

  // Determine target red label for this scenario
  let targetRedLabel = null
  if (data?._meta?.scenarioRedLabels?.[scenario] !== undefined) {
    // Explicit per-scenario override stored in the data
    targetRedLabel = data._meta.scenarioRedLabels[scenario]
  } else {
    // Derive from scenario order: 1st scenario→Raise, 2nd→3-bet, 3rd→4-bet, 4th→5-bet
    const scenarioOrder = data?._meta?.scenarioOrder ?? sectionNames
    if (scenarioOrder) {
      const idx = scenarioOrder.indexOf(scenario)
      if (idx >= 0 && idx < RED_LABELS_BY_SCENARIO_INDEX.length) {
        targetRedLabel = RED_LABELS_BY_SCENARIO_INDEX[idx]
      }
    }
  }

  if (!targetRedLabel) return baseKeyItems

  // Only override if the target label exists among the red items
  const hasTarget = baseKeyItems.some(item => item.color === '#ff4961' && item.label === targetRedLabel)
  if (!hasTarget) return baseKeyItems

  // Apply: make only the target label selected among all red items
  return baseKeyItems.map(item =>
    item.color === '#ff4961' ? { ...item, selected: item.label === targetRedLabel } : item
  )
}

function getActionColors(keyItems) {
  const foldColor = '#3a3a4a'
  const activeColorGroups = new Set()
  keyItems.forEach(item => {
    if (item.selected && item.label !== 'Fold') activeColorGroups.add(item.color)
  })
  const colors = { Fold: foldColor, fold: foldColor, raise: '#ff4961', call: '#2fdf75' }
  keyItems.forEach(item => {
    if (item.label === 'Fold') {
      colors[item.label] = foldColor
    } else {
      colors[item.label] = activeColorGroups.has(item.color) ? item.color : foldColor
    }
  })
  return colors
}

function getVillainPlayStyles(data) {
  return data?._meta?.villainPlayStyles ?? ['All']
}

function isChartAllFold(chart) {
  if (!chart) return true
  const hands = chart.hands ?? {}
  if (Object.keys(hands).length === 0) return true
  return Object.values(hands).every(a => a === 'Fold' || a === 'fold')
}

function hasAnyNonFoldChart(data, structures, scenarios, section, hero, villain, playStylesList) {
  return playStylesList.some(ps => {
    const key = getChartName(structures, scenarios, section, hero, villain, ps)
    return key ? !isChartAllFold(data[key]) : false
  })
}

// Rename a position inside a chart key without regex, so names like "UTG+1"
// (which contain regex special chars) are handled correctly.
function renamePositionInKey(key, oldName, newName) {
  // Single-type key: key is exactly the position name (optionally with play-style tag)
  if (key === oldName) return newName

  const vsIdx = key.indexOf(' vs ')
  if (vsIdx < 0) return key // not a vs key, return unchanged

  const hero   = key.slice(0, vsIdx)
  const afterVs = key.slice(vsIdx + 4) // "VILLAIN (scenario)" or "VILLAIN (scenario) [style]"

  // Villain ends at the first ' (' — everything after is the scenario+style suffix
  const parenIdx = afterVs.indexOf(' (')
  const villain  = parenIdx >= 0 ? afterVs.slice(0, parenIdx) : afterVs
  const suffix   = parenIdx >= 0 ? afterVs.slice(parenIdx) : ''

  const newHero    = hero    === oldName ? newName : hero
  const newVillain = villain === oldName ? newName : villain
  return `${newHero} vs ${newVillain}${suffix}`
}

function buildStructures(data) {
  if (!data) return { scenarios: {}, structures: {}, sectionNames: [] }
  const meta = data._meta ?? {}
  const posOrder        = meta.positions ?? meta.heroPositions ?? null
  const metaHeroOrder    = posOrder
  const metaVillainOrder = meta.positions ?? meta.villainPositions ?? posOrder
  const metaScenarioOrder = meta.scenarioOrder   ?? null

  const scenarios = {}
  Object.entries(data).forEach(([name, d]) => {
    if (name === '_meta') return
    if (name.endsWith(']') && name.includes(' [')) return // play style variants
    const sc = d.scenario ?? d.section ?? 'Unknown'
    if (!scenarios[sc]) scenarios[sc] = []
    scenarios[sc].push(name)
  })

  let scKeys = Object.keys(scenarios)
  if (metaScenarioOrder) {
    scKeys = [
      ...metaScenarioOrder.filter(s => scKeys.includes(s)),
      ...scKeys.filter(s => !metaScenarioOrder.includes(s)),
    ]
  }

  const structures = {}
  scKeys.forEach(sc => {
    const charts = scenarios[sc] ?? []
    const heroToVillains = {}
    let isSingle = true
    charts.forEach(name => {
      // Use [^\s]+ instead of \w+ so position names like "UTG+1" (with +) match correctly
      const m = name.match(/^([^\s]+) vs ([^\s]+)/)
      if (m) {
        isSingle = false
        const [, hero, villain] = m
        if (!heroToVillains[hero]) heroToVillains[hero] = []
        if (!heroToVillains[hero].includes(villain)) heroToVillains[hero].push(villain)
      }
    })

    if (isSingle) {
      let heroes = charts.filter(n => !n.includes(' '))
      if (metaHeroOrder) {
        heroes = [
          ...metaHeroOrder.filter(h => heroes.includes(h)),
          ...heroes.filter(h => !metaHeroOrder.includes(h)),
        ]
      } else {
        const ordered = POSITION_ORDER.filter(p => heroes.includes(p))
        const extras  = heroes.filter(p => !POSITION_ORDER.includes(p))
        heroes = [...ordered, ...extras]
      }
      structures[sc] = { type: 'single', heroes }
    } else {
      let allHeroes = Object.keys(heroToVillains)
      if (metaHeroOrder) {
        allHeroes = [
          ...metaHeroOrder.filter(h => allHeroes.includes(h)),
          ...allHeroes.filter(h => !metaHeroOrder.includes(h)),
        ]
      } else {
        allHeroes = [
          ...POSITION_ORDER.filter(h => allHeroes.includes(h)),
          ...allHeroes.filter(h => !POSITION_ORDER.includes(h)),
        ]
      }
      allHeroes.forEach(h => {
        let villains = heroToVillains[h] ?? []
        if (metaVillainOrder) {
          // Include ALL positions from the canonical list (minus the hero) so that
          // positions are visible even when some chart keys are missing.  Extra
          // positions found in chart keys but not in the canonical list come last.
          villains = [
            ...metaVillainOrder.filter(v => v !== h),
            ...villains.filter(v => !metaVillainOrder.includes(v) && v !== h),
          ]
        } else {
          villains = [
            ...POSITION_ORDER.filter(v => villains.includes(v)),
            ...villains.filter(v => !POSITION_ORDER.includes(v)),
          ]
        }
        heroToVillains[h] = villains
      })
      structures[sc] = { type: 'vs', heroes: allHeroes, heroToVillains }
    }
  })

  return { scenarios, structures, sectionNames: scKeys.filter(k => structures[k]) }
}

function getMetaGroupsFromData(data) {
  const meta = data?._meta ?? {}
  const { structures, sectionNames } = buildStructures(data)
  const heroSet = new Set(), villainSet = new Set()
  Object.values(structures).forEach(s => {
    if (s.type === 'single') s.heroes.forEach(h => heroSet.add(h))
    else {
      s.heroes.forEach(h => heroSet.add(h))
      Object.values(s.heroToVillains).forEach(vs => vs.forEach(v => villainSet.add(v)))
    }
  })
  const allPosSet = new Set([...heroSet, ...villainSet])
  const orderedPos = [
    ...POSITION_ORDER.filter(p => allPosSet.has(p)),
    ...[...allPosSet].filter(p => !POSITION_ORDER.includes(p)),
  ]
  return {
    scenarios:  meta.scenarioOrder    ?? sectionNames,
    positions:  meta.positions ?? meta.heroPositions ?? orderedPos,
    playStyles: meta.villainPlayStyles ?? ['All'],
  }
}

function getChartName(structures, scenarios, section, hero, villain, playStyle) {
  let base
  if (structures[section]?.type === 'single') {
    base = hero
  } else {
    // Search for an existing key first (handles legacy key formats like "MP vs UTG raise")
    base = scenarios[section]?.find(n => n.startsWith(`${hero} vs ${villain}`)) ?? null
    // If no key exists yet, construct the canonical key so the chart can be viewed/edited
    if (!base && hero && villain) base = `${hero} vs ${villain} (${section})`
  }
  if (!base) return null
  if (!playStyle || playStyle === 'All') return base
  return `${base} [${playStyle}]`
}

function resolveNav(structures, targetSection, targetHero, targetVillain) {
  const struct = structures[targetSection]
  if (!struct) return { hero: targetHero, villain: targetVillain }
  const hero = struct.heroes.includes(targetHero) ? targetHero : struct.heroes[0]
  let villain = targetVillain
  if (struct.type === 'vs') {
    const avail = struct.heroToVillains[hero] ?? []
    if (!avail.includes(villain)) villain = avail[0] ?? null
  }
  return { hero, villain }
}

function exportRange(data, label) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json'
  a.click()
  URL.revokeObjectURL(url)
}

function getRowCells(row) {
  return new Set(Array.from({ length: 13 }, (_, c) => getHandName(row, c)))
}
function getColCells(col) {
  return new Set(Array.from({ length: 13 }, (_, r) => getHandName(r, col)))
}

// ── EditKeyModal ──────────────────────────────────────────────────────────────
function EditKeyModal({ keyItems, onClose, onChange }) {
  const [items, setItems] = useState(() => deepCopy(keyItems))
  const [newColor, setNewColor] = useState('#ff4961')
  const [newLabel, setNewLabel] = useState('')

  const COLOR_OPTIONS = [
    { hex: '#ff4961', name: 'Red'   },
    { hex: '#2fdf75', name: 'Green' },
    { hex: '#4488ff', name: 'Blue'  },
  ]

  const grouped = {}
  items.forEach((item, idx) => {
    const key = item.label === 'Fold' ? '__fold__' : item.color
    if (!grouped[key]) grouped[key] = []
    grouped[key].push({ ...item, idx })
  })
  const colorOrder = ['#ff4961','#2fdf75','#4488ff','__fold__']
  const sortedGroups = colorOrder.filter(c => grouped[c]).map(c => ({ colorKey: c, entries: grouped[c] }))

  function toggleSelected(idx) {
    const updated = deepCopy(items)
    const item = updated[idx]
    if (item.label === 'Fold') return
    if (item.selected) {
      updated[idx].selected = false
    } else {
      // Select this one, deselect others in same color group
      updated.forEach((it, i) => {
        if (it.label === 'Fold') return
        if (it.color === item.color) updated[i].selected = (i === idx)
      })
    }
    setItems(updated)
  }

  function deleteItem(idx) {
    setItems(items.filter((_, i) => i !== idx))
  }

  function addItem() {
    const lbl = newLabel.trim()
    if (!lbl) return
    const order = { '#ff4961': 0, '#2fdf75': 1, '#4488ff': 2, '#3a3a4a': 3 }
    const updated = [...items, { label: lbl, color: newColor, selected: false }]
    updated.sort((a, b) => {
      if (a.label === 'Fold') return 1
      if (b.label === 'Fold') return -1
      const oa = order[a.color] ?? 4, ob = order[b.color] ?? 4
      return oa !== ob ? oa - ob : a.label.localeCompare(b.label)
    })
    setItems(updated)
    setNewLabel('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ minWidth: 340 }} onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Edit Key</h2>
        <div className="key-edit-list">
          {sortedGroups.map(({ colorKey, entries }) => (
            <div key={colorKey} className="key-edit-group">
              {entries.map(({ label, color, selected, idx }) => (
                <div key={idx} className="key-edit-row">
                  {label !== 'Fold' ? (
                    <input
                      type="checkbox"
                      className="key-edit-check"
                      checked={selected}
                      onChange={() => toggleSelected(idx)}
                    />
                  ) : (
                    <span className="fold-spacer" />
                  )}
                  <div className="key-edit-swatch" style={{ background: color }} />
                  <span className="key-edit-label">{label}</span>
                  {label !== 'Fold' && (
                    <button className="key-edit-del" onClick={() => deleteItem(idx)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="key-edit-add">
          <span className="modal-label">Add</span>
          <div className="key-edit-add-row">
            <select
              className="modal-select"
              style={{ width: 'auto', flex: 1 }}
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
            >
              {COLOR_OPTIONS.map(c => (
                <option key={c.hex} value={c.hex}>{c.name}</option>
              ))}
            </select>
            <input
              className="modal-input"
              style={{ flex: 2 }}
              placeholder="Label"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <button
              className="modal-create-btn"
              style={{ padding: '0.4rem 0.8rem' }}
              onClick={addItem}
              disabled={!newLabel.trim()}
            >
              Add
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="modal-create-btn" onClick={() => { onChange(items); onClose() }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────
function DeleteConfirm({ label, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Delete Range Set?</h2>
        <p style={{ color: '#ccccee', margin: 0 }}>
          Delete <strong>"{label}"</strong>? This cannot be undone.
        </p>
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onCancel}>Cancel</button>
          <button
            className="modal-create-btn"
            style={{ background: '#8b0000', borderColor: '#cc2222' }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [rangeType,         setRangeType]         = useState('cash')
  const [activeSection,     setActiveSection]     = useState(null)
  const [selectedHero,      setSelectedHero]      = useState(null)
  const [selectedVillain,   setSelectedVillain]   = useState(null)
  const [selectedPlayStyle, setSelectedPlayStyle] = useState('All')
  const [hoveredHand,       setHoveredHand]       = useState(null)
  const [customRanges,      setCustomRanges]      = useState(loadCustomRanges)
  const [overrides,         setOverrides]         = useState(loadOverrides)
  const [labelOverrides,    setLabelOverrides]    = useState(loadLabelOverrides)
  const [modalOpen,         setModalOpen]         = useState(false)

  // Edit mode
  const [editMode,          setEditMode]          = useState(false)
  const [workingLabel,      setWorkingLabel]      = useState('')
  const [workingData,       setWorkingData]       = useState(null)
  const [history,           setHistory]           = useState([])
  const [historyIndex,      setHistoryIndex]      = useState(-1)
  const [selectedCells,     setSelectedCells]     = useState(new Set())
  const [isDragging,        setIsDragging]        = useState(false)
  // Cell drag
  const [dragAnchor,        setDragAnchor]        = useState(null)
  const [dragCurrent,       setDragCurrent]       = useState(null)
  const [dragMode,          setDragMode]          = useState(null) // 'add'|'remove'
  const [preDragSelection,  setPreDragSelection]  = useState(null)
  // Header drag
  const [headerDrag,        setHeaderDrag]        = useState(null)
  // { axis:'row'|'col', anchor, current, mode:'add'|'remove', preDrag:Set }

  // Edit Buttons mode
  const [editButtonsMode,    setEditButtonsMode]    = useState(false)
  const [preEditButtonsData, setPreEditButtonsData] = useState(null)
  const [editingBtnIdx,      setEditingBtnIdx]      = useState(null)
  const [deleteBtnConfirm,   setDeleteBtnConfirm]   = useState(null)
  const dragBtnRef = useRef(null)

  const [keyEditOpen,       setKeyEditOpen]       = useState(false)
  const [clipboard,         setClipboard]         = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // ── Range options ──────────────────────────────────────────────────────────
  const allRangeOptions = useMemo(() => [
    ...BASE_RANGE_OPTIONS.map(o => ({ ...o, label: labelOverrides[o.value] ?? o.label })),
    ...customRanges.map(cr => ({ value: cr.id, label: labelOverrides[cr.id] ?? cr.label, data: cr.data })),
  ], [customRanges, labelOverrides])

  const currentRangeLabel = allRangeOptions.find(o => o.value === rangeType)?.label ?? ''
  const baseData  = allRangeOptions.find(o => o.value === rangeType)?.data ?? cashData
  const activeData = editMode ? (workingData ?? baseData) : (overrides[rangeType] ?? baseData)

  const { scenarios, structures, sectionNames } = useMemo(
    () => buildStructures(activeData), [activeData]
  )
  const structure = activeSection ? structures[activeSection] : null

  // ── Init nav when range/structure changes ─────────────────────────────────
  const sectionKey = sectionNames.join(',')
  useEffect(() => {
    if (!sectionNames.length) return
    if (!activeSection || !sectionNames.includes(activeSection)) {
      const first  = sectionNames[0]
      const struct = structures[first]
      setActiveSection(first)
      setSelectedHero(struct?.heroes[0] ?? null)
      setSelectedVillain(struct?.type === 'vs' ? (struct.heroToVillains[struct.heroes[0]]?.[0] ?? null) : null)
    }
  }, [sectionKey]) // eslint-disable-line

  // ── Active chart ───────────────────────────────────────────────────────────
  const activeChart = useMemo(() =>
    activeSection
      ? getChartName(structures, scenarios, activeSection, selectedHero, selectedVillain, selectedPlayStyle)
      : null,
    [structures, scenarios, activeSection, selectedHero, selectedVillain, selectedPlayStyle]
  )

  const currentHands = useMemo(() => {
    const data = workingData ?? activeData
    if (!activeChart) return {}
    return data[activeChart]?.hands ?? {}
  }, [activeChart, workingData, activeData])

  const keyItems      = useMemo(() => {
    const data = workingData ?? activeData
    return getChartKeyItems(data, activeChart, sectionNames)
  }, [workingData, activeData, activeChart, sectionNames])
  const actionColors  = useMemo(() => getActionColors(keyItems),       [keyItems])
  const playStyles    = useMemo(() => getVillainPlayStyles(activeData), [activeData])

  const displayTitle = useMemo(() => {
    if (!activeChart) return '—'
    if (structure?.type === 'single') return selectedHero ?? '—'
    return activeChart
  }, [activeChart, structure, selectedHero])

  const allVillainPositions = useMemo(() =>
    structure?.type === 'vs' ? (structure.heroToVillains[selectedHero] ?? []) : [],
    [structure, selectedHero]
  )

  const visibleVillainPositions = useMemo(() => {
    if (editMode) return allVillainPositions
    return allVillainPositions.filter(villain =>
      hasAnyNonFoldChart(activeData, structures, scenarios, activeSection, selectedHero, villain, playStyles)
    )
  }, [editMode, allVillainPositions, activeData, structures, scenarios, activeSection, selectedHero, playStyles])

  const visibleKeyItems = useMemo(() => {
    const seen = new Set()
    return keyItems.filter(item => {
      if (!item.selected) return false
      const group = item.label === 'Fold' ? '__fold__' : item.color
      if (seen.has(group)) return false
      seen.add(group)
      return true
    })
  }, [keyItems])

  // ── History helpers ────────────────────────────────────────────────────────
  function pushHistory(newData) {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1)
      next.push(deepCopy(newData))
      setHistoryIndex(next.length - 1)
      return next
    })
    setWorkingData(newData)
  }

  // Use refs so keyboard handler always sees current values
  const historyRef      = useRef(history)
  const historyIndexRef = useRef(historyIndex)
  const workingDataRef  = useRef(workingData)
  useEffect(() => { historyRef.current = history },      [history])
  useEffect(() => { historyIndexRef.current = historyIndex }, [historyIndex])
  useEffect(() => { workingDataRef.current = workingData },   [workingData])

  function undo() {
    const idx = historyIndexRef.current
    if (idx <= 0) return
    const prev = historyRef.current[idx - 1]
    setHistoryIndex(idx - 1)
    setWorkingData(prev)
    setSelectedCells(new Set())
  }

  function redo() {
    const idx = historyIndexRef.current, hist = historyRef.current
    if (idx >= hist.length - 1) return
    const next = hist[idx + 1]
    setHistoryIndex(idx + 1)
    setWorkingData(next)
    setSelectedCells(new Set())
  }

  const canUndo    = historyIndex > 0
  const canRedo    = historyIndex < history.length - 1
  const labelChanged = editMode && (workingLabel.trim() || currentRangeLabel) !== currentRangeLabel
  const hasChanges = historyIndex > 0 || labelChanged

  // ── Navigation ────────────────────────────────────────────────────────────
  function switchSection(section) {
    const { hero, villain } = resolveNav(structures, section, selectedHero, selectedVillain)
    setActiveSection(section)
    setSelectedHero(hero)
    if (structures[section]?.type === 'vs') {
      const allV = structures[section].heroToVillains[hero] ?? []
      const vis  = editMode ? allV : allV.filter(v =>
        hasAnyNonFoldChart(activeData, structures, scenarios, section, hero, v, playStyles)
      )
      const avail = vis.length > 0 ? vis : allV
      setSelectedVillain(avail.includes(villain) ? villain : (avail[0] ?? null))
    }
    setSelectedCells(new Set())
  }

  function switchHero(hero) {
    setSelectedHero(hero)
    if (structure?.type === 'vs') {
      const allV = structure.heroToVillains[hero] ?? []
      const vis  = editMode ? allV : allV.filter(v =>
        hasAnyNonFoldChart(activeData, structures, scenarios, activeSection, hero, v, playStyles)
      )
      const avail = vis.length > 0 ? vis : allV
      if (!avail.includes(selectedVillain)) setSelectedVillain(avail[0] ?? null)
    }
    setSelectedCells(new Set())
  }

  // ── Range management ───────────────────────────────────────────────────────
  function switchRangeType(rt) {
    if (editMode) exitEditMode(false)
    setRangeType(rt)
    setSelectedCells(new Set())
    setSelectedPlayStyle('All')
  }

  function handleRangeCreated({ id: baseId, label, data }) {
    const existingIds = allRangeOptions.map(o => o.value)
    let id = baseId
    if (existingIds.includes(id)) {
      let n = 2; while (existingIds.includes(`${id}-${n}`)) n++; id = `${id}-${n}`
    }
    const updated = [...customRanges, { id, label, data }]
    setCustomRanges(updated)
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(updated)) } catch {}
    setRangeType(id)
    setModalOpen(false)
  }

  // ── Edit mode lifecycle ────────────────────────────────────────────────────
  function enterEditMode() {
    const initial = deepCopy(activeData)
    setHistory([initial])
    setHistoryIndex(0)
    setWorkingData(initial)
    setWorkingLabel(activeData._meta?.title ?? currentRangeLabel)
    setSelectedCells(new Set())
    setEditMode(true)
  }

  function exitEditMode(save) {
    if (save) {
      const newLabel = workingLabel.trim() || currentRangeLabel
      const isCustom = customRanges.some(cr => cr.id === rangeType)

      // Save data changes (embed title in _meta)
      if (workingData) {
        const dataToSave = deepCopy(workingData)
        if (!dataToSave._meta) dataToSave._meta = {}
        dataToSave._meta.title = newLabel
        if (isCustom) {
          const updated = customRanges.map(cr =>
            cr.id === rangeType ? { ...cr, data: dataToSave, label: newLabel } : cr
          )
          setCustomRanges(updated)
          try { localStorage.setItem(LS_CUSTOM, JSON.stringify(updated)) } catch {}
        } else {
          const newOverrides = { ...overrides, [rangeType]: dataToSave }
          setOverrides(newOverrides)
          try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(newOverrides)) } catch {}
        }
      }

      // Save label changes (non-custom ranges need a separate override)
      if (!isCustom && newLabel !== currentRangeLabel) {
        const newLabelOverrides = { ...labelOverrides, [rangeType]: newLabel }
        setLabelOverrides(newLabelOverrides)
        try { localStorage.setItem(LS_LABEL_OVERRIDES, JSON.stringify(newLabelOverrides)) } catch {}
      }
    }
    setWorkingData(null)
    setHistory([])
    setHistoryIndex(-1)
    setEditMode(false)
    setEditButtonsMode(false)
    setSelectedCells(new Set())
    setDragAnchor(null); setDragCurrent(null)
    setHeaderDrag(null); setIsDragging(false)
  }

  function deleteRange() {
    const isCustom = customRanges.some(cr => cr.id === rangeType)
    if (isCustom) {
      const updated = customRanges.filter(cr => cr.id !== rangeType)
      setCustomRanges(updated)
      try { localStorage.setItem(LS_CUSTOM, JSON.stringify(updated)) } catch {}
    } else {
      const newOverrides = { ...overrides }; delete newOverrides[rangeType]
      setOverrides(newOverrides)
      try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(newOverrides)) } catch {}
    }
    setEditMode(false); setWorkingData(null); setDeleteConfirmOpen(false); setRangeType('cash')
  }

  // ── Tile selection ─────────────────────────────────────────────────────────
  function handleCellMouseDown(e, hand, row, col) {
    e.preventDefault()
    setIsDragging(true)
    setDragAnchor({ row, col })
    setDragCurrent({ row, col })
    const removing = selectedCells.has(hand)
    setDragMode(removing ? 'remove' : 'add')
    setPreDragSelection(new Set(selectedCells))
    setHeaderDrag(null)
  }

  function handleCellMouseEnter(e, hand, row, col) {
    if (!isDragging || headerDrag) return
    setDragCurrent({ row, col })
  }

  function handleRowHeaderMouseDown(e, row) {
    e.preventDefault()
    const cells = getRowCells(row)
    const allSel = [...cells].every(h => selectedCells.has(h))
    setIsDragging(true)
    setHeaderDrag({ axis: 'row', anchor: row, current: row, mode: allSel ? 'remove' : 'add', preDrag: new Set(selectedCells) })
    setDragAnchor(null); setDragCurrent(null)
  }

  function handleRowHeaderMouseEnter(row) {
    if (!isDragging || !headerDrag || headerDrag.axis !== 'row') return
    setHeaderDrag(prev => ({ ...prev, current: row }))
  }

  function handleColHeaderMouseDown(e, col) {
    e.preventDefault()
    const cells = getColCells(col)
    const allSel = [...cells].every(h => selectedCells.has(h))
    setIsDragging(true)
    setHeaderDrag({ axis: 'col', anchor: col, current: col, mode: allSel ? 'remove' : 'add', preDrag: new Set(selectedCells) })
    setDragAnchor(null); setDragCurrent(null)
  }

  function handleColHeaderMouseEnter(col) {
    if (!isDragging || !headerDrag || headerDrag.axis !== 'col') return
    setHeaderDrag(prev => ({ ...prev, current: col }))
  }

  function handleMouseUp() {
    if (!isDragging) return

    if (headerDrag) {
      const { axis, anchor, current, mode, preDrag } = headerDrag
      const minI = Math.min(anchor, current), maxI = Math.max(anchor, current)
      const rect = new Set()
      for (let i = minI; i <= maxI; i++) {
        const cells = axis === 'row' ? getRowCells(i) : getColCells(i)
        cells.forEach(h => rect.add(h))
      }
      setSelectedCells(mode === 'add'
        ? new Set([...preDrag, ...rect])
        : new Set([...preDrag].filter(h => !rect.has(h)))
      )
      setHeaderDrag(null)
    } else if (dragAnchor && dragCurrent && preDragSelection !== null) {
      const rect = getRectSelection(dragAnchor, dragCurrent)
      setSelectedCells(dragMode === 'add'
        ? new Set([...preDragSelection, ...rect])
        : new Set([...preDragSelection].filter(h => !rect.has(h)))
      )
      setDragAnchor(null); setDragCurrent(null)
      setPreDragSelection(null); setDragMode(null)
    }
    setIsDragging(false)
  }

  // Computed display selection (live during drag)
  const displaySelection = useMemo(() => {
    if (!editMode) return new Set()
    if (headerDrag) {
      const { axis, anchor, current, mode, preDrag } = headerDrag
      const minI = Math.min(anchor, current), maxI = Math.max(anchor, current)
      const rect = new Set()
      for (let i = minI; i <= maxI; i++) {
        const cells = axis === 'row' ? getRowCells(i) : getColCells(i)
        cells.forEach(h => rect.add(h))
      }
      return mode === 'add'
        ? new Set([...preDrag, ...rect])
        : new Set([...preDrag].filter(h => !rect.has(h)))
    }
    if (dragAnchor && dragCurrent && preDragSelection !== null) {
      const rect = getRectSelection(dragAnchor, dragCurrent)
      return dragMode === 'add'
        ? new Set([...preDragSelection, ...rect])
        : new Set([...preDragSelection].filter(h => !rect.has(h)))
    }
    return selectedCells
  }, [editMode, selectedCells, dragAnchor, dragCurrent, preDragSelection, dragMode, headerDrag])

  // ── Action assignment ──────────────────────────────────────────────────────
  function assignAction(action) {
    const cells = displaySelection.size ? displaySelection : selectedCells
    if (!cells.size || !activeChart) return
    const newData = deepCopy(workingData ?? activeData)
    if (!newData[activeChart]) {
      newData[activeChart] = { scenario: activeSection, hands: {} }
    }
    cells.forEach(hand => { newData[activeChart].hands[hand] = action })
    pushHistory(newData)
    setSelectedCells(new Set())
  }

  // ── Copy / Paste ───────────────────────────────────────────────────────────
  function copyChart() {
    if (!activeChart) return
    const data = workingData ?? activeData
    setClipboard({ hands: deepCopy(currentHands), keyItems: deepCopy(getChartKeyItems(data, activeChart)) })
  }

  function pasteChart() {
    if (!clipboard || !activeChart) return
    const newData = deepCopy(workingData ?? activeData)
    if (!newData[activeChart]) newData[activeChart] = { scenario: activeSection, hands: {} }
    newData[activeChart].hands = deepCopy(clipboard.hands)
    if (clipboard.keyItems) newData[activeChart].keyItems = deepCopy(clipboard.keyItems)
    pushHistory(newData)
    setSelectedCells(new Set())
  }

  // ── Key items update ───────────────────────────────────────────────────────
  function handleKeyItemsChange(newItems) {
    const newData = deepCopy(workingData ?? activeData)
    if (activeChart) {
      if (!newData[activeChart]) newData[activeChart] = { scenario: activeSection, hands: {} }
      newData[activeChart].keyItems = newItems

      // If the selected red label changed, persist it at the scenario level and
      // propagate it to every other chart in the same scenario that already has
      // its own keyItems stored (charts without explicit keyItems will get the
      // correct label automatically through getChartKeyItems).
      const selectedRedItem = newItems.find(item => item.color === '#ff4961' && item.selected)
      const scenario = newData[activeChart]?.scenario
      if (selectedRedItem && scenario) {
        if (!newData._meta) newData._meta = {}
        if (!newData._meta.scenarioRedLabels) newData._meta.scenarioRedLabels = {}
        newData._meta.scenarioRedLabels[scenario] = selectedRedItem.label

        Object.keys(newData).forEach(key => {
          if (key === '_meta' || key === activeChart) return
          if (newData[key]?.scenario === scenario && newData[key]?.keyItems) {
            newData[key].keyItems = newData[key].keyItems.map(item =>
              item.color === '#ff4961'
                ? { ...item, selected: item.label === selectedRedItem.label }
                : item
            )
          }
        })
      }
    } else {
      if (!newData._meta) newData._meta = {}
      newData._meta.keyItems = newItems
    }
    pushHistory(newData)
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!editMode) return
    function onKey(e) {
      if (editButtonsMode) {
        if (e.key === 'Escape') cancelEditButtons()
        return
      }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return }
      if (e.key === 'Escape') { setSelectedCells(new Set()); return }
      const sel = displaySelection.size ? displaySelection : selectedCells
      if (!sel.size) return
      const ki = getChartKeyItems(workingDataRef.current ?? activeData, activeChart)
      if (e.key === 'r' || e.key === 'R') {
        const item = ki.find(k => k.color === '#ff4961' && k.selected)
        if (item) assignAction(item.label)
      } else if (e.key === 'g' || e.key === 'G') {
        const item = ki.find(k => k.color === '#2fdf75' && k.selected)
        if (item) assignAction(item.label)
      } else if (e.key === 'b' || e.key === 'B') {
        const item = ki.find(k => k.color === '#4488ff' && k.selected)
        if (item) assignAction(item.label)
      } else if (e.key === ' ' || e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); assignAction('Fold')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // no dep array: closures must be fresh every render

  // Click outside chart to deselect
  const chartAreaRef = useRef(null)
  useEffect(() => {
    if (!editMode) return
    function onDocMouseDown(e) {
      if (chartAreaRef.current && !chartAreaRef.current.contains(e.target)) {
        setSelectedCells(new Set())
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [editMode])

  // ── Edit Buttons mode ──────────────────────────────────────────────────────
  function enterEditButtons() {
    const newData = deepCopy(workingData ?? activeData)
    const { positions, scenarios: scNames } = getMetaGroupsFromData(newData)
    if (!newData._meta) newData._meta = {}
    if (!newData._meta.positions)     newData._meta.positions     = positions
    if (!newData._meta.scenarioOrder) newData._meta.scenarioOrder = scNames
    setWorkingData(newData)
    setPreEditButtonsData(deepCopy(newData))
    setEditButtonsMode(true)
    setEditingBtnIdx(null)
    setDeleteBtnConfirm(null)
  }

  function cancelEditButtons() {
    setWorkingData(preEditButtonsData)
    setPreEditButtonsData(null)
    setEditButtonsMode(false)
    setEditingBtnIdx(null)
  }

  function doneEditButtons() {
    // Push Edit Buttons changes to history so they can be undone
    pushHistory(workingData ?? activeData)
    setPreEditButtonsData(null)
    setEditButtonsMode(false)
    setEditingBtnIdx(null)
  }

  function getEditGroups() {
    return getMetaGroupsFromData(workingData ?? activeData)
  }

  function renameButton(group, oldName, newName) {
    const trimmed = newName.trim()
    setEditingBtnIdx(null)
    if (!trimmed || trimmed === oldName) return
    const newData = deepCopy(workingData ?? activeData)

    if (group === 'scenarios') {
      Object.values(newData).forEach(entry => {
        if (entry && entry.scenario === oldName) entry.scenario = trimmed
      })
      if (newData._meta?.scenarioOrder) {
        newData._meta.scenarioOrder = newData._meta.scenarioOrder.map(s => s === oldName ? trimmed : s)
      }
    } else if (group === 'playStyles') {
      if (!newData._meta) newData._meta = {}
      newData._meta.villainPlayStyles = (newData._meta.villainPlayStyles ?? ['All'])
        .map(s => s === oldName ? trimmed : s)
      // Rename chart keys with old play style tag
      const keysToRename = Object.keys(newData).filter(k => k.endsWith(` [${oldName}]`))
      keysToRename.forEach(k => {
        const newKey = k.slice(0, k.lastIndexOf(' [')) + ` [${trimmed}]`
        newData[newKey] = newData[k]
        delete newData[k]
      })
    } else if (group === 'positions') {
      const newKeys = {}
      Object.entries(newData).forEach(([k, v]) => {
        if (k === '_meta') { newKeys[k] = v; return }
        newKeys[renamePositionInKey(k, oldName, trimmed)] = v
      })
      Object.assign(newData, {})
      Object.keys(newData).forEach(k => delete newData[k])
      Object.assign(newData, newKeys)
      if (newData._meta?.positions) {
        newData._meta.positions = newData._meta.positions.map(p => p === oldName ? trimmed : p)
      }
    }
    setWorkingData(newData)
  }

  function deleteButton(group, name) {
    const newData = deepCopy(workingData ?? activeData)
    if (group === 'scenarios') {
      Object.keys(newData).forEach(k => {
        if (k !== '_meta' && newData[k]?.scenario === name) delete newData[k]
      })
      if (newData._meta?.scenarioOrder) {
        newData._meta.scenarioOrder = newData._meta.scenarioOrder.filter(s => s !== name)
      }
    } else if (group === 'playStyles') {
      if (newData._meta) {
        newData._meta.villainPlayStyles = (newData._meta.villainPlayStyles ?? []).filter(s => s !== name)
      }
      Object.keys(newData).forEach(k => {
        if (k.endsWith(` [${name}]`)) delete newData[k]
      })
    } else if (group === 'positions') {
      Object.keys(newData).forEach(k => {
        if (k === '_meta') return
        const base = k.includes(' [') ? k.slice(0, k.lastIndexOf(' [')) : k
        // Single-type: key is just the position name
        if (base === name) { delete newData[k]; return }
        // VS-type: check hero and villain in "HERO vs VILLAIN ..." format
        const vsIdx = base.indexOf(' vs ')
        if (vsIdx >= 0) {
          const hero    = base.slice(0, vsIdx)
          const rest    = base.slice(vsIdx + 4)
          const villain = rest.split(/[ (]/)[0]
          if (hero === name || villain === name) delete newData[k]
        }
      })
      if (newData._meta?.positions) {
        newData._meta.positions = newData._meta.positions.filter(p => p !== name)
      }
    }
    setWorkingData(newData)
    setDeleteBtnConfirm(null)
  }

  function addButton(group) {
    setWorkingData(prev => {
      if (!prev) return prev
      const newData = deepCopy(prev)
      const { scenarios: scNames, positions, playStyles } = getMetaGroupsFromData(newData)
      const { structures: st } = buildStructures(newData)
      if (!newData._meta) newData._meta = {}

      if (group === 'playStyles') {
        const placeholder = `Play Style ${playStyles.length + 1}`
        newData._meta.villainPlayStyles = [...playStyles, placeholder]
      } else if (group === 'scenarios') {
        const placeholder = `Scenario ${scNames.length + 1}`
        if (!newData._meta.scenarioOrder) newData._meta.scenarioOrder = [...scNames]
        newData._meta.scenarioOrder.push(placeholder)
        positions.forEach(hero => {
          positions.forEach(villain => {
            if (hero !== villain) {
              newData[`${hero} vs ${villain} (${placeholder})`] = { scenario: placeholder, hands: {} }
            }
          })
        })
      } else if (group === 'positions') {
        const placeholder = `P${positions.length + 1}`
        if (!newData._meta.positions) newData._meta.positions = [...positions]
        newData._meta.positions.push(placeholder)
        scNames.forEach(sc => {
          const struct = st[sc]
          if (!struct) return
          if (struct.type === 'single') {
            if (!newData[placeholder]) newData[placeholder] = { scenario: sc, hands: {} }
          } else {
            // New position as hero vs all existing positions
            positions.forEach(other => {
              const asHero = `${placeholder} vs ${other} (${sc})`
              if (!newData[asHero]) newData[asHero] = { scenario: sc, hands: {} }
              // New position as villain vs all existing positions
              const asVillain = `${other} vs ${placeholder} (${sc})`
              if (!newData[asVillain]) newData[asVillain] = { scenario: sc, hands: {} }
            })
          }
        })
      }
      return newData
    })
  }

  function moveButton(group, fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const newData = deepCopy(workingData ?? activeData)
    if (!newData._meta) newData._meta = {}
    const groups = getMetaGroupsFromData(newData)
    const arr = [...groups[group]]
    const [moved] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, moved)
    const metaKey = {
      playStyles: 'villainPlayStyles',
      scenarios:  'scenarioOrder',
      positions:  'positions',
    }[group]
    if (metaKey) newData._meta[metaKey] = arr
    setWorkingData(newData)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const editGroups = editButtonsMode ? getEditGroups() : null

  return (
    <div
      className={`app${editMode ? ' edit-mode' : ''}`}
      onMouseUp={isDragging ? handleMouseUp : undefined}
    >
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          {editMode ? (
            <>
              <button className="edit-undo-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
              <button className="edit-redo-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪ Redo</button>
            </>
          ) : (
            <button className="export-btn" onClick={() => exportRange(activeData, currentRangeLabel)}>
              ↓ Export
            </button>
          )}
        </div>

        <div className="header-center">
          {editMode ? (
            <input
              className="range-title-input"
              value={workingLabel}
              onChange={e => setWorkingLabel(e.target.value)}
            />
          ) : (
            <div className="range-select-wrapper">
              <select
                className="range-select"
                value={rangeType}
                onChange={e => {
                  if (e.target.value === '__create__') setModalOpen(true)
                  else switchRangeType(e.target.value)
                }}
              >
                {allRangeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option disabled>────────────────</option>
                <option value="__create__">+ Create custom range</option>
              </select>
              <span className="range-select-arrow">▾</span>
            </div>
          )}
        </div>

        <div className="header-right">
          {editMode ? (
            <>
              <button className="edit-cancel-btn" onClick={() => exitEditMode(false)}>Cancel</button>
              <button className="edit-save-btn" disabled={!hasChanges} onClick={() => exitEditMode(true)}>
                Save
              </button>
            </>
          ) : (
            <button className="edit-btn" onClick={enterEditMode}>✎ Edit</button>
          )}
        </div>
      </header>

      {/* ── Scenario row (normal mode) ── */}
      {!editButtonsMode && (
        <nav className="section-tabs">
          {editMode && (
            <button className="edit-buttons-btn" onClick={enterEditButtons}>Edit Buttons</button>
          )}
          <span className="row-label">Scenario:</span>
          {sectionNames.map(s => (
            <button
              key={s}
              className={`section-tab ${activeSection === s ? 'active' : ''}`}
              onClick={() => switchSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>
      )}

      {/* ── Edit Buttons panel ── */}
      {editButtonsMode && editGroups && (
        <div className="edit-buttons-panel">
          <div className="edit-buttons-header">
            <button className="modal-cancel-btn" onClick={cancelEditButtons}>Cancel</button>
            <span className="edit-buttons-hint">Click and drag to rearrange buttons</span>
            <button className="modal-create-btn" onClick={doneEditButtons}>Done</button>
          </div>
          {[
            { group: 'scenarios', label: 'Scenario:' },
            { group: 'positions', label: 'Position:' },
            { group: 'playStyles', label: 'Villain Play Style:' },
          ].map(({ group, label }) => (
            <div key={group} className="edit-buttons-row">
              <span className="row-label">{label}</span>
              {editGroups[group].map((name, idx) => (
                <div key={`${name}-${idx}`} className="edit-btn-chip-wrapper">
                  {editingBtnIdx?.group === group && editingBtnIdx?.idx === idx ? (
                    <input
                      className="edit-btn-input"
                      autoFocus
                      defaultValue={name}
                      onBlur={e  => renameButton(group, name, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') renameButton(group, name, e.target.value)
                        if (e.key === 'Escape') setEditingBtnIdx(null)
                      }}
                    />
                  ) : deleteBtnConfirm?.group === group && deleteBtnConfirm?.idx === idx ? (
                    <div className="delete-btn-confirm">
                      <span>Delete "{name}"?</span>
                      <button className="del-confirm-yes" onClick={() => deleteButton(group, name)}>Confirm</button>
                      <button className="del-confirm-no"  onClick={() => setDeleteBtnConfirm(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div
                      className="edit-btn-chip"
                      draggable
                      onDragStart={() => { dragBtnRef.current = { group, idx } }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (dragBtnRef.current?.group === group && dragBtnRef.current.idx !== idx) {
                          moveButton(group, dragBtnRef.current.idx, idx)
                        }
                        dragBtnRef.current = null
                      }}
                      onDragEnd={() => { dragBtnRef.current = null }}
                    >
                      <span>{name}</span>
                      <button className="btn-chip-pencil" onClick={() => setEditingBtnIdx({ group, idx })} title="Rename">✎</button>
                      <button className="btn-chip-del" onClick={() => setDeleteBtnConfirm({ group, idx })} title="Delete">✕</button>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn-chip-add" onClick={() => addButton(group)}>+</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Position rows ── */}
      {!editButtonsMode && structure && (
        <div className="position-selector">
          <div className="position-row">
            <span className="row-label">Hero Position:</span>
            {structure.heroes.map(pos => (
              <button key={pos} className={`pos-btn ${selectedHero === pos ? 'active' : ''}`} onClick={() => switchHero(pos)}>
                {pos}
              </button>
            ))}
          </div>
          {structure.type === 'vs' && visibleVillainPositions.length > 0 && (
            <div className="position-row">
              <span className="row-label">Villain Position:</span>
              {visibleVillainPositions.map(pos => (
                <button key={pos} className={`pos-btn ${selectedVillain === pos ? 'active' : ''}`} onClick={() => setSelectedVillain(pos)}>
                  {pos}
                </button>
              ))}
            </div>
          )}
          <div className="position-row">
            <span className="row-label">Villain Play Style:</span>
            {playStyles.map(ps => (
              <button key={ps} className={`pos-btn ${selectedPlayStyle === ps ? 'active' : ''}`} onClick={() => setSelectedPlayStyle(ps)}>
                {ps}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Chart area ── */}
      <main className={`chart-area${editButtonsMode ? ' chart-blur' : ''}`} ref={chartAreaRef}>
        <div className="chart-title">{displayTitle}</div>

        <div className="chart-and-controls">
          {editMode && !editButtonsMode && (
            <div className="copy-paste-row">
              <button className="cp-btn" onClick={copyChart} disabled={!activeChart}>
                <CopyIcon /> Copy
              </button>
              <button className="cp-btn" onClick={pasteChart} disabled={!clipboard}>
                <PasteIcon /> Paste
              </button>
            </div>
          )}
          <ChartGrid
            hands={currentHands}
            actionColors={actionColors}
            editMode={editMode && !editButtonsMode}
            displaySelection={displaySelection}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseEnter={handleCellMouseEnter}
            onCellMouseUp={handleMouseUp}
            onRowHeaderMouseDown={handleRowHeaderMouseDown}
            onRowHeaderMouseEnter={handleRowHeaderMouseEnter}
            onColHeaderMouseDown={handleColHeaderMouseDown}
            onColHeaderMouseEnter={handleColHeaderMouseEnter}
            onMouseLeave={() => setHoveredHand(null)}
            onHover={setHoveredHand}
            onHoverEnd={() => setHoveredHand(null)}
          />
        </div>

        {/* Legend / Key */}
        <div className={`legend${editMode && !editButtonsMode ? ' legend-edit' : ''}`}>
          {visibleKeyItems.map(item => (
            <div
              key={item.label}
              className={`legend-item${editMode && !editButtonsMode ? ' legend-btn' : ''}`}
              onClick={editMode && !editButtonsMode ? () => assignAction(item.label) : undefined}
            >
              <div className="legend-swatch" style={{ backgroundColor: item.color }} />
              <div>
                <span>{item.label}</span>
                {editMode && !editButtonsMode && (
                  <div className="key-shortcut">
                    {item.color === '#ff4961' ? '[R]'
                      : item.color === '#2fdf75' ? '[G]'
                      : item.color === '#4488ff' ? '[B]'
                      : item.label === 'Fold'   ? '[Space]' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
          {editMode && !editButtonsMode && (
            <button className="edit-key-btn" onClick={() => setKeyEditOpen(true)}>Edit Key</button>
          )}
        </div>

        {/* Tooltip */}
        {hoveredHand && !editMode && (
          <div className="tooltip">
            <strong>{hoveredHand.hand}</strong>
            <span style={{ color: actionColors[hoveredHand.action] ?? '#aaa' }}>
              {hoveredHand.action}
            </span>
          </div>
        )}
      </main>

      {/* Delete Set button */}
      {editMode && !editButtonsMode && (
        <button className="delete-range-btn" onClick={() => setDeleteConfirmOpen(true)}>
          Delete Set
        </button>
      )}

      {/* ── Modals ── */}
      <CreateRangeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleRangeCreated}
        existingRanges={allRangeOptions}
      />
      {keyEditOpen && (
        <EditKeyModal
          keyItems={keyItems}
          onClose={() => setKeyEditOpen(false)}
          onChange={handleKeyItemsChange}
        />
      )}
      {deleteConfirmOpen && (
        <DeleteConfirm
          label={workingLabel || currentRangeLabel}
          onConfirm={deleteRange}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  )
}
