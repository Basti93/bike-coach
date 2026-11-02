import { useEffect, useState } from 'react';
import { hrMaxFor } from '../shared/hr-zones';
import type { Profile } from '../shared/profiles';
import { useCoach } from './useCoach';
import { useLanguageLearning } from './useLanguageLearning';
import { useRide } from './useRide';
import { FilmView } from './views/FilmView';
import { ProfileView } from './views/ProfileView';
import { RecoveryDialog } from './views/RecoveryDialog';
import { HealthView, type HealthRange } from './views/HealthView';
import { GarminProfileReview } from './views/GarminProfileReview';
import { ProfileSettingsView } from './views/ProfileSettingsView';
import { RideView } from './views/RideView';
import { StatusBar } from './views/StatusBar';
import { CoachView } from './views/CoachView';
import { coachScreen, DebriefView } from './views/DebriefCard';
import { FeedbackView } from './views/FeedbackView';
import { GymView } from './views/GymView';
import { HevyCard } from './views/HevyCard';
import { homeScreen, OverviewView } from './views/OverviewView';
import { HistoryView } from './views/HistoryView';
import { TogetherView } from './views/TogetherView';
import { WordCard } from './views/WordCard';
import { passById } from '../shared/passes';
import { PassCard } from './pass/PassCard';
import { PassGuard } from './pass/PassGuard';
import { PassView } from './pass/PassView';

const STATUS_WAIT_MS = 500;
const CALM_FRACTION = 0.75;
const PASS_KEY = 'bike-coach.pass';
const passStored = (): boolean => { try { return localStorage.getItem(PASS_KEY) !== 'off'; } catch { return true; } };

export const App = () => {
  const ride = useRide();
  return (
    <div className="shell">
      {window.location.hash !== '#film' && <StatusBar state={ride.state} connected={ride.connected} send={ride.send} reportPath={ride.reportPath} />}
      <div className="page"><Page ride={ride} /></div>
    </div>
  );
};

const Page = ({ ride }: { ride: ReturnType<typeof useRide> }) => {
  const { click, state, offer, clearOffer, connected, send, error } = ride;
  const [picked, setProfile] = useState<Profile | null>(null);
  // Always the saved state, otherwise changes would be lost on the next save or start.
  const profile = state?.profiles.find((p) => p.id === picked?.id) ?? picked;
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [health, setHealth] = useState<HealthRange | undefined>(undefined);
  const [history, setHistory] = useState(false);
  const [overview, setOverview] = useState(false);
  const [strengthFor, setStrengthFor] = useState<string | null>(null);
  const [bikeFor, setBikeFor] = useState<string | null>(null);
  const coach = useCoach(profile?.id ?? state?.ride?.profileId ?? state?.profiles[0]?.id ?? null);
  const hevy = coach.hevy ?? { state: 'idle' as const };
  // The strength page belongs to one profile and needs a Hevy connection.
  useEffect(() => { if (!coach.gym || strengthFor !== profile?.id) setStrengthFor(null); }, [coach.gym, strengthFor, profile?.id]);
  // The bike page chosen from the overview belongs to one profile and needs the overview to exist.
  // Test mocks without the field count as arrived.
  const arrived = coach.statusArrived ?? true;
  useEffect(() => { if (bikeFor !== profile?.id || (arrived && hevy.state === 'idle' && !coach.gym)) setBikeFor(null); }, [hevy.state, coach.gym, arrived, bikeFor, profile?.id]);
  // Without a status the rider still gets the bike page after a short wait; a late status does not take it away again.
  useEffect(() => {
    if (!profile || arrived) return undefined;
    const id = profile.id;
    const timer = setTimeout(() => setBikeFor(id), STATUS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [profile?.id, arrived]);
  const language = useLanguageLearning(state?.ride?.profileId ?? profile?.id ?? null);
  const [passOn, setPassOn] = useState(passStored);
  const passToggle = <button className="secondary" onClick={() => { try { localStorage.setItem(PASS_KEY, passOn ? 'off' : 'on'); } catch { /* then it only applies until the restart */ } setPassOn(!passOn); }}>Berg: {passOn ? 'an' : 'aus'}</button>;
  const languageToggle = <button className="secondary" onClick={language.toggle}>Sprachen lernen: {language.enabled ? 'an' : 'aus'}</button>;
  if (window.location.hash === '#film') return <FilmView state={state} send={send} />;
  if (!connected) return <main>Fahrdienst startet…</main>;
  const dialog = offer && (
    <RecoveryDialog
      offer={offer}
      profileName={state?.profiles.find((p) => p.id === offer.profileId)?.name ?? 'Unbekanntes Profil'}
      send={send}
      onClose={clearOffer}
    />
  );
  const notice = error && <div role="alert">{error}</div>;
  if (state?.engine) {
    // Language only in calm phases, never in hard sections or above your own heart rate limit.
    const c = coach.state;
    const rideProfile = state.profiles.find((p) => p.id === state.ride?.profileId);
    const maxHr = rideProfile?.maxHrBpm;
    const rideHrMax = rideProfile ? hrMaxFor(rideProfile, Date.now())?.bpm : undefined;
    const calm = c !== null && !state.engine.paused
      && state.session?.steps[state.engine.stepIndex]?.kind !== 'grade'
      && (state.engine.targetW ?? Infinity) <= c.ftpW * CALM_FRACTION
      && !(maxHr && (state.latest.hrBpm ?? 0) >= maxHr);
    return <>{notice}{dialog}<RideView state={state} send={send} hrMaxBpm={rideHrMax} tools={<>{passToggle}{languageToggle}</>} mountain={passOn && c && state.ride ? <PassGuard><PassView pass={passById(c.pass?.selectedId)} profileId={state.ride.profileId} startM={c.pass?.distanceM?.[passById(c.pass?.selectedId).id] ?? 0} powerW={state.latest.powerW} paused={state.engine.paused} send={coach.send} /></PassGuard> : undefined} extra={c && language.enabled ? <WordCard calm={calm} state={c} send={coach.send} click={click} /> : null} /></>;
  }
  if (editing && profile) return <>{notice}<ProfileSettingsView profile={profile} ftpW={coach.state?.ftpW ?? profile.ftpW} coachConnected={coach.connected && coach.state !== null} sendRide={send} sendCoach={coach.send} onBack={() => setEditing(false)} onDeleted={() => { setEditing(false); setProfile(null); }} /></>;
  // A rider with Hevy and no Garmin at all sees no Garmin sections; any other Garmin state shows what a Garmin-only rider sees.
  const garminSections = homeScreen(hevy, coach.gym != null) === 'bike' || coach.garmin?.state !== 'idle';
  const showHealth = (range: HealthRange): void => {
    setHealth(range);
    if (profile && (garminSections)) coach.send({ type: 'garmin-health', profileId: profile.id, rangeDays: range });
  };
  if (health !== undefined) return <>{notice}<HealthView data={coach.garminHealth} range={health} onRange={showHealth} strength={coach.strengthHealth} rides={coach.state?.summaries} garmin={garminSections} readiness={coach.garminReadiness} sync={coach.garminSync} onBack={() => setHealth(undefined)} /></>;
  if (reviewing && profile && coach.garminSuggestion) return <>{notice}<GarminProfileReview profile={profile} ftpW={coach.state?.ftpW ?? profile.ftpW} suggestion={coach.garminSuggestion} sendRide={send} sendCoach={coach.send} onBack={() => setReviewing(false)} /></>;
  if (overview && coach.together) return <>{notice}<TogetherView together={coach.together} onBack={() => setOverview(false)} /></>;
  if (profile && strengthFor === profile.id && coach.gym) return <>{notice}<GymView profileId={profile.id} gym={coach.gym} preview={coach.gymPreview} previewFailed={coach.gymPreviewFailed} result={coach.gymConfirmResult} send={coach.send} clear={coach.clearGym} mobility={coach.mobility} onHealth={() => showHealth(28)} onBack={() => setStrengthFor(null)} /></>;
  if (profile && !arrived && bikeFor !== profile.id && !history && coachScreen(coach.state) === 'coach') return <>{notice}<main aria-busy="true" /></>;
  const overviewOpen = profile !== null && homeScreen(hevy, coach.gym != null) === 'overview' && bikeFor !== profile.id && !history && coachScreen(coach.state) === 'coach' && !coach.state?.awaitingFeedback;
  if (profile && overviewOpen) return <>{notice}<OverviewView name={profile.name} avatar={profile.avatar} onBike={() => setBikeFor(profile.id)} onStrength={() => setStrengthFor(profile.id)} onHealth={() => showHealth(28)} onBack={() => setProfile(null)} /></>;
  return (
    <>
      {notice}
      {profile
        ? (history && coach.state ? <HistoryView state={coach.state} detail={coach.detail} send={coach.send} onBack={() => setHistory(false)} garminConnected={coach.garmin.state === 'connected'} /> : coachScreen(coach.state) === 'debrief' && coach.state?.debriefToShow
          ? <DebriefView profileId={profile.id} debrief={coach.state.debriefs![coach.state.debriefToShow]} next={coach.state.next} thinking={coach.debriefing} title={coach.state.summaries.find((r) => r.rideId === coach.state?.debriefToShow)?.sessionName} send={coach.send} />
          : coach.state?.awaitingFeedback
          ? <FeedbackView garminConnected={coach.garmin.state === 'connected'} upload={coach.state.garminUpload} debrief={coach.state.debriefs?.[coach.state.awaitingFeedback]} debriefing={coach.debriefing} next={coach.state.next} together={coach.together} profileId={profile.id} rideId={coach.state.awaitingFeedback} send={coach.send} detail={coach.detail} summaries={coach.state.summaries} summary={coach.state.summaries.find((r) => r.rideId === coach.state?.awaitingFeedback)} />
          : <CoachView mobility={coach.mobility} healthLink={homeScreen(hevy, coach.gym != null) === 'overview'} onOverview={homeScreen(hevy, coach.gym != null) === 'overview' ? () => setBikeFor(null) : undefined} gym={coach.gym} onGym={() => setStrengthFor(profile.id)} onStartGym={() => coach.send({ type: 'gym-start', profileId: profile.id })} onHealth={() => showHealth(28)} garminSuggestion={coach.garminSuggestion} onReviewGarmin={() => setReviewing(true)} onEdit={() => setEditing(true)} garmin={coach.garmin} garminSync={coach.garminSync} garminReadiness={coach.garminReadiness} tools={languageToggle} hevyCard={<HevyCard profileId={profile.id} status={coach.hevy} send={coach.send} />} passCard={<PassCard profileId={profile.id} pass={coach.state?.pass} send={coach.send} />} onTogether={() => setOverview(true)} onHistory={() => setHistory(true)} together={coach.together} profile={profile} state={coach.state} thinking={coach.thinking} coachConnected={coach.connected} sendRide={send} sendCoach={coach.send} onBack={() => setProfile(null)} />)
        : <ProfileView onTogether={coach.together ? () => setOverview(true) : undefined} profiles={state?.profiles ?? []} onPick={setProfile} onAdd={(p) => send({ type: 'save-profile', profile: p })} />}
    </>
  );
};
