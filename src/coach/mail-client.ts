/** Where the home server's mail service listens and how to reach it. Without both url and token, mail is off. */
export type MailConfig = { url: string; token: string; appUrl?: string };

/** The mail settings from the environment, or null (mail off). Values come from the server's `.env` only, never from the repo. */
export const mailConfigOf = (env: Record<string, string | undefined>): MailConfig | null => {
  const url = env.MAIL_URL?.trim().replace(/\/+$/, '');
  const token = env.MAIL_TOKEN?.trim();
  if (!url || !token) return null;
  const appUrl = env.PANDAFIT_APP_URL?.trim();
  return { url, token, ...(appUrl ? { appUrl } : {}) };
};

export type MailMessage = { subject: string; text: string; html?: string; to: string };
/**
 * ok: sent. rejected: the service refused this very mail (bad address or content): asking again would not help.
 * retry: not sent for a reason that may pass (the service or network is down, the daily limit, a wrong token).
 */
export type SendResult = 'ok' | 'rejected' | 'retry';

const TIMEOUT_MS = 15_000;

/** One mail through the service. Never throws; the answer says what to do next. */
export async function sendMail(cfg: MailConfig, msg: MailMessage, fetchFn: typeof fetch = fetch): Promise<SendResult> {
  try {
    const res = await fetchFn(`${cfg.url}/v1/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 200) {
      const body = await res.json().catch(() => null) as { status?: unknown } | null;
      return body?.status === 'ok' ? 'ok' : 'retry';
    }
    // 401 (token) and 429 (daily limit) pass once the server is set right or the day turns.
    if (res.status === 400 || res.status === 413) return 'rejected';
    return 'retry';
  } catch { return 'retry'; }
}
