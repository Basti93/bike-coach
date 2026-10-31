import { z } from 'zod';

const profileSchema = z.object({ id: z.string().min(1), name: z.string().min(1), ftpW: z.number().positive() });
export type Profile = z.infer<typeof profileSchema>;
export const parseProfile = (input: unknown): Profile => profileSchema.parse(input);
