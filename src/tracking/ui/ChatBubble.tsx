import type { ReactNode } from 'react';
import type { ChatEntry } from '../../shared/chat';
import { timeLabel } from '../../shared/dates';

/** One message of a chat with the coach: who and when, the text, and what hangs on it (a change, a rule, a plan). The week chat and the workout chat use it. */
export function ChatBubble({ m, children }: { m: ChatEntry; children?: ReactNode }) {
  return (
    <div className={`tk-msg tk-msg-${m.role}`}>
      <p className="muted tk-sub">{m.role === 'rider' ? 'Du' : 'Coach'} <time>{timeLabel(m.atMs)}</time></p>
      <p>{m.text}</p>
      {children}
    </div>
  );
}

/** "Der Coach denkt nach …" and its slower variants as a message from the coach. */
export function ChatNote({ children }: { children: ReactNode }) {
  return <div className="tk-msg tk-msg-coach" role="status"><p className="muted">{children}</p></div>;
}
