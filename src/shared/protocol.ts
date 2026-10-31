import type { DeviceStatus, Reading } from '../service/ble/device-manager';
import type { EngineState } from '../service/engine';
import type { RideMeta } from '../service/recorder';
import type { Profile } from './profiles';
import type { Session } from './session';

export type ClientMessage =
  | { type: 'start'; profileId: string; session: Session; ftpW: number; maxHrBpm?: number }
  | { type: 'shift'; dir: 'up' | 'down' }
  | { type: 'adjust'; deltaPct: number }
  | { type: 'mark'; note?: string }
  | { type: 'stop' }
  | { type: 'discard' }
  | { type: 'resume'; rideId: string }
  | { type: 'discard-resume'; rideId: string }
  | { type: 'export-fit'; rideId: string }
  | { type: 'save-profile'; profile: Profile };

export type RecoveryOffer = { type: 'recovery-offer'; rideId: string; profileId: string; sessionName: string; rideElapsedS: number };
export type StateMessage = {
  type: 'state'; ride: RideMeta | null; engine: EngineState | null; devices: DeviceStatus;
  latest: Reading; storageError: boolean; recovered: boolean; profiles: Profile[]; session: Session | null;
};
export type ServerMessage = StateMessage | RecoveryOffer | { type: 'error'; message: string };
export const SERVICE_PORT = 7410;
