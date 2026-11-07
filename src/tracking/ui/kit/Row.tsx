import type { ReactNode } from 'react';

/** The list of rows: thin dividers between them, no card around each. */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className="tk-rows" aria-label={label}>{children}</ul>;
}

/**
 * One list item: title left, a short muted value right. With `onClick` it is a button with a chevron
 * (turned down while `expanded`), and `children` show below it once expanded (or always, when `expanded` is not given).
 */
export function Row({ title, value, onClick, expanded, children }: { title: ReactNode; value?: ReactNode; onClick?: () => void; expanded?: boolean; children?: ReactNode }) {
  const inner = (
    <>
      <span className="tk-row-title">{title}</span>
      {value != null && <span className="tk-row-value muted">{value}</span>}
      {onClick && <span className={`tk-chevron${expanded ? ' open' : ''}`} aria-hidden="true">›</span>}
    </>
  );
  return (
    <li className="tk-rowitem">
      {onClick ? <button type="button" className="tk-rowbtn" aria-expanded={expanded} onClick={onClick}>{inner}</button> : <div className="tk-rowbtn">{inner}</div>}
      {children && (expanded === undefined || expanded) && <div className="tk-row-more">{children}</div>}
    </li>
  );
}
