import katex from "katex";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";

/** KaTeX math. Inline by default; `block` for display equations. */
export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(children, { displayMode: block, throwOnError: false, strict: false }), [children, block]);
  return block ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Chapter({ id, n, kicker, title, lede, children }: {
  id: string; n: string; kicker: string; title: string; lede?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <div className="mb-8 grid gap-3 md:grid-cols-[10rem_1fr]">
          <p className="mono text-xs text-faint">{n} · {kicker}</p>
          <div>
            <h2 className="display text-3xl font-semibold sm:text-4xl">{title}</h2>
            {lede && <div className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{lede}</div>}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function Panel({ title, sub, children, className = "", aside }: {
  title?: string; sub?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode;
}) {
  return (
    <figure className={`border border-line bg-surface/40 p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <p className="text-sm font-medium">{title}</p>}
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
          {aside}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

export function StatTile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="border border-line p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden><line x1="0" x2="16" y1="4" y2="4" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dash ? "3 2" : undefined} /></svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "accent" }) {
  return <span className={`inline-block border px-1.5 py-0.5 text-[10.5px] tracking-wide ${tone === "accent" ? "border-accent text-accent" : "border-line text-muted"}`}>{children}</span>;
}

export function DataTable({ summary = "Show data table", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted hover:text-ink">{summary}</summary>
      <div className="mt-2 max-h-72 overflow-auto">{children}</div>
    </details>
  );
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-accent bg-accent-soft px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/** Container width for pixel-exact SVG charts. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(Math.max(260, Math.round(ref.current.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid auto-cols-fr grid-flow-col border border-line">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${o.value === value ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
