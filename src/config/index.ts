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
}

export const config = new Config();
