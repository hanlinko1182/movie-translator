import Link from "next/link";
import RecapControls from "./RecapControls";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";

export default function RecapPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <BookOpen size={21} />
            </div>

            <div>
              <h1 className="text-sm font-semibold">Movie Translator</h1>

              <p className="text-xs text-zinc-500">AI Subtitle Studio</p>
            </div>
          </div>

          <nav className="mt-10 space-y-1">
            <SidebarItem href="/" label="Dashboard" />
            <SidebarItem href="/projects" label="Projects" active />
            <SidebarItem href="/movies" label="Movies" />
            <SidebarItem href="/subtitles" label="Subtitles" />
          </nav>

          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
              System
            </p>

            <SidebarItem href="/settings" label="Settings" />
          </div>
        </aside>

        {/* Main */}
        <section className="flex-1">
          {/* Header */}
          <header className="border-b border-white/10 px-6 py-5 lg:px-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Link href="/projects" className="hover:text-zinc-300">
                    Projects
                  </Link>

                  <span>/</span>

                  <Link
                    href="/projects/hidden-dragon"
                    className="hover:text-zinc-300"
                  >
                    The Hidden Dragon
                  </Link>

                  <span>/</span>

                  <span>Recap</span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <Link
                    href="/projects/hidden-dragon"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <ArrowLeft size={17} />
                  </Link>

                  <div>
                    <h2 className="text-xl font-semibold">
                      AI Narrative Recap
                    </h2>

                    <p className="mt-1 text-xs text-zinc-500">
                      The Hidden Dragon · Chinese → Myanmar
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <RefreshCw size={16} />
                  Regenerate
                </button>

                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
                >
                  <Copy size={16} />
                  Copy
                </button>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="p-6 lg:p-10">
            <div className="mx-auto max-w-7xl">
              {/* AI status */}
              <div className="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Sparkles size={18} className="text-zinc-300" />
                </div>

                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Story analysis completed
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Scenes, characters, events and relationships are available
                    for recap generation.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 size={15} />
                  Ready
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                {/* Settings */}
                  <RecapControls />
                {/* Recap */}
                <section className="min-w-0">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                      <div>
                        <p className="text-xs text-zinc-500">
                          Generated Narrative
                        </p>

                        <h3 className="mt-1 font-medium">The Hidden Dragon</h3>
                      </div>

                      <FileText size={18} className="text-zinc-500" />
                    </div>

                    <article className="space-y-7 p-6 lg:p-8">
                      <div>
                        <h4 className="text-lg font-semibold">
                          The Hidden Dragon
                        </h4>

                        <p className="mt-2 text-sm leading-7 text-zinc-400">
                          ဇာတ်လမ်းအစမှာ အဓိကဇာတ်ကောင်ဟာ သူ့ရဲ့ ပတ်ဝန်းကျင်ကို
                          သတိထားပြီး တစ်ဆင့်ချင်း
                          ဆုံးဖြတ်ချက်ချတတ်သူတစ်ယောက်အဖြစ် ပေါ်လွင်လာပါတယ်။
                          အခြေအနေတွေက ပိုပြီး ရှုပ်ထွေးလာတဲ့အခါ
                          သူ့ရဲ့ဆုံးဖြတ်ချက်တွေက
                          ဇာတ်လမ်းရဲ့နောက်ဆက်တွဲဖြစ်ရပ်တွေကို တဖြည်းဖြည်း
                          ပြောင်းလဲစေပါတယ်။
                        </p>
                      </div>

                      <div className="border-l-2 border-white/10 pl-5">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                          <UserRound size={15} />
                          Character Insight
                        </div>

                        <p className="mt-3 text-sm leading-7 text-zinc-400">
                          သူ့ရဲ့လုပ်ရပ်တွေကိုကြည့်ရင် အလွယ်တကူ
                          ယုံကြည်မဆုံးဖြတ်ဘဲ အခြေအနေကို စောင့်ကြည့်ပြီးမှ
                          လှုပ်ရှားတတ်တဲ့ပုံစံကို တွေ့ရပါတယ်။
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold">
                          Important Events
                        </h4>

                        <div className="mt-4 space-y-3">
                          <EventItem
                            number="01"
                            text="အဓိကဇာတ်ကောင်သည် မမျှော်လင့်ထားသော အခြေအနေတစ်ခုနှင့် ရင်ဆိုင်ရသည်။"
                          />

                          <EventItem
                            number="02"
                            text="သူ၏ဆုံးဖြတ်ချက်တစ်ခုကြောင့် ဇာတ်လမ်း၏အဓိကပဋိပက္ခ စတင်လာသည်။"
                          />

                          <EventItem
                            number="03"
                            text="အဖြစ်အပျက်များကြောင့် ဇာတ်ကောင်များအကြား ယုံကြည်မှုနှင့် ဆက်ဆံရေး ပြောင်းလဲလာသည်။"
                          />
                        </div>
                      </div>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}

function EventItem({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.015] p-4">
      <span className="text-xs font-medium text-zinc-600">{number}</span>

      <p className="text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}
