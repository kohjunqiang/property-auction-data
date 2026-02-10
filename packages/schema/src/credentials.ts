import { z } from 'zod';

export const CredentialsSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  targetUrl: z.string().url('Please enter a valid URL').optional()
});

export type CredentialsType = z.infer<typeof CredentialsSchema>;
