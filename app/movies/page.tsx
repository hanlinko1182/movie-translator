import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  ChevronRight,
  Clock3,
  Film,
  HardDrive,
  MoreHorizontal,
  Search,
  Settings2,
  Upload,
} from "lucide-react";

type MovieStatus = "Ready" | "Processing" | "Queued" | "Failed";

type Movie = {
  id: string;
  title: string;
  originalTitle: string;
  language: string;
  duration: string;
  fileSize: string;
  resolution: string;
  status: MovieStatus;
  processingProgress: number;
  project: string;
  addedAt: string;
  projectHref?: string;
};

const mockMovies: Movie[] = [
  { id: "movie-001", title: "The Hidden Dragon", originalTitle: "隐龙", language: "Chinese", duration: "1h 48m", fileSize: "4.8 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "The Hidden Dragon", addedAt: "Today", projectHref: "/projects/hidden-dragon" },
  { id: "movie-002", title: "Moonlight Sword", originalTitle: "月光剑", language: "Chinese", duration: "2h 06m", fileSize: "5.2 GB", resolution: "1080p", status: "Processing", processingProgress: 64, project: "Moonlight Sword", addedAt: "Today" },
  { id: "movie-003", title: "Legend of the Phoenix", originalTitle: "凤凰传奇", language: "Chinese", duration: "1h 56m", fileSize: "4.1 GB", resolution: "1080p", status: "Processing", processingProgress: 28, project: "Legend of the Phoenix", addedAt: "Yesterday" },
  { id: "movie-004", title: "The Last Emperor", originalTitle: "末代皇帝", language: "Mandarin", duration: "2h 14m", fileSize: "6.7 GB", resolution: "4K", status: "Ready", processingProgress: 100, project: "The Last Emperor", addedAt: "Yesterday" },
  { id: "movie-005", title: "River of Stars", originalTitle: "星河", language: "Cantonese", duration: "1h 42m", fileSize: "3.8 GB", resolution: "1080p", status: "Queued", processingProgress: 0, project: "River of Stars", addedAt: "2 days ago" },
  { id: "movie-006", title: "Jade Mountain", originalTitle: "玉山", language: "Chinese", duration: "1h 51m", fileSize: "4.4 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "Jade Mountain", addedAt: "3 days ago" },
  { id: "movie-007", title: "Shadow of the Crane", originalTitle: "鹤影", language: "Mandarin", duration: "1h 37m", fileSize: "3.2 GB", resolution: "720p", status: "Failed", processingProgress: 18, project: "Shadow of the Crane", addedAt: "4 days ago" },
  { id: "movie-008", title: "Autumn in Suzhou", originalTitle: "苏州秋色", language: "Mandarin", duration: "1h 44m", fileSize: "3.9 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "Autumn in Suzhou", addedAt: "5 days ago" },
  { id: "movie-009", title: "The Red Pavilion", originalTitle: "红楼", language: "Cantonese", duration: "2h 02m", fileSize: "5.1 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "The Red Pavilion", addedAt: "1 week ago" },
  { id: "movie-010", title: "Lanterns at Dawn", originalTitle: "黎明灯火", language: "Mandarin", duration: "1h 39m", fileSize: "3.6 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "Lanterns at Dawn", addedAt: "1 week ago" },
  { id: "movie-011", title: "The Silent General", originalTitle: "无声将军", language: "Chinese", duration: "2h 11m", fileSize: "5.9 GB", resolution: "4K", status: "Ready", processingProgress: 100, project: "The Silent General", addedAt: "2 weeks ago" },
  { id: "movie-012", title: "A River Beyond", originalTitle: "彼岸长河", language: "Cantonese", duration: "1h 47m", fileSize: "4.3 GB", resolution: "1080p", status: "Ready", processingProgress: 100, project: "A River Beyond", addedAt: "2 weeks ago" },
];

const mockProcessingLog = [
  { time: "20:14", text: "Upload completed" },
  { time: "20:16", text: "Audio extraction completed" },
  { time: "20:31", text: "Transcription completed" },
  { time: "20:36", text: "Scene analysis completed" },
  { time: "20:41", text: "Translation started" },
];

const pipeline = [
  { label: "Upload", state: "Completed" },
  { label: "Audio Extraction", state: "Completed" },
  { label: "Transcription", state: "Completed" },
  { label: "Scene Analysis", state: "Completed" },
  { label: "Character Analysis", state: "Completed" },
  { label: "Translation", state: "68%" },
  { label: "Quality Check", state: "Pending" },
  { label: "Export", state: "Not Started" },
];

export default function MoviesPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <Link href="/" className="flex items-center gap-3 px-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black"><Clapperboard size={21} /></span><span><span className="block text-sm font-semibold">Movie Translator</span><span className="block text-xs text-zinc-500">AI Subtitle Studio</span></span></Link>
          <nav className="mt-10 space-y-1"><SidebarLink href="/" label="Dashboard" /><SidebarLink href="/projects" label="Projects" /><SidebarLink href="/movies" label="Movies" active /></nav>
          <div className="mt-8 border-t border-white/10 pt-5"><p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">System</p><SidebarLink href="/settings" label="Settings" /></div>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center gap-2"><HardDrive size={14} className="text-zinc-500" /><p className="text-xs font-medium text-zinc-300">Storage</p></div><p className="mt-3 text-xl font-semibold">38.4 <span className="text-xs font-normal text-zinc-500">GB used</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[64%] rounded-full bg-zinc-400" /></div><p className="mt-2 text-[10px] text-zinc-600">of 60 GB allocated</p></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-col justify-between gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:px-6 lg:px-10"><div><div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/" className="hover:text-zinc-300">Dashboard</Link><ChevronRight size={13} /><span className="text-zinc-300">Movies</span></div><h1 className="mt-1 text-xl font-semibold">Movies</h1><p className="mt-1 text-sm text-zinc-500">Manage uploaded movies and monitor processing progress.</p></div><button type="button" className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"><Upload size={15} /> Upload Movie</button></header>

          <div className="mx-auto max-w-[1700px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Movie library summary"><SummaryCard title="Total Movies" value="12" /><SummaryCard title="Processing" value="2" /><SummaryCard title="Ready" value="8" /><SummaryCard title="Failed" value="1" warning /><SummaryCard title="Storage" value="38.4 GB" /></section>

            <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-label="Movie search and filters"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><label className="relative block w-full xl:max-w-sm"><span className="sr-only">Search movies</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="search" placeholder="Search movies..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" /></label><div className="flex flex-wrap items-center gap-2"><FilterSelect label="Status" options={["All Status", "Ready", "Processing", "Queued", "Failed"]} /><FilterSelect label="Language" options={["All Languages", "Chinese", "Cantonese"]} /><FilterSelect label="Sort" options={["Recently Added", "Name", "Duration", "Status"]} /><div className="flex rounded-lg border border-white/10 p-0.5"><button type="button" aria-pressed="true" className="rounded-md bg-white/[0.08] px-2.5 py-1.5 text-[10px] text-zinc-200">Grid</button><button type="button" aria-pressed="false" className="rounded-md px-2.5 py-1.5 text-[10px] text-zinc-500">List</button></div></div></div></section>

            <section aria-labelledby="library-title"><div className="mb-3 flex items-end justify-between"><div><h2 id="library-title" className="font-medium">Movie Library</h2><p className="mt-1 text-[11px] text-zinc-500">12 mock movies · 38.4 GB total storage</p></div><button type="button" className="hidden items-center gap-1 text-[10px] text-zinc-500 sm:flex">Recently Added <ChevronDown size={12} /></button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{mockMovies.map((movie, index) => <MovieCard key={movie.id} movie={movie} index={index} />)}</div></section>

            <section className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="movie-details-title"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Selected Movie · Ready</p><h2 id="movie-details-title" className="mt-1 text-lg font-semibold">The Hidden Dragon <span lang="zh" className="ml-1 text-sm font-normal text-zinc-500">隐龙</span></h2><p className="mt-1 text-xs text-zinc-500">Associated project · The Hidden Dragon</p></div><Link href="/projects/hidden-dragon" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200">Open Project <ArrowRight size={13} /></Link></div>
                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div><h3 className="mb-3 text-xs font-medium text-zinc-300">File Information</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{[["Filename", "the-hidden-dragon-1080p.mp4"], ["Container", "MP4"], ["Video", "H.264"], ["Audio", "AAC"], ["Resolution", "1920 × 1080"], ["Runtime", "01:48:32"], ["File Size", "4.8 GB"], ["Source Language", "Chinese"]].map(([label, value]) => <DetailField key={label} label={label} value={value} />)}</div><div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4"><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400">Replace File</button><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400">Reprocess</button><button type="button" className="rounded-lg border border-rose-500/15 px-3 py-2 text-[10px] text-rose-300/80">Delete</button></div></div>
                    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-medium text-zinc-300">Processing Pipeline</h3><span className="text-[9px] text-zinc-500">68% overall</span></div><div className="space-y-2.5">{pipeline.map((step, i) => <PipelineRow key={step.label} label={step.label} state={step.state} active={i === 5} />)}</div></div>
                  </div>
                </section>
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="processing-log-title"><div className="mb-4 flex items-center justify-between"><div><h2 id="processing-log-title" className="text-sm font-medium">Processing Log</h2><p className="mt-1 text-[10px] text-zinc-500">Recent movie activity</p></div><Clock3 size={15} className="text-zinc-500" /></div><div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{mockProcessingLog.map((entry) => <div key={entry.time} className="flex items-center gap-3"><span className="font-mono text-[10px] text-zinc-600">{entry.time}</span><span className="h-1 w-1 rounded-full bg-emerald-400/70" /><span className="text-[11px] text-zinc-400">{entry.text}</span></div>)}</div></section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="storage-title"><div className="mb-4 flex items-center justify-between"><div><h2 id="storage-title" className="text-sm font-medium">Storage Overview</h2><p className="mt-1 text-[10px] text-zinc-500">38.4 GB used</p></div><HardDrive size={15} className="text-zinc-500" /></div><div className="mb-4 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className="flex h-full w-[64%]"><span className="h-full w-[82%] bg-zinc-400" /><span className="h-full w-[13%] bg-zinc-600" /><span className="h-full w-[5%] bg-zinc-700" /></div></div><div className="space-y-3"><StorageRow label="Movies" value="31.7 GB" width="w-[82%]" /><StorageRow label="Extracted Audio" value="5.2 GB" width="w-[13%]" /><StorageRow label="Generated Files" value="1.5 GB" width="w-[5%]" /></div></section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="upload-area-title"><div className="flex flex-col items-center rounded-xl border border-dashed border-white/15 bg-white/[0.015] px-4 py-7 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400"><Upload size={17} /></span><h2 id="upload-area-title" className="mt-3 text-sm font-medium">Drop a movie here</h2><p className="mt-1 text-[11px] text-zinc-600">or</p><button type="button" className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">Choose Movie</button><p className="mt-3 text-[9px] text-zinc-600">MP4 · MKV · MOV</p></div><p className="mt-3 text-[10px] leading-5 text-zinc-600">Large movie uploads will eventually be processed asynchronously.</p></section>

                <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.025] p-5" aria-labelledby="processing-state-title"><div className="mb-3 flex items-center justify-between"><h2 id="processing-state-title" className="text-sm font-medium">Other Processing States</h2><Settings2 size={14} className="text-zinc-500" /></div><div className="space-y-3"><div className="rounded-xl border border-sky-500/15 bg-black/10 p-3"><div className="flex items-center justify-between"><span className="text-xs text-zinc-300">River of Stars</span><StatusBadge status="Queued" /></div><p className="mt-2 text-[10px] text-zinc-500">Waiting for processing worker</p><p className="mt-1 text-[10px] text-zinc-600">Queue position: 2</p></div><div className="rounded-xl border border-rose-500/15 bg-black/10 p-3"><div className="flex items-center justify-between"><span className="text-xs text-zinc-300">Shadow of the Crane</span><StatusBadge status="Failed" /></div><p className="mt-2 text-[10px] leading-5 text-zinc-500">Processing failed during audio extraction.</p><div className="mt-2 flex gap-3"><button type="button" className="text-[10px] text-zinc-400 hover:text-white">Retry Processing</button><button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-300">View Error</button></div></div></div></section>
              </aside>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white text-black" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}>{label}</Link>;
}

function SummaryCard({ title, value, warning = false }: { title: string; value: string; warning?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] text-zinc-500">{title}</p><p className={`mt-2 text-xl font-semibold tracking-tight ${warning ? "text-amber-300" : "text-zinc-200"}`}>{value}</p></div>;
}

function FilterSelect({ label, options }: { label: string; options: string[] }) {
  return <label><span className="sr-only">{label}</span><select defaultValue={options[0]} className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-white/20">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function MovieCard({ movie, index }: { movie: Movie; index: number }) {
  return <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/[0.16]">
    <div className={`relative aspect-video overflow-hidden bg-gradient-to-br ${posterColors[index % posterColors.length]}`}><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20" /><div className="absolute inset-0 flex items-center justify-center"><Film size={38} strokeWidth={1} className="text-white/20" /></div><div className="absolute left-3 top-3"><StatusBadge status={movie.status} /></div><div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3"><div><p lang="zh" className="text-xs text-white/60">{movie.originalTitle}</p><p className="mt-1 text-sm font-semibold text-white">{movie.title}</p></div><span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[9px] text-zinc-300">{movie.duration}</span></div>{movie.status === "Processing" && <div className="absolute inset-x-3 bottom-1 h-0.5 bg-white/20"><div className="h-full bg-white" style={{ width: `${movie.processingProgress}%` }} /></div>}</div>
    <div className="p-4"><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500"><span>{movie.language}</span><span>{movie.resolution}</span><span>{movie.fileSize}</span></div><div className="mt-3 flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-[9px] text-zinc-600">Project</p><p className="truncate text-[11px] text-zinc-400">{movie.project}</p></div><span className="shrink-0 text-[9px] text-zinc-600">{movie.addedAt}</span></div>{movie.status === "Processing" && <div className="mt-3"><div className="flex justify-between text-[9px] text-zinc-500"><span>Processing</span><span>{movie.processingProgress}%</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-zinc-300" style={{ width: `${movie.processingProgress}%` }} /></div></div>}{movie.status === "Queued" && <p className="mt-3 text-[10px] text-zinc-600">Waiting for processing worker · Queue position 2</p>}{movie.status === "Failed" && <p className="mt-3 flex items-center gap-1.5 text-[10px] text-rose-300/80"><AlertCircle size={12} /> Audio extraction failed</p>}<div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">{movie.projectHref ? <Link href={movie.projectHref} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[10px] font-medium text-black hover:bg-zinc-200">Open Project <ArrowRight size={12} /></Link> : <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400">Open Project <ArrowRight size={12} /></button>}<button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400">View Details</button><button type="button" aria-label={`More actions for ${movie.title}`} className="rounded-lg border border-white/10 p-2 text-zinc-500"><MoreHorizontal size={14} /></button></div></div>
  </article>;
}

const posterColors = ["from-indigo-950 via-slate-800 to-zinc-950", "from-blue-950 via-slate-700 to-black", "from-rose-950 via-zinc-800 to-black", "from-amber-950 via-stone-800 to-black", "from-cyan-950 via-slate-800 to-black", "from-emerald-950 via-zinc-800 to-black"];

function StatusBadge({ status }: { status: MovieStatus }) {
  const styles: Record<MovieStatus, string> = {
    Ready: "border-emerald-500/20 bg-emerald-950/60 text-emerald-300",
    Processing: "border-sky-500/20 bg-sky-950/60 text-sky-300",
    Queued: "border-white/15 bg-zinc-950/60 text-zinc-300",
    Failed: "border-rose-500/20 bg-rose-950/60 text-rose-300",
  };
  return <span className={`rounded-md border px-2 py-1 text-[9px] backdrop-blur-sm ${styles[status]}`}>{status}</span>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[9px] text-zinc-600">{label}</p><p className="mt-1 truncate text-[10px] text-zinc-300">{value}</p></div>;
}

function PipelineRow({ label, state, active = false }: { label: string; state: string; active?: boolean }) {
  const completed = state === "Completed";
  return <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${completed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : active ? "border-sky-400/40 bg-sky-400/10 text-sky-300" : "border-white/10 text-zinc-700"}`}>{completed ? <Check size={10} /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-sky-300" /> : null}</span><span className={`truncate text-[10px] ${active ? "text-zinc-200" : "text-zinc-500"}`}>{label}</span></div><span className={`shrink-0 text-[9px] ${completed ? "text-emerald-400/80" : active ? "text-sky-300" : "text-zinc-700"}`}>{state}</span></div>;
}

function StorageRow({ label, value, width }: { label: string; value: string; width: string }) {
  return <div><div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-zinc-500">{label}</span><span className="text-zinc-400">{value}</span></div><div className="h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full bg-zinc-500 ${width}`} /></div></div>;
}
