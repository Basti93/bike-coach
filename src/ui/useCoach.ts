import type { MobilityView } from '../coach/mobility/mobility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createTrackingPorts } from './coachTrackingPort';
import type { CoachState } from '../coach/state';
import type { Together } from '../coach/together';
import type { GarminHealth, GarminReadiness } from '../shared/garmin';
import type { GarminSuggestion } from '../shared/garmin-profile';
import type { GymPublic } from '../coach/gym/public';
import type { StrengthHealth } from '../coach/strength';
import type { GymWorkout } from '../coach/gym/types';
import { COACH_PORT, type CoachClientMessage, type AccountStatus, type GymConfirmResult, type GarminStatus, type GarminSyncInfo, type HevyStatus, type RideDetail } from '../shared/coach-protocol';

const IDLE_ACCOUNT: AccountStatus = { state: 'idle', name: null, reason: null, refused: 0, offline: false, lastSyncMs: null };

export const useCoach = (profileId: string | null) => {
  const [state, setState] = useState<CoachState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [debriefing, setDebriefing] = useState(false);
  const [hevy, setHevy] = useState<HevyStatus>({ state: 'idle' });
  const [account, setAccount] = useState<AccountStatus>(IDLE_ACCOUNT);
  const [detail, setDetail] = useState<RideDetail | null>(null);
  const [together, setTogether] = useState<Together | null>(null);
  const [garmin, setGarmin] = useState<GarminStatus>({ state: 'idle' });
  const [garminSync, setGarminSync] = useState<GarminSyncInfo | null>(null);
  const [garminReadiness, setGarminReadiness] = useState<GarminReadiness | null>(null);
  const [garminSuggestion, setGarminSuggestion] = useState<GarminSuggestion | null>(null);
  const [garminHealth, setGarminHealth] = useState<GarminHealth | null>(null);
  const [gym, setGym] = useState<GymPublic | null>(null);
  const [mobility, setMobility] = useState<MobilityView | null>(null);
  const [statusArrived, setStatusArrived] = useState(false);
  const [strengthHealth, setStrengthHealth] = useState<StrengthHealth | null>(null);
  const [gymPreview, setGymPreview] = useState<{ workout: GymWorkout; edited: boolean; leftOut?: string[] } | null>(null);
  const [gymConfirmResult, setGymConfirmResult] = useState<GymConfirmResult | null>(null);
  const [gymPreviewFailed, setGymPreviewFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  // One tracking port per profile, kept after a switch: a workout store of the old profile still writes through its own.
  const ports = useMemo(() => createTrackingPorts({
    send: (m) => { if (socket.current?.readyState !== WebSocket.OPEN) return false; socket.current.send(JSON.stringify(m)); return true; },
  }), []);
  useEffect(() => () => ports.dispose(), [ports]);
  const tracking = profileId ? ports.get(profileId) : null;

  useEffect(() => {
    setState(null);
    setGarminHealth(null);
    setGym(null);
    setMobility(null);
    setHevy({ state: 'idle' });
    setStrengthHealth(null);
    setStatusArrived(false);
    setGymPreview(null);
    setGymConfirmResult(null);
    setGymPreviewFailed(false);
    if (!profileId) return undefined;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${COACH_PORT}`);
      socket.current = ws;
      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: 'subscribe', profileId }));
        ports.opened();
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === 'records' || m.type === 'records-put-result' || m.type === 'records-changed') { ports.handle(m); return; }
        if (m.type === 'ride-detail') setDetail(m.detail);
        if (m.type === 'garmin-health') setGarminHealth(m.data);
        if (m.type === 'gym-preview') { setGymPreview(m.preview); setGymPreviewFailed(m.preview === null); }
        if (m.type === 'gym-confirm-result') setGymConfirmResult(m.result);
        if (m.type === 'coach-state') { setStatusArrived(true); setState(m.state); setThinking(m.thinking); setDebriefing(m.debriefing ?? false); setHevy(m.hevy ?? { state: 'idle' }); setTogether(m.together ?? null); setGarmin(m.garmin ?? { state: 'idle' }); setGarminSync(m.garminSync ?? null); setGarminReadiness(m.garminReadiness ?? null); setGarminSuggestion(m.garminSuggestion ?? null); setGym(m.gym ?? null); setStrengthHealth(m.strengthHealth ?? null); setMobility(m.mobility ?? null); setAccount(m.account ?? IDLE_ACCOUNT); }
      };
      ws.onclose = () => {
        setConnected(false);
        ports.closed();
        if (!closed) timer = setTimeout(open, 1000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, [profileId, ports]);

  const send = (m: CoachClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };
  const clearGym = (what: 'preview' | 'result' | 'all') => {
    if (what !== 'result') { setGymPreview(null); setGymPreviewFailed(false); }
    if (what !== 'preview') setGymConfirmResult(null);
  };
  return { account, tracking, mobility, gym, strengthHealth, statusArrived, gymPreview, gymPreviewFailed, clearGym, setGymPreview, gymConfirmResult, setGymConfirmResult, debriefing, hevy, detail, garmin, garminHealth, garminReadiness, garminSuggestion, garminSync, state, together, thinking, connected, send };
};
