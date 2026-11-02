import type { RideUpload } from '../../coach/garmin-upload';

const REASON: Record<string, string> = {
  reauth: 'Die Garmin-Anmeldung ist abgelaufen, bitte neu anmelden.',
  'rate-limit': 'Garmin blockt gerade zu viele Anfragen, bitte später erneut versuchen.',
  'missing-file': 'Zu dieser Fahrt gibt es keine FIT-Datei.',
  failed: 'Das Hochladen hat nicht geklappt. Die Fahrt bleibt hier gespeichert.',
};

export const GarminUploadButton = ({ status, connected, onUpload }: { status?: RideUpload; connected: boolean; onUpload: () => void }) => {
  if (!connected) return null;
  if (status?.status === 'uploading') return <button className="secondary" disabled>Wird hochgeladen …</button>;
  if (status?.status === 'uploaded') return <button className="secondary" disabled>Bei Garmin</button>;
  if (status?.status === 'failed') {
    return (
      <div className="garmin-upload">
        <p className="notice" role="alert">{REASON[status.reason ?? 'failed'] ?? REASON.failed}</p>
        <button className="secondary" onClick={onUpload}>Erneut versuchen</button>
      </div>
    );
  }
  return <button className="secondary" onClick={onUpload}>Zu Garmin hochladen</button>;
};
