import { z } from 'zod';

const base = { durationS: z.number().positive(), label: z.string() };
const stepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('erg'), ftpFraction: z.number().positive(), ...base }),
  z.object({ kind: z.literal('grade'), gradePct: z.number(), scale: z.number().positive(), ...base }),
]);
const sessionSchema = z.object({ id: z.string().min(1), name: z.string(), description: z.string().optional(), steps: z.array(stepSchema).min(1) });

export type Step = z.infer<typeof stepSchema>;
export type Session = z.infer<typeof sessionSchema>;
export const parseSession = (input: unknown): Session => sessionSchema.parse(input);
