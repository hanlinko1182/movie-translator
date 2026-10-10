// Invalid/unknown explicit selections never fall back to the newest movie.
export function selectMovie<T extends { id: string }>(movies: T[], requested: string | string[] | undefined): T | undefined {
  return requested === undefined ? movies[0] : typeof requested === "string" ? movies.find((movie) => movie.id === requested) : undefined;
}

export function withMovieSelection(href: string, movieId: string | null | undefined) {
  if (!movieId) return href;
  const url = new URL(href, "http://local.invalid");
  url.searchParams.set("movieId", movieId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sourceVideoUrl(projectId: string, movieId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/movies/${encodeURIComponent(movieId)}/source`;
}
