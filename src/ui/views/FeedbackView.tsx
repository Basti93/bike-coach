import type { CoachClientMessage } from '../../shared/coach-protocol';

export const FeedbackView = ({ profileId, rideId, send }: { profileId: string; rideId: string; send: (m: CoachClientMessage) => void }) => {
  const rate = (rating: 'easy' | 'right' | 'hard') => send({ type: 'feedback', profileId, rideId, rating });
  return (
    <main>
      <h2>Wie war die Fahrt?</h2>
      <div className="row">
        <button onClick={() => rate('easy')}>Zu leicht</button>
        <button onClick={() => rate('right')}>Genau richtig</button>
        <button onClick={() => rate('hard')}>Zu hart</button>
        <button className="secondary" onClick={() => send({ type: 'skip-feedback', profileId })}>Überspringen</button>
      </div>
    </main>
  );
};
