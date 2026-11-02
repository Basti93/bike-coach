import { useEffect, useRef, useState } from 'react';
import type { CoachState } from '../coach/state';
import type { Together } from '../coach/together';
import type { GarminHealth, GarminReadiness } from '../shared/garmin';
import type { GarminSuggestion } from '../shared/garmin-profile';
import type { GymPublic } from '../coach/gym/public';
import type { StrengthHealth } from '../coach/strength';
import type { GymWorkout } from '../coach/gym/types';
import { COACH_PORT, type CoachClientMessage, type GymConfirmResult, type GarminStatus, type GarminSyncInfo, type HevyStatus, type RideDetail } from '../shared/coach-protocol';

export const useCoach = (profileId: string | null) => {
  const [state, setState] = useState<CoachState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [debriefing, setDebriefing] = useState(false);
  const [hevy, setHevy] = useState<HevyStatus>({ state: 'idle' });
  const [detail, setDetail] = useState<RideDetail | null>(null);
  const [together, setTogether] = useState<Together | null>(null);
  const [garmin, setGarmin] = useState<GarminStatus>({ state: 'idle' });
  const [garminSync, setGarminSync] = useState<GarminSyncInfo | null>(null);
  const [garminReadiness, setGarminReadiness] = useState<GarminReadiness | null>(null);
  const [garminSuggestion, setGarminSuggestion] = useState<GarminSuggestion | null>(null);
  const [garminHealth, setGarminHealth] = useState<GarminHealth | null>(null);
  const [gym, setGym] = useState<GymPublic | null>(null);
  const [strengthHealth, setStrengthHealth] = useState<StrengthHealth | null>(null);
  const [gymPreview, setGymPreview] = useState<{ workout: GymWorkout; edited: boolean } | null>(null);
  const [gymConfirmResult, setGymConfirmResult] = useState<GymConfirmResult | null>(null);
  const [gymPreviewFailed, setGymPreviewFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    setState(null);
    setGarminHealth(null);
    setGym(null);
    setHevy({ state: 'idle' });
    setStrengthHealth(null);
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
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === 'ride-detail') setDetail(m.detail);
        if (m.type === 'garmin-health') setGarminHealth(m.data);
        if (m.type === 'gym-preview') { setGymPreview(m.preview); setGymPreviewFailed(m.preview === null); }
        if (m.type === 'gym-confirm-result') setGymConfirmResult(m.result);
        if (m.type === 'coach-state') { setState(m.state); setThinking(m.thinking); setDebriefing(m.debriefing ?? false); setHevy(m.hevy ?? { state: 'idle' }); setTogether(m.together ?? null); setGarmin(m.garmin ?? { state: 'idle' }); setGarminSync(m.garminSync ?? null); setGarminReadiness(m.garminReadiness ?? null); setGarminSuggestion(m.garminSuggestion ?? null); setGym(m.gym ?? null); setStrengthHealth(m.strengthHealth ?? null); }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(open, 1000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, [profileId]);

  const send = (m: CoachClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };
  const clearGym = (what: 'preview' | 'result' | 'all') => {
    if (what !== 'result') { setGymPreview(null); setGymPreviewFailed(false); }
    if (what !== 'preview') setGymConfirmResult(null);
  };
  return { gym, strengthHealth, gymPreview, gymPreviewFailed, clearGym, setGymPreview, gymConfirmResult, setGymConfirmResult, debriefing, hevy, detail, garmin, garminHealth, garminReadiness, garminSuggestion, garminSync, state, together, thinking, connected, send };
};
