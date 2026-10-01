"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

const focusOptions = ["Character", "Story", "Emotion", "Detailed"] as const;

const lengthOptions = ["Short", "Medium", "Long"] as const;

const styleOptions = [
  "Cinematic Storytelling",
  "Character-Focused",
  "Emotional Storytelling",
  "Mystery / Suspense",
  "Detailed Narrative",
] as const;

type RecapResponse = {
  success: boolean;
  recap: {
    title: string;
    summary: string;
    characters: {
      name: string;
      personality: string;
    }[];
    events: string[];
  };
};

export default function RecapControls() {
  const [focus, setFocus] =
    useState<(typeof focusOptions)[number]>("Character");

  const [length, setLength] =
    useState<(typeof lengthOptions)[number]>("Medium");

  const [style, setStyle] = useState<(typeof styleOptions)[number]>(
    "Cinematic Storytelling",
  );

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapResponse["recap"] | null>(null);

  async function handleGenerate() {
    try {
      setGenerating(true);
      setError(null);

      const response = await fetch("/api/recap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus,
          length,
          style,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate recap.");
      }

      const data: RecapResponse = await response.json();

      setResult(data.recap);
    } catch (error) {
      console.error(error);
      setError("Recap generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-6">
        <h3 className="text-sm font-semibold">Recap Settings</h3>

        <p className="mt-1 text-xs text-zinc-500">
          Control how the story is narrated.
        </p>
      </div>

      {/* Focus */}
      <div>
        <p className="mb-3 text-xs font-medium text-zinc-400">Focus</p>

        <div className="grid grid-cols-2 gap-2">
          {focusOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFocus(option)}
              disabled={generating}
              className={`rounded-xl border px-3 py-2.5 text-xs transition ${
                focus === option
                  ? "border-white/20 bg-white text-black"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Length */}
      <div className="mt-6">
        <p className="mb-3 text-xs font-medium text-zinc-400">Length</p>

        <div className="space-y-2">
          {lengthOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLength(option)}
              disabled={generating}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                length === option
                  ? "border-white/20 bg-white/[0.06] text-white"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="mt-6">
        <p className="mb-3 text-xs font-medium text-zinc-400">
          Narration Style
        </p>

        <select
          value={style}
          disabled={generating}
          onChange={(event) =>
            setStyle(event.target.value as (typeof styleOptions)[number])
          }
          className="w-full rounded-xl border border-white/10 bg-[#111114] px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-white/20 disabled:opacity-60"
        >
          {styleOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Generate */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Sparkles size={16} />

        {generating ? "Generating..." : "Generate Recap"}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-emerald-500">
            Generated
          </p>

          <p className="mt-2 text-sm font-medium text-zinc-200">
            {result.title}
          </p>

          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {result.summary}
          </p>
        </div>
      )}

      {/* Current configuration */}
      <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-600">
          Current configuration
        </p>

        <div className="mt-2 space-y-1 text-xs">
          <p className="text-zinc-400">
            Focus: <span className="text-zinc-200">{focus}</span>
          </p>

          <p className="text-zinc-400">
            Length: <span className="text-zinc-200">{length}</span>
          </p>

          <p className="text-zinc-400">
            Style: <span className="text-zinc-200">{style}</span>
          </p>
        </div>
      </div>
    </aside>
  );
}