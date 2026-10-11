import { DEFAULT_MAX_KEYS } from "./policies";

try {
  process.loadEnvFile();
} catch {
  // No .env file; fall back to the process environment.
}

class Config {
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? "development";
  }

  get port(): number {
    return Number(process.env.PORT) || 3000;
  }

  get prefix(): string {
    return process.env.PREFIX ?? "/rate_limiter";
  }

  get rateLimitMaxKeys(): number {
    const value = Number(process.env.RATE_LIMIT_MAX_KEYS);
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_KEYS;
  }
}

export const config = new Config();
