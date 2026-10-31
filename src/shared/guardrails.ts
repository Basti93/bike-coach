export const MIN_FTP_FRACTION = 0.3;
export const MAX_FTP_FRACTION = 1.5;
export const clampTargetW = (requestedW: number, ftpW: number): number =>
  Math.min(ftpW * MAX_FTP_FRACTION, Math.max(ftpW * MIN_FTP_FRACTION, requestedW));
