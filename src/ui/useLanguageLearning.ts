import { useEffect, useState } from 'react';

const key = (profileId: string) => `bike-coach:language-learning:${profileId}`;
const load = (profileId: string | null): boolean => {
  if (!profileId) return true;
  try { return localStorage.getItem(key(profileId)) !== 'off'; } catch { return true; }
};

/** Switch language learning on and off per profile. The choice stays saved on this Mac. */
export const useLanguageLearning = (profileId: string | null) => {
  const [enabled, setEnabled] = useState(() => load(profileId));
  useEffect(() => setEnabled(load(profileId)), [profileId]);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!profileId) return;
    try { localStorage.setItem(key(profileId), next ? 'on' : 'off'); } catch { /* Then it only holds until the restart. */ }
  };
  return { enabled, toggle };
};
