"use client";

import { useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Trash2, X, BookOpen, Database, LoaderCircle, ShieldCheck } from "lucide-react";
import { categoryLabel, glossaryCategories, type GlossaryCategory, type TerminologyEntry, type TerminologyKind } from "@/lib/terminology-types";

import { badgeClass, badgeTones, cardClass, controlClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";

// Origin is already returned by the existing memory read/CRUD APIs.
type Entry = TerminologyEntry & { origin?: "MANUAL" | "AUTOMATIC" };

type Props = {
  kind: TerminologyKind;
  projectSlug: string;
  initialEntries: Entry[];
  sourceLanguage: string;
  targetLanguage: string;
};

const fieldClass = `${controlClass} w-full`;
const actionClass = secondaryButtonClass;
function EntryText({ text, language, label }: { text: string; language: string; label: string }) {
  return <><p lang={language} className={`whitespace-pre-wrap break-words text-sm leading-7 ${text.length > 180 ? "line-clamp-4" : ""}`}>{text}</p>{text.length > 180 && <details className="mt-2"><summary className="cursor-pointer rounded text-[11px] leading-6 text-violet-300">Read full {label}</summary><p lang={language} className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{text}</p></details>}</>;
}
function updatedLabel(value: string) { return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value)); }

export default function EntryManager({ kind, projectSlug, initialEntries, sourceLanguage, targetLanguage }: Props) {
  const glossary = kind === "glossary";
  const emptyForm = () => ({ sourceText: "", targetText: "", sourceLanguage, targetLanguage, category: "TERM" as GlossaryCategory, notes: "" });
  const [entries, setEntries] = useState(initialEntries);
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const [origin, setOrigin] = useState("ALL");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const endpoint = `/api/projects/${encodeURIComponent(projectSlug)}/${kind}`;
  const filtered = entries.filter((entry) =>
    `${entry.sourceText} ${entry.targetText}`.toLowerCase().includes(search.toLowerCase()) &&
    (!glossary || category === "ALL" || entry.category === category) &&
    (glossary || origin === "ALL" || entry.origin === origin));

  function reset() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  }

  function edit(entry: Entry) {
    setEditingId(entry.id);
    setForm({ ...entry, category: entry.category ?? "TERM", notes: entry.notes ?? "" });
    setError("");
    setMessage("");
    sourceInput.current?.focus();
  }

  function add() { reset(); setMessage(""); sourceInput.current?.focus(); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = {
        sourceText: form.sourceText, targetText: form.targetText,
        sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage,
        ...(glossary ? { category: form.category, notes: form.notes } : {}),
      };
      const response = await fetch(editingId ? `${endpoint}/${encodeURIComponent(editingId)}` : endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to save entry");
      const saved = body.data as Entry;
      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
      reset(); setMessage("Entry saved.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save entry");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to delete entry");
      setEntries((current) => current.filter((entry) => entry.id !== id));
      if (editingId === id) reset();
      setPendingDelete(null); setMessage("Entry deleted.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to delete entry");
    } finally { setBusy(false); }
  }

  function actions(entry: Entry) {
    return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => edit(entry)} disabled={busy} className={actionClass} aria-label={`Edit ${entry.sourceText}`}><Pencil size={13} aria-hidden="true" />Edit</button><button type="button" onClick={() => setPendingDelete(entry.id)} disabled={busy} className={`${actionClass} text-rose-300`} aria-label={`Delete ${entry.sourceText}`}><Trash2 size={13} aria-hidden="true" />Delete</button>
      {pendingDelete === entry.id && <div className="w-full space-y-2 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3"><p className="text-xs leading-5 text-zinc-300">Delete this entry?</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void remove(entry.id)} disabled={busy} className={`${actionClass} text-rose-300`}>{busy ? "Deleting…" : "Delete entry"}</button><button type="button" onClick={() => setPendingDelete(null)} disabled={busy} className={actionClass}>Cancel</button></div></div>}
    </div>;
  }
  const manual = entries.filter((entry) => entry.origin === "MANUAL").length;
  const automatic = entries.filter((entry) => entry.origin === "AUTOMATIC").length;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className={glossary ? "flex flex-wrap gap-3" : "grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-3"}>{(glossary ? [{ label: "Project terms", value: entries.length }] : [{ label: "Total entries", value: entries.length }, { label: "Manual", value: manual }, { label: "Automatic", value: automatic }]).map((item) => <div key={item.label} className={`${cardClass} flex min-w-0 py-3 ${glossary ? "items-center gap-3 px-4" : "flex-col items-start gap-1 px-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"}`}><span className="text-xs text-zinc-500">{item.label}</span><span className="text-lg font-semibold tabular-nums">{item.value}</span></div>)}</div>
      <button type="button" onClick={add} disabled={busy} className={primaryButtonClass}><Plus size={15} aria-hidden="true" />{glossary ? "Add Term" : "Add Memory Entry"}</button>
    </div>
    {!glossary && <p className="flex items-start gap-2 text-xs leading-6 text-zinc-400"><ShieldCheck size={15} aria-hidden="true" className="mt-1 shrink-0 text-violet-300" /><span>Manual pairs are protected from automatic capture. Explicit human saves can update an exact source pair. Saved pairs are reusable; origin alone does not mean a translation was approved.</span></p>}
    <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
      <label className="relative block min-w-0 flex-1"><span className="sr-only">Search source or target text</span><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={glossary ? "Search source or target terminology…" : "Search Chinese source or Myanmar target…"} className={`${fieldClass} pl-9`} /></label>
      {glossary ? <label><span className="sr-only">Category filter</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={`${fieldClass} sm:w-auto`}><option value="ALL">All types</option>{glossaryCategories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label>
        : <label><span className="sr-only">Origin filter</span><select value={origin} onChange={(event) => setOrigin(event.target.value)} className={`${fieldClass} sm:w-auto`}><option value="ALL">All origins</option><option value="MANUAL">Manual</option><option value="AUTOMATIC">Automatic</option></select></label>}
      <span role="status" className="text-xs text-zinc-500">{filtered.length} of {entries.length} shown</span>
    </div>
    <div aria-live="polite">{message && <p className="text-sm text-emerald-300">{message}</p>}{error && <p role="alert" className="break-words text-sm leading-6 text-rose-300">{error}</p>}</div>
    <div className={`grid min-w-0 items-start gap-5 ${glossary ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
      <section aria-label={glossary ? "Project terms" : "Memory entries"} className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center gap-2 border-b border-white/10 p-4"><span className="text-violet-300">{glossary ? <BookOpen size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}</span><h2 className="text-sm font-semibold">{glossary ? "Project terminology" : "Reusable translation pairs"}</h2></div>
        {filtered.length === 0 ? <div className="p-6 sm:p-8"><h3 className="text-base font-medium">{entries.length ? "No entries match your filters." : glossary ? "No glossary terms yet." : "No translation-memory entries yet."}</h3><p className="mt-2 text-sm leading-7 text-zinc-400">{entries.length ? "Try another source or target phrase, or clear the current filters." : glossary ? "Add names, locations, martial-arts terms, or recurring phrases that should translate consistently." : "Manual subtitle edits and qualifying translation results will populate reusable pairs."}</p><button type="button" disabled={busy} onClick={() => { if (entries.length) { setSearch(""); setCategory("ALL"); setOrigin("ALL"); } else add(); }} className={`${secondaryButtonClass} mt-5`}>{entries.length ? "Clear filters" : glossary ? "Add First Term" : "Add Memory Entry"}</button></div>
          : <table className="block w-full table-fixed text-left text-xs md:table"><thead className="hidden bg-white/[0.02] text-[11px] text-zinc-500 md:table-header-group"><tr><th className="p-3 font-medium">{glossary ? "Source Term" : "Chinese Source"}</th><th className="p-3 font-medium">Myanmar Target</th><th className="w-24 p-3 font-medium">{glossary ? "Type" : "Origin"}</th>{glossary && <th className="w-24 p-3 font-medium">Notes</th>}{!glossary && <th className="w-24 p-3 font-medium">Language Pair</th>}<th className="w-24 p-3 font-medium">Updated</th><th className="w-32 p-3 font-medium">Actions</th></tr></thead>
          <tbody className="block divide-y divide-white/[0.07] md:table-row-group">{filtered.map((entry) => <tr key={entry.id} className={`grid min-w-0 grid-cols-1 gap-1 p-4 transition hover:bg-white/[0.025] md:table-row md:p-0 ${editingId === entry.id ? "bg-violet-500/10" : ""}`}>
            <td className="block min-w-0 py-2 align-top md:table-cell md:p-3"><span className="mb-1 block text-[11px] text-zinc-500 md:sr-only">{glossary ? "Source term" : "Chinese source"}</span><div className="text-zinc-200"><EntryText text={entry.sourceText} language={entry.sourceLanguage} label="source" /></div>{glossary && <span className="mt-2 block text-[11px] text-zinc-500">{entry.sourceLanguage} → {entry.targetLanguage}</span>}</td>
            <td className="block min-w-0 py-2 align-top md:table-cell md:p-3"><span className="mb-1 block text-[11px] text-zinc-500 md:sr-only">Myanmar target</span><div className="text-zinc-300"><EntryText text={entry.targetText} language={entry.targetLanguage} label="translation" /></div></td>
            <td className="block py-2 align-top md:table-cell md:p-3"><span className={`${badgeClass} ${badgeTones[!glossary && entry.origin === "MANUAL" ? "violet" : "neutral"]}`}>{glossary && entry.category ? categoryLabel(entry.category) : entry.origin === "MANUAL" ? "Manual" : entry.origin === "AUTOMATIC" ? "Automatic" : "Not recorded"}</span></td>
            {glossary && <td className="block min-w-0 py-2 align-top text-xs leading-6 text-zinc-400 md:table-cell md:p-3"><span className="mb-1 block text-[11px] text-zinc-500 md:sr-only">Notes</span>{entry.notes ? <><p className={`${entry.notes.length > 100 ? "line-clamp-3" : ""} whitespace-pre-wrap break-words`}>{entry.notes}</p>{entry.notes.length > 100 && <details className="mt-2"><summary className="cursor-pointer rounded text-[11px] text-violet-300">Read full notes</summary><p className="mt-2 whitespace-pre-wrap break-words">{entry.notes}</p></details>}</> : <span className="text-zinc-500">No notes</span>}</td>}
            {!glossary && <td className="block py-2 align-top text-[11px] leading-6 text-zinc-400 md:table-cell md:p-3"><span className="mr-1 md:sr-only">Language pair</span>{entry.sourceLanguage} → {entry.targetLanguage}</td>}
            <td className="block py-2 align-top text-[11px] leading-5 text-zinc-500 md:table-cell md:p-3"><span className="mr-1 md:sr-only">Updated</span><time dateTime={entry.updatedAt} title={`${entry.updatedAt} (UTC)`}>{updatedLabel(entry.updatedAt)}</time></td>
            <td className="block py-2 align-top md:table-cell md:p-3">{actions(entry)}</td>
          </tr>)}</tbody></table>}
      </section>
      <form onSubmit={submit} aria-labelledby="entry-form-title" className={`${cardClass} space-y-4 p-4 sm:p-5`}>
        <div className="flex items-center justify-between gap-2"><h2 id="entry-form-title" className="text-sm font-semibold">{editingId ? glossary ? "Edit term" : "Edit memory entry" : glossary ? "Add term" : "Add memory entry"}</h2>{editingId && <button type="button" onClick={reset} disabled={busy} className={actionClass} aria-label="Cancel editing"><X size={14} aria-hidden="true" /></button>}</div>
        {!glossary && <p className="text-xs leading-6 text-zinc-500">Saving here sets the pair’s origin to Manual.</p>}
        <div className={`grid gap-4 ${glossary ? "" : "md:grid-cols-2"}`}><label className="block min-w-0 text-xs text-zinc-400">{glossary ? "Source term" : "Source text"}<textarea ref={sourceInput} required maxLength={glossary ? 500 : 4000} rows={3} lang={form.sourceLanguage} value={form.sourceText} onChange={(event) => setForm({ ...form, sourceText: event.target.value })} className={`${fieldClass} mt-2 resize-y leading-7`} /></label>
        <label className="block text-xs text-zinc-400">Target translation<textarea required maxLength={glossary ? 2000 : 32000} rows={4} lang={form.targetLanguage} value={form.targetText} onChange={(event) => setForm({ ...form, targetText: event.target.value })} className={`${fieldClass} mt-2 resize-y leading-7`} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="block min-w-0 text-xs leading-5 text-zinc-400">Source language code<input required maxLength={35} value={form.sourceLanguage} onChange={(event) => setForm({ ...form, sourceLanguage: event.target.value })} className={`${fieldClass} mt-2`} /></label><label className="block min-w-0 text-xs leading-5 text-zinc-400">Target language code<input required maxLength={35} value={form.targetLanguage} onChange={(event) => setForm({ ...form, targetLanguage: event.target.value })} className={`${fieldClass} mt-2`} /></label></div>
        {glossary && <><label className="block text-xs text-zinc-400">Type<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as GlossaryCategory })} className={`${fieldClass} mt-2`}>{glossaryCategories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label><label className="block text-xs text-zinc-400">Notes <span className="text-zinc-500">(optional)</span><textarea maxLength={2000} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${fieldClass} mt-2 resize-y`} /></label></>}
        <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full`}>{busy ? <LoaderCircle size={15} aria-hidden="true" className="animate-spin" /> : <Plus size={15} aria-hidden="true" />}{busy ? "Saving…" : editingId ? "Save changes" : glossary ? "Add term" : "Add entry"}</button>
        {editingId && <button type="button" onClick={reset} disabled={busy} className={`${secondaryButtonClass} w-full`}>Cancel editing</button>}
      </form>
    </div>
  </div>;
}
