import "server-only";
import { canonicalJson } from "../canonical";
import { date, freeze, hash, id, integer, literal, record, text } from "../validation";
import { STORY_TASK, STORY_TASK_LIMITS, type StoryPaidConfirmationProposal,
  type StoryTaskRecipeIdentity } from "./contracts";
import { taskFail } from "./errors";
import { parseStoryTaskProfile } from "./recipe";

export type InspectedStoryPaidProposal = {
  proposal: StoryPaidConfirmationProposal;
  assessment: "STRUCTURALLY_CURRENT_UNTRUSTED";
  authorizesProviderSubmission: false;
};

/** No grant is issued. A future authenticated server service must prepare, store and bind this data. */
export function inspectUntrustedStoryPaidProposal(value: unknown, recipeIdentity: StoryTaskRecipeIdentity,
  profileValue: unknown, nowValue: unknown): InspectedStoryPaidProposal {
  canonicalJson(value, STORY_TASK_LIMITS.proposalBytes);
  const p = "proposal", row = record(value,
    ["schemaVersion", "proposalId", "projectId", "movieId", "studioId", "expectedStudioRevision", "recipeHash", "logicalTaskKey",
      "profileId", "profileVersion", "profileDefinitionHash", "costPolicyId", "costPolicyVersion", "quoteMaxEstimatedUsdMicros",
      "maxProviderSubmissions", "spendingAuthorityRef", "authorityAssurance", "preparedAt", "expiresAt"], p);
  const profile = parseStoryTaskProfile(profileValue);
  if (profile.execution !== "PAID_TEXT" || !profile.costPolicy) taskFail("STORY_TASK_COST_POLICY_MISSING", `${p}.costPolicyId`);
  const proposal: StoryPaidConfirmationProposal = {
    schemaVersion: literal(row.schemaVersion, STORY_TASK.proposalVersion, `${p}.schemaVersion`),
    proposalId: id(row.proposalId, `${p}.proposalId`),
    projectId: id(row.projectId, `${p}.projectId`), movieId: id(row.movieId, `${p}.movieId`), studioId: id(row.studioId, `${p}.studioId`),
    expectedStudioRevision: integer(row.expectedStudioRevision, `${p}.expectedStudioRevision`),
    recipeHash: hash(row.recipeHash, `${p}.recipeHash`), logicalTaskKey: hash(row.logicalTaskKey, `${p}.logicalTaskKey`),
    profileId: text(row.profileId, 80, `${p}.profileId`), profileVersion: text(row.profileVersion, 80, `${p}.profileVersion`),
    profileDefinitionHash: hash(row.profileDefinitionHash, `${p}.profileDefinitionHash`),
    costPolicyId: text(row.costPolicyId, 80, `${p}.costPolicyId`), costPolicyVersion: text(row.costPolicyVersion, 80, `${p}.costPolicyVersion`),
    quoteMaxEstimatedUsdMicros: integer(row.quoteMaxEstimatedUsdMicros, `${p}.quoteMaxEstimatedUsdMicros`, STORY_TASK_LIMITS.maxEstimatedUsdMicros),
    maxProviderSubmissions: row.maxProviderSubmissions === 1 ? 1 : taskFail("STORY_TASK_INVALID", `${p}.maxProviderSubmissions`),
    spendingAuthorityRef: id(row.spendingAuthorityRef, `${p}.spendingAuthorityRef`),
    authorityAssurance: literal(row.authorityAssurance, "UNVERIFIED", `${p}.authorityAssurance`),
    preparedAt: date(row.preparedAt, `${p}.preparedAt`), expiresAt: date(row.expiresAt, `${p}.expiresAt`),
  };
  const recipe = recipeIdentity.recipe;
  if (proposal.projectId !== recipe.projectId || proposal.movieId !== recipe.movieId || proposal.studioId !== recipe.studioId ||
    proposal.expectedStudioRevision !== recipe.expectedStudioRevision || proposal.recipeHash !== recipeIdentity.recipeHash ||
    proposal.logicalTaskKey !== recipeIdentity.logicalTaskKey || proposal.profileId !== profile.id || proposal.profileVersion !== profile.version ||
    proposal.profileDefinitionHash !== recipe.profile.definitionHash || proposal.costPolicyId !== profile.costPolicy.id ||
    proposal.costPolicyVersion !== profile.costPolicy.version || proposal.quoteMaxEstimatedUsdMicros > profile.costPolicy.maxEstimatedUsdMicros) {
    taskFail("STORY_TASK_CONFIRMATION_STALE", p);
  }
  const preparedAt = Date.parse(proposal.preparedAt), expiresAt = Date.parse(proposal.expiresAt), now = Date.parse(date(nowValue, "now"));
  if (expiresAt <= preparedAt || expiresAt - preparedAt > STORY_TASK_LIMITS.maxProposalTtlMs || now < preparedAt || now >= expiresAt) {
    taskFail("STORY_TASK_CONFIRMATION_STALE", `${p}.expiresAt`);
  }
  return freeze({ proposal, assessment: "STRUCTURALLY_CURRENT_UNTRUSTED", authorizesProviderSubmission: false });
}
