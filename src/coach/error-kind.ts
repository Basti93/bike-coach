/** An error's code or name, never its message: safe to log. */
export const errorKind = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)) return code;
  return e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Fehler';
};
