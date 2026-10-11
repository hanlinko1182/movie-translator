import { RecapError } from "./types";

export type RecapRetryRequest = { jobId: string; failureToken: string; acknowledged: true };
export function validRecapJobId(movieId: string, jobId: string) {
  const prefix = `recap-${encodeURIComponent(movieId)}-`;
  return jobId.startsWith(prefix) && /^[a-f0-9]{64}$/.test(jobId.slice(prefix.length));
}
export function recapFailureToken(job: { finishedOn?: number; attemptsMade: number; attemptsStarted: number }) {
  const values = [job.finishedOn, job.attemptsStarted, job.attemptsMade];
  return values.every((value) => Number.isSafeInteger(value) && value! >= 0) && job.finishedOn! > 0 ? values.join(":") : null;
}
export function parseRecapRetry(value: unknown, movieId: string): RecapRetryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecapError("RECAP_RETRY_INVALID");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || Object.keys(body).some((key) => !["jobId", "failureToken", "acknowledged"].includes(key)) ||
    typeof body.jobId !== "string" || !validRecapJobId(movieId, body.jobId) ||
    typeof body.failureToken !== "string" || !/^\d{1,16}:\d{1,16}:\d{1,16}$/.test(body.failureToken) ||
    body.failureToken.split(":").some((part) => !Number.isSafeInteger(Number(part)))) throw new RecapError("RECAP_RETRY_INVALID");
  if (body.acknowledged !== true) throw new RecapError("RECAP_RETRY_CONFIRMATION_REQUIRED");
  return body as RecapRetryRequest;
}
