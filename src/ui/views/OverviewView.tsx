import type { HevyStatus } from '../../shared/coach-protocol';

/** Only riders who also train with Hevy, or began strength training in the app, get an overview; everyone else lands on the bike page as before. */
export const homeScreen = (hevy: HevyStatus, gymEnabled = false): 'overview' | 'bike' => (hevy.state === 'connected' || gymEnabled ? 'overview' : 'bike');

type Props = { name: string; avatar?: string; onBike: () => void; onStrength: () => void; onHealth: () => void; onBack: () => void };

export const OverviewView = ({ name, avatar, onBike, onStrength, onHealth, onBack }: Props) => (
  <main className="home">
    <div className="top">
      <h1>{avatar && <span aria-hidden="true">{avatar} </span>}{name}</h1>
      <div className="row"><button className="ghost" onClick={onBack}>Profil wechseln</button></div>
    </div>
    <div className="choices">
      <button className="choice" onClick={onBike}>Rad</button>
      <button className="choice" onClick={onStrength}>Kraft</button>
      <button className="choice" onClick={onHealth}>Gesundheit</button>
    </div>
  </main>
);
