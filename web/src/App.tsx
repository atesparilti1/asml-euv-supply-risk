import { useEffect, useState } from "react";
import { AUTHOR_SITE, DCF_SITE, REPO } from "./data";
import { Assumptions } from "./sections/Assumptions";
import { Conclusions } from "./sections/Conclusions";
import { Decision } from "./sections/Decision";
import { Hero } from "./sections/Hero";
import { Model } from "./sections/Model";
import { Plain } from "./sections/Plain";
import { Results } from "./sections/Results";
import { Sensitivity } from "./sections/Sensitivity";
import { Simulator } from "./sections/Simulator";
import { Validation } from "./sections/Validation";

const NAV = [["idea", "Idea"], ["model", "Model"], ["assumptions", "Assumptions"], ["results", "Results"], ["decision", "Decision"],
  ["sensitivity", "Sensitivity"], ["validation", "Validation"], ["simulator", "Simulator"], ["conclusions", "Conclusions"]];

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try { return localStorage.getItem("theme"); } catch { return null; }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { if (theme) localStorage.setItem("theme", theme); else localStorage.removeItem("theme"); } catch { /* storage unavailable */ }
  }, [theme]);
  const dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  return (
    <button onClick={() => setTheme(dark ? "light" : "dark")} className="border border-line px-2 py-1 text-[11px] text-muted hover:text-ink" aria-label="Toggle dark mode">
      {dark ? "Light" : "Dark"}
    </button>
  );
}

export default function App() {
  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a href="#" className="shrink-0 text-sm font-semibold">EUV Supply Risk</a>
          <div className="no-scrollbar flex min-w-0 flex-1 gap-4 overflow-x-auto text-xs text-muted">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 hover:text-ink">{label}</a>)}
          </div>
          <ThemeToggle />
        </div>
      </nav>
      <main>
        <Hero />
        <Plain />
        <Model />
        <Assumptions />
        <Results />
        <Decision />
        <Sensitivity />
        <Validation />
        <Simulator />
        <Conclusions />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-8 text-xs text-muted sm:px-6">
          <span>Ates Parilti · Industrial Engineering, TU Eindhoven · not investment advice</span>
          <span className="flex gap-4">
            <a className="hover:text-ink" href={AUTHOR_SITE}>atesparilti.com</a>
            <a className="hover:text-ink" href={DCF_SITE}>ASML DCF</a>
            <a className="hover:text-ink" href={REPO}>GitHub</a>
          </span>
        </div>
      </footer>
    </>
  );
}
