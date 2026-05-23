import { useState, useRef, useEffect } from 'react'

const DEFAULT_META = {
  villainPlayStyles: ['All'],
  keyItems: [
    { label: 'Raise',          color: '#ff4961', selected: true  },
    { label: '3-bet',          color: '#ff4961', selected: false },
    { label: '4-bet',          color: '#ff4961', selected: false },
    { label: '5-bet',          color: '#ff4961', selected: false },
    { label: 'Call',           color: '#2fdf75', selected: true  },
    { label: 'Raise as Bluff', color: '#4488ff', selected: true  },
    { label: 'Fold',           color: '#3a3a4a', selected: true  },
  ],
}

const SCRATCH_SCENARIOS    = ['RFI', 'Facing a Raise', 'Facing 3-bet', 'Facing 4-bet']
const SCRATCH_POSITIONS    = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']

function buildScratchData() {
  const result = { _meta: JSON.parse(JSON.stringify(DEFAULT_META)) }
  // Pre-assign the scenario-level red label for each scratch scenario so the
  // app knows which red item to show without needing scenarioOrder in _meta.
  result._meta.scenarioRedLabels = {
    [SCRATCH_SCENARIOS[0]]: 'Raise',
    [SCRATCH_SCENARIOS[1]]: '3-bet',
    [SCRATCH_SCENARIOS[2]]: '4-bet',
    [SCRATCH_SCENARIOS[3]]: '5-bet',
  }

  // RFI: single-position charts (no villain)
  SCRATCH_POSITIONS.forEach(pos => {
    const hands = {}
    for (let r = 0; r < 13; r++)
      for (let c = 0; c < 13; c++) {
        const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
        const r1 = RANKS[r], r2 = RANKS[c]
        const hand = r === c ? `${r1}${r2}` : r < c ? `${r1}${r2}s` : `${r2}${r1}o`
        hands[hand] = 'Fold'
      }
    result[pos] = { scenario: 'RFI', hands }
  })

  // VS scenarios
  const vsScenarios = SCRATCH_SCENARIOS.slice(1)
  vsScenarios.forEach(scenario => {
    SCRATCH_POSITIONS.forEach(hero => {
      SCRATCH_POSITIONS.forEach(villain => {
        if (hero === villain) return
        const key = `${hero} vs ${villain} (${scenario})`
        const hands = {}
        for (let r = 0; r < 13; r++)
          for (let c = 0; c < 13; c++) {
            const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
            const r1 = RANKS[r], r2 = RANKS[c]
            const hand = r === c ? `${r1}${r2}` : r < c ? `${r1}${r2}s` : `${r2}${r1}o`
            hands[hand] = 'Fold'
          }
        result[key] = { scenario, hands }
      })
    })
  })

  return result
}

const OPTIONS = [
  { value: 'scratch', label: 'Create new ranges from scratch' },
  { value: 'copy',    label: 'Copy ranges from existing' },
  { value: 'import',  label: 'Import from .json' },
]

export default function CreateRangeModal({ isOpen, onClose, onCreated, existingRanges }) {
  const [name,           setName]           = useState('')
  const [option,         setOption]         = useState(null)
  const [copySource,     setCopySource]     = useState('')
  const [importData,     setImportData]     = useState(null)
  const [importFileName, setImportFileName] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setOption(null)
      setCopySource('')
      setImportData(null)
      setImportFileName('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const trimmedName = name.trim()
  const canCreate =
    trimmedName.length > 0 &&
    option !== null &&
    (option !== 'copy'   || copySource !== '') &&
    (option !== 'import' || importData !== null)

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        setImportData(parsed)
        if (parsed?._meta?.title) setName(prev => prev.trim() ? prev : parsed._meta.title)
      } catch {
        alert('Invalid JSON file — could not parse.')
        setImportData(null)
        setImportFileName('')
        fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  function handleCreate() {
    if (!canCreate) return
    let data
    if (option === 'scratch') {
      data = buildScratchData()
    } else if (option === 'copy') {
      data = JSON.parse(JSON.stringify(existingRanges.find(r => r.value === copySource).data))
    } else {
      data = importData
    }
    const id = trimmedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    onCreated({ id, label: trimmedName, data })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Create New Preflop Ranges</h2>

        <div className="modal-field">
          <label className="modal-label">Name</label>
          <input
            className="modal-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter range name"
            autoFocus
          />
        </div>

        <div className="modal-options">
          {OPTIONS.map(opt => (
            <div key={opt.value} className="modal-option-block">
              <label className="modal-radio-label">
                <input
                  type="radio"
                  name="create-option"
                  value={opt.value}
                  checked={option === opt.value}
                  onChange={() => setOption(opt.value)}
                  className="modal-radio"
                />
                {opt.label}
              </label>

              {opt.value === 'copy' && option === 'copy' && (
                <div className="modal-sub">
                  <select
                    className="modal-select"
                    value={copySource}
                    onChange={e => setCopySource(e.target.value)}
                  >
                    <option value="">Select range to copy...</option>
                    {existingRanges.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {opt.value === 'import' && option === 'import' && (
                <div className="modal-sub modal-file-row">
                  <button className="modal-file-btn" onClick={() => fileInputRef.current.click()}>
                    Choose File
                  </button>
                  {importFileName && <span className="modal-file-name">{importFileName}</span>}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="modal-create-btn" disabled={!canCreate} onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
