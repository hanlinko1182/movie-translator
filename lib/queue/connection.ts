import "server-only";

import type { RedisOptions } from "bullmq";
import { redisUrl } from "@/lib/env";

export class RedisConfigurationError extends Error {
  constructor() {
    super("REDIS_URL must be configured with a valid redis:// or rediss:// URL.");
    this.name = "RedisConfigurationError";
  }
}

export function redisConnection(role: "producer" | "worker"): RedisOptions {
  try {
    const value = redisUrl();
    const url = new URL(value);
    const port = Number(url.port || 6379);
    const database = url.pathname.replace(/^\//, "") || "0";
    if (
      !["redis:", "rediss:"].includes(url.protocol) || !url.hostname ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !/^\d+$/.test(database) || !Number.isSafeInteger(Number(database)) ||
      url.search || url.hash
    ) throw new RedisConfigurationError();

    return {
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port,
      db: Number(database),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      connectTimeout: 2_000,
      maxRetriesPerRequest: role === "worker" ? null : 1,
      ...(role === "producer" ? {
        enableOfflineQueue: false,
        commandTimeout: 2_000,
        retryStrategy: () => null,
      } : {}),
    };
  } catch {
    throw new RedisConfigurationError();
  }
}
