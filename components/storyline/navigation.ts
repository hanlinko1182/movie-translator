export const studioWorkspaces = [
  { id: "script", label: "Script" },
  { id: "ai-review", label: "AI Review" },
  { id: "voice", label: "Voice" },
  { id: "highlights", label: "Highlights" },
  { id: "export", label: "Export" },
] as const;

export type StudioWorkspace = typeof studioWorkspaces[number]["id"];

// Unknown or ambiguous workspace queries retain the default Saved Recap view.
export function selectedStudioWorkspace(query: string): StudioWorkspace | null {
  const values = new URLSearchParams(query).getAll("studio");
  return values.length === 1 ? studioWorkspaces.find(({ id }) => id === values[0])?.id ?? null : null;
}

export function recapExperienceHref(path: string, query: string, movieId: string | null, workspace: StudioWorkspace | null, hash = "") {
  const params = new URLSearchParams(query);
  params.delete("studio");
  if (workspace) params.set("studio", workspace);
  if (movieId) params.set("movieId", movieId);
  const suffix = params.toString();
  return `${path}${suffix ? `?${suffix}` : ""}${hash}`;
}
