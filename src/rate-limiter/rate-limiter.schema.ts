import { z } from "zod";

const key = z.string().trim().min(1).max(256);
const policy = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_-]+$/i,
    "Policy may only contain letters, digits, '_' and '-'",
  );

export const allowBodySchema = z.object({ key, policy });
export const statusQuerySchema = z.object({ key, policy });

export type AllowBody = z.infer<typeof allowBodySchema>;
export type StatusQuery = z.infer<typeof statusQuerySchema>;
