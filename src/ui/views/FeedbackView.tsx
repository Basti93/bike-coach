import { useEffect } from 'react';
import type { RideSummary } from '../../coach/metrics';
import type { Together } from '../../coach/together';
import type { CoachClientMessage, RideDetail } from '../../shared/coach-protocol';
import { RideCharts } from './RideCharts';

type Props = {
  profileId: string; rideId: string; send: (m: CoachClientMessage) => void; together?: Together | null;
  summary?: RideSummary; detail: RideDetail | null;
};

const value = (v: number | null, unit: string) => (v === null ? '–' : `${v} ${unit}`);

/** First show how the ride went, then ask how it felt. */
export const FeedbackView = ({ profileId, rideId, send, together, summary, detail }: Props) => {
  // Without send in the dependencies: useCoach returns a new one on every render, and the response would re-request endlessly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { send({ type: 'ride-detail', profileId, rideId }); }, [profileId, rideId]);
  const rate = (rating: 'easy' | 'right' | 'hard') => send({ type: 'feedback', profileId, rideId, rating });
  return (
    <main>
      <p className="muted">Schön gemacht, deine Fahrt ist gespeichert.{together ? ` Das waren ${together.lastRideMetres} Höhenmeter auf dem Weg zum ${together.peak.name}.` : ''}</p>
      {summary && (
        <>
          <h1>{summary.sessionName ?? 'Deine Fahrt'}</h1>
          <div className="stat-row">
            <div className="tile"><span className="label">Dauer</span><b>{Math.round(summary.durationS / 60)} Min.</b></div>
            <div className="tile"><span className="label">Leistung im Schnitt</span><b>{value(summary.avgPowerW, 'W')}</b></div>
            <div className="tile"><span className="label">Puls im Schnitt</span><b>{value(summary.avgHrBpm, 'bpm')}</b></div>
            <div className="tile"><span className="label">Höchster Puls</span><b>{value(summary.maxHrBpm, 'bpm')}</b></div>
          </div>
        </>
      )}
      {detail?.rideId === rideId && <section className="card"><RideCharts detail={detail} /></section>}
      {summary?.hrZoneMinutes && <p className="muted" data-testid="ride-zones">Minuten je Pulszone: {summary.hrZoneMinutes.map((m, i) => `${i + 1}: ${m}`).join(' · ')}{summary.hrTargetPct === undefined ? '' : `. ${summary.hrTargetPct} % der Zeit im Ziel oder darunter.`}</p>}
      <h2>Wie war’s heute?</h2>
      <div className="choices">
        <button className="choice" onClick={() => rate('easy')}><span aria-hidden="true">🌱 </span>Zu leicht</button>
        <button className="choice" onClick={() => rate('right')}><span aria-hidden="true">🍂 </span>Genau richtig</button>
        <button className="choice" onClick={() => rate('hard')}><span aria-hidden="true">🔥 </span>Zu hart</button>
      </div>
      <button className="ghost" onClick={() => send({ type: 'skip-feedback', profileId })}>Überspringen</button>
    </main>
  );
};
