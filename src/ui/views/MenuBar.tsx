import { MENU_LABEL, type MenuItem } from '../nav';

type Props = { items: MenuItem[]; active: MenuItem; name: string; avatar?: string; onGo: (item: MenuItem) => void; onSwitch: () => void };

/** The same bar on every screen once a profile is chosen. Never shown during a ride. */
export const MenuBar = ({ items, active, name, avatar, onGo, onSwitch }: Props) => (
  <nav className="menu-bar" aria-label="Hauptmenü">
    <div className="menu-items">
      {items.map((item) => (
        <button key={item} type="button" className="menu-item" aria-current={active === item ? 'page' : undefined} onClick={() => onGo(item)}>{MENU_LABEL[item]}</button>
      ))}
    </div>
    <div className="menu-profile">
      <span className="menu-name">{avatar && <span aria-hidden="true">{avatar} </span>}{name}</span>
      <button type="button" className="menu-item" aria-current={active === 'profil' ? 'page' : undefined} onClick={() => onGo('profil')}>Profil</button>
      <button type="button" className="menu-item menu-switch" onClick={onSwitch}>Profil wechseln</button>
    </div>
  </nav>
);
