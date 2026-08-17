import { useState, type ReactNode } from "react";

/** مقطع حرق `||نص||` — مموّه حتى يضغطه القارئ. */
function Spoiler({ children }: { children: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setShow(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShow(true)}
      className={`rounded px-1 transition-colors ${
        show ? "" : "cursor-pointer select-none bg-app-3/40 text-transparent"
      }`}
    >
      {children}
    </span>
  );
}

/** يحوّل النص: كل `||...||` يصبح مقطع حرق قابل للكشف، والباقي نص عادي. */
export function renderWithSpoilers(text: string): ReactNode[] {
  return text.split(/(\|\|[^|]+\|\|)/g).map((part, i) => {
    const m = /^\|\|([^|]+)\|\|$/.exec(part);
    return m ? <Spoiler key={i}>{m[1]}</Spoiler> : <span key={i}>{part}</span>;
  });
}
