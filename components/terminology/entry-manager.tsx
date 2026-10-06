"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { categoryLabel, glossaryCategories, type GlossaryCategory, type TerminologyEntry, type TerminologyKind } from "@/lib/terminology-types";

type Props = {
  kind: TerminologyKind;
  projectSlug: string;
  initialEntries: TerminologyEntry[];
  sourceLanguage: string;
  targetLanguage: string;
};

const fieldClass = "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/30 focus:ring-1 focus:ring-white/20";
const actionClass = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40";

export default function EntryManager({ kind, projectSlug, initialEntries, sourceLanguage, targetLanguage }: Props) {
  const glossary = kind === "glossary";
  const emptyForm = () => ({ sourceText: "", targetText: "", sourceLanguage, targetLanguage, category: "TERM" as GlossaryCategory, notes: "" });
  const [entries, setEntries] = useState(initialEntries);
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
    (!glossary || category === "ALL" || entry.category === category));

  function reset() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  }

  function edit(entry: TerminologyEntry) {
    setEditingId(entry.id);
    setForm({ ...entry, category: entry.category ?? "TERM", notes: entry.notes ?? "" });
    setError("");
    setMessage("");
  }

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
      const saved = body.data as TerminologyEntry;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
        <label className="relative block flex-1"><span className="sr-only">Search source or target text</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={glossary ? "Search terminology..." : "Search translations..."} className={`${fieldClass} pl-9`} />
        </label>
        {glossary && <label><span className="sr-only">Category filter</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={`${fieldClass} bg-[#111114]`}><option value="ALL">All categories</option>{glossaryCategories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label>}
        <span className="text-xs text-zinc-500">{filtered.length} shown · {entries.length} {glossary ? "terms" : "entries"}</span>
      </div>
      <div aria-live="polite">{message && <p className="text-sm text-emerald-300">{message}</p>}{error && <p role="alert" className="text-sm text-amber-200">{error}</p>}</div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label={glossary ? "Project terms" : "Memory entries"} className="min-w-0 space-y-3">
          {filtered.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-zinc-500">{entries.length ? "No entries match this search." : glossary ? "No terms yet. Add a preferred name, title, or phrase." : "No memory entries yet. Add a repeated line or translate a movie to capture entries."}</div>}
          {filtered.map((entry) => <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] text-zinc-500"><span>{entry.sourceLanguage} → {entry.targetLanguage}</span>{entry.category && <span className="rounded-md border border-white/10 px-2 py-1 text-zinc-300">{categoryLabel(entry.category)}</span>}{!glossary && <span className="rounded-md border border-white/10 px-2 py-1">Exact match</span>}</div>
              <div className="flex gap-2"><button type="button" onClick={() => edit(entry)} disabled={busy} className={actionClass} aria-label={`Edit ${entry.sourceText}`}><Pencil size={13} />Edit</button><button type="button" onClick={() => setPendingDelete(entry.id)} disabled={busy} className={actionClass} aria-label={`Delete ${entry.sourceText}`}><Trash2 size={13} />Delete</button></div>
            </div>
            <p lang={entry.sourceLanguage} className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{entry.sourceText}</p>
            <p lang={entry.targetLanguage} className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-400">{entry.targetText}</p>
            {entry.notes && <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs text-zinc-500">{entry.notes}</p>}
            {pendingDelete === entry.id && <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3"><span className="text-xs text-zinc-400">Delete this entry?</span><button type="button" onClick={() => void remove(entry.id)} disabled={busy} className={`${actionClass} text-amber-200`}>Delete entry</button><button type="button" onClick={() => setPendingDelete(null)} disabled={busy} className={actionClass}>Cancel</button></div>}
          </article>)}
        </section>
        <form onSubmit={submit} aria-labelledby="entry-form-title" className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between"><h2 id="entry-form-title" className="text-sm font-medium">{editingId ? "Edit entry" : glossary ? "Add term" : "Add memory entry"}</h2>{editingId && <button type="button" onClick={reset} disabled={busy} className={actionClass} aria-label="Cancel editing"><X size={14} /></button>}</div>
          <label className="block text-xs text-zinc-400">Source text<textarea required maxLength={glossary ? 500 : 4000} rows={3} value={form.sourceText} onChange={(event) => setForm({ ...form, sourceText: event.target.value })} className={`${fieldClass} mt-2`} /></label>
          <label className="block text-xs text-zinc-400">Target translation<textarea required maxLength={glossary ? 2000 : 32000} rows={4} value={form.targetText} onChange={(event) => setForm({ ...form, targetText: event.target.value })} className={`${fieldClass} mt-2`} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs text-zinc-400">Source language code<input required maxLength={35} value={form.sourceLanguage} onChange={(event) => setForm({ ...form, sourceLanguage: event.target.value })} className={`${fieldClass} mt-2`} /></label><label className="block text-xs text-zinc-400">Target language code<input required maxLength={35} value={form.targetLanguage} onChange={(event) => setForm({ ...form, targetLanguage: event.target.value })} className={`${fieldClass} mt-2`} /></label></div>
          {glossary && <><label className="block text-xs text-zinc-400">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as GlossaryCategory })} className={`${fieldClass} mt-2 bg-[#111114]`}>{glossaryCategories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label><label className="block text-xs text-zinc-400">Notes <span className="text-zinc-600">(optional)</span><textarea maxLength={2000} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${fieldClass} mt-2`} /></label></>}
          <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"><Plus size={15} />{busy ? "Saving..." : editingId ? "Save changes" : "Add entry"}</button>
        </form>
      </div>
    </div>
  );
}
