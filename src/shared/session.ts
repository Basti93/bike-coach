import { z } from 'zod';

const base = { durationS: z.number().positive(), label: z.string(), hrZone: z.number().int().min(1).max(5).optional() };
const stepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('erg'), ftpFraction: z.number().positive(), ...base }),
  z.object({ kind: z.literal('grade'), gradePct: z.number(), scale: z.number().positive(), sudden: z.boolean().optional(), ...base }),
]);
const sessionSchema = z.object({ id: z.string().min(1), name: z.string(), description: z.string().optional(), steps: z.array(stepSchema).min(1) });

export type Step = z.infer<typeof stepSchema>;
export type Session = z.infer<typeof sessionSchema>;
export const parseSession = (input: unknown): Session => sessionSchema.parse(input);

/**
 * Anteil der FTP, mit dem ein Abschnitt gefahren wird. Steigungen laufen über eine Wattvorgabe:
 * Der Hub One hat nur ein Ritzel, eine simulierte Steigung wäre bei normaler Trittfrequenz weit über der FTP.
 */
export const stepFtpFraction = (s: Step): number => (s.kind === 'erg' ? s.ftpFraction : Math.max(0.5, 0.55 + (s.gradePct * s.scale) / 20));
