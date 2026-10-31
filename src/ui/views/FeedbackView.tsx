import type { CoachClientMessage } from '../../shared/coach-protocol';

export const FeedbackView = ({ profileId, rideId, send }: { profileId: string; rideId: string; send: (m: CoachClientMessage) => void }) => {
  const rate = (rating: 'easy' | 'right' | 'hard') => send({ type: 'feedback', profileId, rideId, rating });
  return (
    <main className="center">
      <p className="muted">Fahrt gespeichert.</p>
      <h1>Wie war die Fahrt?</h1>
      <div className="choices">
        <button className="choice" onClick={() => rate('easy')}>Zu leicht</button>
        <button className="choice" onClick={() => rate('right')}>Genau richtig</button>
        <button className="choice" onClick={() => rate('hard')}>Zu hart</button>
      </div>
      <button className="ghost" onClick={() => send({ type: 'skip-feedback', profileId })}>Überspringen</button>
    </main>
  );
};
