import type { StoryTaskErrorCode } from "./contracts";

export class StoryTaskContractError extends Error {
  constructor(readonly code: StoryTaskErrorCode, readonly fieldPath: string) {
    super("Storyline task contract validation failed");
    this.name = "StoryTaskContractError";
  }
}

export function taskFail(code: StoryTaskErrorCode, fieldPath: string): never {
  throw new StoryTaskContractError(code, fieldPath);
}
