import React from 'react'

export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']

export function getHandName(row, col) {
  const r1 = RANKS[row], r2 = RANKS[col]
  if (row === col) return `${r1}${r2}`
  if (row < col)  return `${r1}${r2}s`
  return `${r2}${r1}o`
}

export function getRectSelection(anchor, current) {
  const minRow = Math.min(anchor.row, current.row)
  const maxRow = Math.max(anchor.row, current.row)
  const minCol = Math.min(anchor.col, current.col)
  const maxCol = Math.max(anchor.col, current.col)
  const cells = new Set()
  for (let r = minRow; r <= maxRow; r++)
    for (let c = minCol; c <= maxCol; c++)
      cells.add(getHandName(r, c))
  return cells
}

export default function ChartGrid({
  hands, actionColors, editMode, displaySelection,
  onCellMouseDown, onCellMouseEnter, onCellMouseUp,
  onRowHeaderMouseDown, onRowHeaderMouseEnter,
  onColHeaderMouseDown, onColHeaderMouseEnter,
  onMouseLeave, onHover, onHoverEnd,
}) {
  return (
    <div
      className="chart-grid"
      onMouseLeave={onMouseLeave}
      onMouseUp={onCellMouseUp}
    >
      <div className="corner-cell" />
      {RANKS.map((r, ci) => (
        <div
          key={r}
          className={`rank-label top${editMode ? ' editable-header' : ''}`}
          onMouseDown={editMode ? (e) => onColHeaderMouseDown(e, ci) : undefined}
          onMouseEnter={editMode ? () => onColHeaderMouseEnter(ci) : undefined}
        >
          {r}
        </div>
      ))}
      {RANKS.map((r1, row) => (
        <React.Fragment key={r1}>
          <div
            className={`rank-label left${editMode ? ' editable-header' : ''}`}
            onMouseDown={editMode ? (e) => onRowHeaderMouseDown(e, row) : undefined}
            onMouseEnter={editMode ? () => onRowHeaderMouseEnter(row) : undefined}
          >
            {r1}
          </div>
          {RANKS.map((r2, col) => {
            const hand   = getHandName(row, col)
            const action = hands[hand] ?? 'Fold'
            const color  = actionColors[action] ?? actionColors['Fold'] ?? '#3a3a4a'
            const sel    = displaySelection?.has(hand) ?? false
            return (
              <div
                key={hand}
                className={`hand-cell${sel ? ' selected' : ''}`}
                style={{ backgroundColor: color }}
                onMouseDown={editMode ? (e) => onCellMouseDown(e, hand, row, col) : undefined}
                onMouseEnter={editMode
                  ? (e) => { onCellMouseEnter(e, hand, row, col); onHover?.({ hand, action }) }
                  : () => onHover?.({ hand, action })
                }
                onMouseLeave={onHoverEnd}
                onMouseUp={editMode ? onCellMouseUp : undefined}
              >
                <span className="hand-label">{hand}</span>
              </div>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}
