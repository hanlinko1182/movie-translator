// Small presentation vocabulary shared by the existing workspaces.
export const pageClass = "min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8";
export const contentClass = "mx-auto max-w-7xl space-y-6";
export const cardClass = "min-w-0 rounded-xl border border-white/10 bg-[#111115]";
export const mediaFallbackClass = "flex min-h-48 min-w-0 flex-col items-center justify-center gap-3 px-5 py-5 text-center sm:min-h-56";
export const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300";
const buttonBase = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg font-medium transition [&>svg]:shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`;
export const primaryButtonClass = `${buttonBase} bg-violet-600 px-4 py-2.5 text-sm text-white hover:bg-violet-500`;
export const secondaryButtonClass = `${buttonBase} border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.07]`;
export const linkClass = `inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-violet-300 transition hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`;
export const controlClass = `min-h-10 min-w-0 rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`;
export const badgeClass = "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-5";
export const badgeTones = {
  green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  violet: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  red: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  neutral: "border-white/10 bg-white/[0.03] text-zinc-400",
} as const;
