import { useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES, FUNCTIONS, KEY_ROWS, Session, bootSession, type FaceState } from "@/lib/calc/session";
import { Graph } from "@/components/graph";
import { MathView } from "@/components/math-view";

const STARTER = "A = [1 2; 3 4]\nb = [1; 0]\nA\\b";

function emptyFace(): FaceState {
  return {
    levels: [],
    matrix: null,
    command: "",
    message: null,
    shift: "none",
    alpha: "off",
    angle: "RAD",
    menuTitle: "STACK",
    menuLabels: ["DUP", "DROP", "SWAP", "OVER", "ROT", "LAST"],
    bytes: 0,
    listing: "",
    vars: [],
    log: [],
    xFull: "",
    plot: null,
  };
}

export function Calculator() {
  const sessionRef = useRef<Session | null>(null);
  const [face, setFace] = useState<FaceState>(emptyFace);
  const [source, setSource] = useState(STARTER);
  const [keysOpen, setKeysOpen] = useState(true);
  const [fnQuery, setFnQuery] = useState("");
  const [fnGroup, setFnGroup] = useState("All");
  const [fnSort, setFnSort] = useState<{ key: "group" | "name" | "about" | "example"; dir: "asc" | "desc" } | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const fnGroups = useMemo(() => ["All", ...new Set(FUNCTIONS.map((row) => row.group))], []);
  const fnRows = useMemo(() => {
    const q = fnQuery.trim().toLowerCase();
    const filtered = FUNCTIONS.filter((row) => {
      if (fnGroup !== "All" && row.group !== fnGroup) return false;
      if (!q) return true;
      return `${row.group} ${row.name} ${row.args} ${row.about} ${row.example}`.toLowerCase().includes(q);
    });
    if (!fnSort) return filtered;
    const dir = fnSort.dir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const av = fnSort.key === "name" ? `${a.name}(${a.args})` : a[fnSort.key];
      const bv = fnSort.key === "name" ? `${b.name}(${b.args})` : b[fnSort.key];
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
    });
  }, [fnGroup, fnQuery, fnSort]);

  function sortFns(key: "group" | "name" | "about" | "example") {
    setFnSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  useEffect(() => {
    const session = bootSession();
    session.restore();
    sessionRef.current = session;
    const draw = () => {
      setFace(session.face());
      session.persist();
    };
    draw();
    const unsubscribe = session.subscribe(draw);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("textarea, input")) return;
      const key = event.key;
      if (key === "Enter") {
        event.preventDefault();
        session.press("enter");
      } else if (key === "Backspace") {
        event.preventDefault();
        session.press("del");
      } else if (key === "Escape") {
        session.press("on");
      } else if (key === " ") {
        event.preventDefault();
        session.press("spc");
      } else if (key === "+") session.press("add");
      else if (key === "-") session.press("sub");
      else if (key === "*") session.press("mul");
      else if (key === "/") session.press("div");
      else if (key === "^") session.press("pow");
      else if (key === "(") session.press("lparen");
      else if (key === ")") session.press("rparen");
      else if (key === "[") session.press("lbracket");
      else if (key === "]") session.press("rbracket");
      else if (key === "=") session.press("eq");
      else if (key === "'") session.press("tick");
      else if (key === ",") session.typeText(",");
      else if (key === ";") session.typeText(";");
      else if (key === ":") session.typeText(":");
      else if (key === ".") session.press("dot");
      else if (/^\d$/.test(key)) session.press(key);
      else if (/^[a-zA-Z]$/.test(key)) session.typeText(key);
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const el = stackRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [face.levels]);

  const hit = (id: string) => {
    sessionRef.current?.press(id);
  };

  const runScript = () => {
    sessionRef.current?.runSource(source);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3">
      <section className="device flex w-full flex-col gap-2 p-3" data-shift={face.shift} aria-label="WASM48">
        <header className="px-1">
          <p className="text-2xl leading-none font-bold tracking-[0.18em]">WASM48</p>
        </header>
        <div className="flex items-stretch gap-3">
          <div className="lcd-well flex min-h-full min-w-0 flex-1">
            <div className="lcd flex h-full min-h-full w-full flex-col gap-2 px-3 py-2">
              <div className="flex items-center justify-between text-xs tracking-widest">
                <span className="flex gap-3">
                  <Ann on={face.shift === "l"} text="LS" />
                  <Ann on={face.shift === "r"} text="RS" />
                  <Ann on={face.alpha !== "off"} text={face.alpha === "lock" ? "αα" : "α"} />
                </span>
                <span className="font-bold">{face.angle}</span>
              </div>
              <div ref={stackRef} className="flex flex-1 flex-col justify-end gap-3 text-base">
                {face.levels.map((row) => (
                  <div key={row.level}>
                    <div className="text-left">
                      <button
                        type="button"
                        className="text-lcd-dim"
                        title="Copy script"
                        onClick={() => {
                          const text = sessionRef.current?.levelScript(row.level) ?? row.expr;
                          void navigator.clipboard.writeText(text).then(
                            () => sessionRef.current?.notify("Copied"),
                            () => sessionRef.current?.notify("Copy failed"),
                          );
                        }}
                      >
                        {row.level}:
                      </button>{" "}
                      <MathView source={row.expr} />
                    </div>
                    <div className="flex justify-end">
                      <MathView source={row.text} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="min-h-6 text-left text-base">
                {face.message ? (
                  <span className="text-danger">{face.message}</span>
                ) : face.command ? (
                  <span>
                    <MathView source={face.command} />
                    <i className="lcd-caret" />
                  </span>
                ) : null}
              </div>
              <div className="lcd-menu">
                {face.menuLabels.map((label, index) => (
                  <button key={`${label}-${index}`} type="button" onClick={() => hit(`soft${index}`)} aria-label={label}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={keysOpen ? "keypad" : "keypad is-collapsed"}>
            <button
              type="button"
              className="key-toggle"
              aria-expanded={keysOpen}
              onClick={() => setKeysOpen((open) => !open)}
            >
              {keysOpen ? "Hide keys" : "Keys"}
            </button>
            {keysOpen
              ? KEY_ROWS.map((row) => (
                  <div key={row.map((key) => key.id).join()} className="key-row">
                    {row.map((key) => (
                      <div key={key.id} className={key.span === 2 ? "key-slot span-2" : "key-slot"}>
                        {key.legend ? (
                          <div className="legends">
                            <span className="legend-l">{key.legendL ?? ""}</span>
                            <span className="legend-r">{key.legendR ?? ""}</span>
                          </div>
                        ) : null}
                        <button type="button" className={`keycap keycap-${key.variant}`} onClick={() => hit(key.id)} aria-label={key.label}>
                          <span>{key.label}</span>
                          {key.alpha ? <span className="alpha-ch">{key.alpha}</span> : null}
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              : null}
          </div>
        </div>
      </section>
      {face.plot ? <Graph plot={face.plot} /> : null}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.7fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm tracking-[0.16em] text-muted">SCRIPT</h2>
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
              event.preventDefault();
              if (sessionRef.current?.runSource(source)) setSource("");
            }}
            spellCheck={false}
            aria-label="MATLAB script"
            title="Ctrl+Enter compiles, pushes, and clears"
            className="min-h-40 w-full resize-y bg-body p-3 font-mono text-sm leading-relaxed text-ink outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runScript} className="bg-shift px-4 py-2 text-sm font-semibold text-shift-ink">
              Compile and push
            </button>
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() => setSource(example.source)}
                className="bg-body px-3 py-2 text-sm text-ink"
              >
                {example.name}
              </button>
            ))}
          </div>
          {face.xFull ? (
            <pre className="max-h-36 overflow-auto bg-body p-3 font-mono text-sm leading-relaxed whitespace-pre text-ink">{face.xFull}</pre>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm tracking-[0.16em] text-muted">Variables</h2>
          <ul className="flex flex-col gap-2">
            {face.vars.length === 0 ? <li className="bg-body px-3 py-2 text-sm text-muted">No named variables yet.</li> : null}
            {face.vars.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() => sessionRef.current?.typeText(row.name)}
                  className="flex w-full items-baseline justify-between gap-3 bg-body px-3 py-2 text-left"
                >
                  <span className="font-mono text-legend-l">{row.name}</span>
                  <span className="min-w-0 text-ink">
                    <MathView source={row.text} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="bg-body">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <h2 className="text-sm tracking-[0.16em] text-muted">Functions</h2>
          <input
            value={fnQuery}
            onChange={(event) => setFnQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search functions"
            className="min-w-40 flex-1 bg-bg px-3 py-1.5 font-mono text-sm text-ink outline-none"
          />
          <select
            value={fnGroup}
            onChange={(event) => setFnGroup(event.target.value)}
            aria-label="Function group"
            className="bg-bg px-2 py-1.5 text-sm text-ink outline-none"
          >
            {fnGroups.map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
          <span className="text-sm text-muted">
            {fnRows.length} / {FUNCTIONS.length}
          </span>
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-body text-xs tracking-[0.14em] text-muted">
              <tr>
                <FnHead label="Group" sort={fnSort} k="group" onSort={sortFns} />
                <FnHead label="Call" sort={fnSort} k="name" onSort={sortFns} />
                <FnHead label="What it does" sort={fnSort} k="about" onSort={sortFns} />
                <FnHead label="Example" sort={fnSort} k="example" onSort={sortFns} />
              </tr>
            </thead>
            <tbody>
              {fnRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-muted">
                    No functions match.
                  </td>
                </tr>
              ) : null}
              {fnRows.map((row) => (
                <tr key={`${row.group}-${row.name}-${row.args}`} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{row.group}</td>
                  <td className="px-3 py-2 font-mono text-legend-l">{row.args ? `${row.name}(${row.args})` : row.name}</td>
                  <td className="px-3 py-2 text-ink">{row.about}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="font-mono text-legend-r" onClick={() => setSource(row.example)}>
                      {row.example}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function FnHead({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: "group" | "name" | "about" | "example";
  sort: { key: string; dir: "asc" | "desc" } | null;
  onSort: (key: "group" | "name" | "about" | "example") => void;
}) {
  const active = sort?.key === k;
  return (
    <th className="px-3 py-2 font-medium" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="text-left tracking-[0.14em]" onClick={() => onSort(k)}>
        {label}
        {active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function Ann({ on, text }: { on: boolean; text: string }) {
  return <span className={on ? "font-bold" : "text-lcd-dim"}>{text}</span>;
}
