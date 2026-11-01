import { z } from 'zod';

const profileSchema = z.object({ id: z.string().min(1), name: z.string().min(1), ftpW: z.number().positive(), maxHrBpm: z.number().positive().optional(), ftpCapW: z.number().positive().optional(), birthDate: z.string().optional(), sex: z.enum(['male', 'female', 'unknown']).optional(), heightCm: z.number().positive().optional(), weightKg: z.number().positive().optional() });
export type Profile = z.infer<typeof profileSchema>;
export const parseProfile = (input: unknown): Profile => profileSchema.parse(input);
