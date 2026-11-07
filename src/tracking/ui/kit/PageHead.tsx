import type { ReactNode } from 'react';

/** The top of a page: the title, an optional muted subtitle, and room on the right for the round profile button. The next block starts 16 px below. */
export function PageHead({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="tk-pagehead">
      <h1 className="tk-title">{title}</h1>
      {subtitle && <p className="tk-subtitle muted">{subtitle}</p>}
    </header>
  );
}
