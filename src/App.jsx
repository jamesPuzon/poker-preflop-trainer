import { useState, useMemo } from 'react'
import React from 'react'
import cashData from './cash_chart_data.json'
import mttData  from './chart_data.json'
import './App.css'

const RANKS          = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const POSITION_ORDER = ['LJ','HJ','CO','BTN','SB','BB']

const RANGE_OPTIONS = [
  { value: 'cash', label: 'Cash 100 Simple Preflop Ranges', data: cashData },
  { value: 'mtt',  label: 'MTT 100 Simple Preflop Ranges',  data: mttData  },
]

function getHandName(row, col) {
  const r1 = RANKS[row], r2 = RANKS[col]
  if (row === col) return `${r1}${r2}`
  if (row < col)  return `${r1}${r2}s`
  return `${r2}${r1}o`
}

const ACTION_COLORS = { raise: '#ff4961', call: '#2fdf75', fold: '#3a3a4a' }
const ACTION_LABELS = { raise: 'Raise / 3-Bet / 4-Bet', call: 'Call', fold: 'Fold' }

// Build section structure from a chart-data object (same for both ranges)
function buildStructures(data) {
  const sections = {}
  Object.entries(data).forEach(([name, d]) => {
    if (!sections[d.section]) sections[d.section] = []
    sections[d.section].push(name)
  })

  const structures = {}
  Object.entries(sections).forEach(([section, charts]) => {
    if (section === 'Unopened pot') {
      structures[section] = {
        type: 'single',
        heroes: POSITION_ORDER.filter(p => charts.includes(p)),
      }
    } else {
      const heroToVillains = {}
      charts.forEach(name => {
        const m = name.match(/^(\w+) vs (\w+)/)
        if (m) {
          const [, hero, villain] = m
          if (!heroToVillains[hero]) heroToVillains[hero] = []
          heroToVillains[hero].push(villain)
        }
      })
      const heroes = POSITION_ORDER.filter(p => heroToVillains[p])
      heroes.forEach(h => {
        heroToVillains[h] = POSITION_ORDER.filter(p => heroToVillains[h].includes(p))
      })
      structures[section] = { type: 'vs', heroes, heroToVillains }
    }
  })
  return { sections, structures, sectionNames: Object.keys(sections) }
}

// Both ranges have identical structure — compute once
const { sections: SECTIONS, structures: SECTION_STRUCTURES, sectionNames: SECTION_NAMES } =
  buildStructures(cashData)

function getChartName(section, hero, villain) {
  if (section === 'Unopened pot') return hero
  return SECTIONS[section]?.find(n => n.startsWith(`${hero} vs ${villain}`)) ?? null
}

// Resolve a target (section, hero, villain) to the nearest valid combination.
// villain is kept in state even on 'single' sections so it can be restored.
function resolveNav(targetSection, targetHero, targetVillain) {
  const struct = SECTION_STRUCTURES[targetSection]

  // Hero: keep if valid, else first available
  const hero = struct.heroes.includes(targetHero)
    ? targetHero
    : struct.heroes[0]

  // Villain: keep if valid for hero, else first available (or null for single)
  let villain = targetVillain
  if (struct.type === 'vs') {
    const avail = struct.heroToVillains[hero] ?? []
    if (!avail.includes(villain)) villain = avail[0] ?? null
  }
  // On 'single' sections we leave villain unchanged so it can be restored later

  return { hero, villain }
}

export default function App() {
  const [rangeType,      setRangeType]      = useState('cash')
  const [activeSection,  setActiveSection]  = useState(SECTION_NAMES[0])
  const [selectedHero,   setSelectedHero]   = useState(SECTION_STRUCTURES[SECTION_NAMES[0]].heroes[0])
  const [selectedVillain,setSelectedVillain]= useState(null)
  const [hoveredHand,    setHoveredHand]    = useState(null)

  const activeData = RANGE_OPTIONS.find(o => o.value === rangeType).data
  const structure  = SECTION_STRUCTURES[activeSection]

  const activeChart = useMemo(() =>
    getChartName(activeSection, selectedHero, selectedVillain),
    [activeSection, selectedHero, selectedVillain]
  )

  const hands = activeChart ? (activeData[activeChart]?.hands ?? {}) : {}

  // ── Navigation helpers ──────────────────────────────────────────────────
  function switchSection(section) {
    const { hero, villain } = resolveNav(section, selectedHero, selectedVillain)
    setActiveSection(section)
    setSelectedHero(hero)
    // Only update villain for VS sections; for single sections keep stored villain
    if (SECTION_STRUCTURES[section].type === 'vs') setSelectedVillain(villain)
  }

  function switchHero(hero) {
    setSelectedHero(hero)
    if (structure.type === 'vs') {
      const avail = structure.heroToVillains[hero] ?? []
      if (!avail.includes(selectedVillain)) setSelectedVillain(avail[0] ?? null)
    }
  }

  function switchRangeType(rt) {
    // Both ranges share identical structure, so no position adjustments needed
    setRangeType(rt)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="range-select-wrapper">
          <select
            className="range-select"
            value={rangeType}
            onChange={e => switchRangeType(e.target.value)}
          >
            {RANGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="range-select-arrow">▾</span>
        </div>
      </header>

      <nav className="section-tabs">
        {SECTION_NAMES.map(s => (
          <button
            key={s}
            className={`section-tab ${activeSection === s ? 'active' : ''}`}
            onClick={() => switchSection(s)}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className="position-selector">
        <div className="position-row">
          {structure.heroes.map(pos => (
            <button
              key={pos}
              className={`pos-btn ${selectedHero === pos ? 'active' : ''}`}
              onClick={() => switchHero(pos)}
            >
              {pos}
            </button>
          ))}
        </div>

        {structure.type === 'vs' && (
          <>
            <div className="vs-label">VS</div>
            <div className="position-row">
              {(structure.heroToVillains[selectedHero] ?? []).map(pos => (
                <button
                  key={pos}
                  className={`pos-btn ${selectedVillain === pos ? 'active' : ''}`}
                  onClick={() => setSelectedVillain(pos)}
                >
                  {pos}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <main className="chart-area">
        <div className="chart-title">{activeChart ?? '—'}</div>

        <div className="chart-wrapper">
          <div className="chart-grid">
            <div className="corner-cell" />
            {RANKS.map(r => <div key={r} className="rank-label top">{r}</div>)}
            {RANKS.map((r1, row) => (
              <React.Fragment key={r1}>
                <div className="rank-label left">{r1}</div>
                {RANKS.map((r2, col) => {
                  const hand   = getHandName(row, col)
                  const action = hands[hand] ?? 'fold'
                  return (
                    <div
                      key={hand}
                      className="hand-cell"
                      style={{ backgroundColor: ACTION_COLORS[action] }}
                      onMouseEnter={() => setHoveredHand({ hand, action })}
                      onMouseLeave={() => setHoveredHand(null)}
                    >
                      <span className="hand-label">{hand}</span>
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="legend">
          {Object.entries(ACTION_LABELS).map(([action, label]) => (
            <div key={action} className="legend-item">
              <div className="legend-swatch" style={{ backgroundColor: ACTION_COLORS[action] }} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {hoveredHand && (
          <div className="tooltip">
            <strong>{hoveredHand.hand}</strong>
            <span>{ACTION_LABELS[hoveredHand.action] ?? hoveredHand.action}</span>
          </div>
        )}
      </main>
    </div>
  )
}
