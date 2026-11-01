import { useEffect, useState } from 'react';

const key = (profileId: string) => `bike-coach:language-learning:${profileId}`;
const load = (profileId: string | null): boolean => {
  if (!profileId) return true;
  try { return localStorage.getItem(key(profileId)) !== 'off'; } catch { return true; }
};

/** Sprachenlernen pro Profil an- und ausschalten. Die Wahl bleibt auf diesem Mac gespeichert. */
export const useLanguageLearning = (profileId: string | null) => {
  const [enabled, setEnabled] = useState(() => load(profileId));
  useEffect(() => setEnabled(load(profileId)), [profileId]);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!profileId) return;
    try { localStorage.setItem(key(profileId), next ? 'on' : 'off'); } catch { /* Gilt dann nur bis zum Neustart. */ }
  };
  return { enabled, toggle };
};
