import type { ReactNode } from 'react';
import type { HevyStatus } from '../../shared/coach-protocol';

/** Only riders who also train with Hevy, or began strength training in the app, get an overview; everyone else lands on the bike page as before. */
export const homeScreen = (hevy: HevyStatus, gymEnabled = false): 'overview' | 'bike' => (hevy.state === 'connected' || gymEnabled ? 'overview' : 'bike');

type Props = { name: string; avatar?: string; onBike: () => void; onStrength: () => void; onHealth: () => void; bikeNext?: string | null; strengthNext?: string | null; today?: ReactNode };

/** The start page: the three areas with what is next in each. The menu bar above leads to the same places. */
export const OverviewView = ({ name, avatar, onBike, onStrength, onHealth, bikeNext, strengthNext, today }: Props) => (
  <main className="home overview">
    <div className="top">
      <h1>{avatar && <span aria-hidden="true">{avatar} </span>}{name}</h1>
    </div>
    {today && <div className="tk-screen overview-today">{today}</div>}
    <div className="choices">
      <button className="choice" onClick={onBike}>Rad<small>{bikeNext ? `Als Nächstes: ${bikeNext}` : 'Fahren, wann du magst'}</small></button>
      <button className="choice" onClick={onStrength}>Kraft<small>{strengthNext ? `Als Nächstes: ${strengthNext}` : 'Dein Krafttraining'}</small></button>
      <button className="choice" onClick={onHealth}>Gesundheit<small>Wie es dir geht</small></button>
    </div>
  </main>
);
