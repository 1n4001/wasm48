import { useEffect, useRef, useState } from "react";
import { EXAMPLES, KEY_ROWS, Session, bootSession, type FaceState } from "@/lib/calc/session";

const STARTER = "A = [1 2; 3 4]\nb = [1; 0]\nA\\b";

function emptyFace(): FaceState {
  return {
    levels: [4, 3, 2, 1].map((level) => ({ level, text: "" })),
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
  };
}

export function Calculator() {
  const sessionRef = useRef<Session | null>(null);
  const [face, setFace] = useState<FaceState>(emptyFace);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<"script" | "wasm" | "vars">("script");
  const [source, setSource] = useState(STARTER);

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
        openIf(session.press("enter"));
      } else if (key === "Backspace") {
        event.preventDefault();
        session.press("del");
      } else if (key === "Escape") {
        session.press("on");
        setPanel(false);
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
    function openIf(effect: "script" | "vars" | null) {
      if (effect === "script") {
        setTab("script");
        setPanel(true);
      } else if (effect === "vars") {
        setTab("vars");
        setPanel(true);
      }
    }
  }, []);

  const hit = (id: string) => {
    const session = sessionRef.current;
    if (!session) return;
    const effect = session.press(id);
    if (effect === "script") {
      setTab("script");
      setPanel(true);
    } else if (effect === "vars") {
      setTab("vars");
      setPanel(true);
    }
  };

  const runScript = () => {
    sessionRef.current?.runSource(source);
    setTab("wasm");
  };

  const downloadWasm = () => {
    const bytes = sessionRef.current?.lastBytes;
    if (!bytes?.byteLength) return;
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/wasm" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "caliber-expr.wasm";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-3 p-2 sm:p-3 lg:h-dvh lg:max-h-dvh lg:flex-row lg:overflow-hidden">
      <div className="flex w-full justify-center lg:h-full lg:min-h-0 lg:w-auto lg:flex-none">
        <section
          className="device flex w-full max-w-md flex-col gap-1 p-2 sm:p-2.5 lg:h-full lg:min-h-0 lg:w-[26rem] lg:overflow-hidden"
          data-shift={face.shift}
          aria-label="Caliber 48"
        >
          <header className="flex shrink-0 items-end justify-between px-1">
            <div>
              <p className="text-xs tracking-[0.28em] text-muted">CALIBER</p>
              <p className="text-2xl leading-none font-bold tracking-wide">48</p>
            </div>
            <p className="pb-0.5 text-right text-2xs tracking-[0.18em] text-legend-r">MATLAB · DGEMM · WASM</p>
          </header>
          <div className="lcd-well shrink-0">
            <div className="lcd flex flex-col gap-1 px-2 py-1.5">
              <div className="flex items-center justify-between text-2xs tracking-widest">
                <span className="flex gap-2">
                  <Ann on={face.shift === "l"} text="LS" />
                  <Ann on={face.shift === "r"} text="RS" />
                  <Ann on={face.alpha !== "off"} text={face.alpha === "lock" ? "αα" : "α"} />
                </span>
                <span className="font-bold">{face.angle}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-sm leading-tight tabular-nums sm:text-base">
                {face.levels.map((row) => (
                  <div key={row.level} className="grid grid-cols-[1.4rem_1fr] gap-2">
                    <span className="text-lcd-dim">{row.level}:</span>
                    <span className="truncate text-right">{row.text}</span>
                  </div>
                ))}
              </div>
              {face.matrix ? (
                <pre className="max-h-24 overflow-auto text-right text-xs leading-snug whitespace-pre">{face.matrix}</pre>
              ) : null}
              <div className="min-h-5 text-right text-sm">
                {face.message ? (
                  <span className="text-danger">{face.message}</span>
                ) : face.command ? (
                  <span>
                    {face.command}
                    <i className="lcd-caret" />
                  </span>
                ) : (
                  <span className="text-lcd-dim">2+3 ENTER</span>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1 border-t border-lcd-dim/40 pt-1 text-center text-2xs font-bold tracking-wide">
                {face.menuLabels.map((label) => (
                  <span key={label} className="truncate">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="key-row">
            {face.menuLabels.map((label, index) => (
              <button key={label} type="button" className="keycap keycap-menu" onClick={() => hit(`soft${index}`)} aria-label={label}>
                <span className="key-nub" />
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-auto flex-col gap-px">
            {KEY_ROWS.map((row) => (
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
                      <span className="text-base sm:text-lg">{key.label}</span>
                      {key.alpha ? <span className="alpha-ch">{key.alpha}</span> : null}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
      <EquationPanel
        open={panel}
        tab={tab}
        source={source}
        face={face}
        onClose={() => setPanel(false)}
        onTab={setTab}
        onSource={setSource}
        onRun={runScript}
        onExample={(value) => setSource(value)}
        onDownload={downloadWasm}
        onInsert={(name) => sessionRef.current?.typeText(name)}
      />
    </main>
  );
}

function Ann({ on, text }: { on: boolean; text: string }) {
  return <span className={on ? "font-bold" : "text-lcd-dim"}>{text}</span>;
}

function EquationPanel({
  open,
  tab,
  source,
  face,
  onClose,
  onTab,
  onSource,
  onRun,
  onExample,
  onDownload,
  onInsert,
}: {
  open: boolean;
  tab: "script" | "wasm" | "vars";
  source: string;
  face: FaceState;
  onClose: () => void;
  onTab: (tab: "script" | "wasm" | "vars") => void;
  onSource: (value: string) => void;
  onRun: () => void;
  onExample: (value: string) => void;
  onDownload: () => void;
  onInsert: (name: string) => void;
}) {
  return (
    <aside
      className={
        open
          ? "fixed inset-0 z-30 flex min-h-0 flex-col overflow-y-auto bg-bg p-3 lg:static lg:z-auto lg:max-w-xl lg:flex-1 lg:bg-transparent lg:p-0"
          : "hidden lg:flex lg:min-h-0 lg:max-w-xl lg:flex-1 lg:flex-col lg:overflow-y-auto"
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h1 className="text-lg tracking-wide">Equation writer</h1>
        <button type="button" className="text-sm text-muted lg:hidden" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {(
          [
            ["script", "Script"],
            ["wasm", "WASM"],
            ["vars", "Names"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={
              tab === id
                ? "bg-shift px-3 py-1 text-sm text-shift-ink"
                : "bg-body px-3 py-1 text-sm text-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>
      {face.xFull ? (
        <pre className="mt-3 max-h-36 overflow-auto bg-body p-3 font-mono text-sm leading-relaxed whitespace-pre text-ink">
          {face.xFull}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-muted">Level 1 is empty. Run a script or use the keypad.</p>
      )}
      {tab === "script" ? (
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            value={source}
            onChange={(event) => onSource(event.target.value)}
            spellCheck={false}
            aria-label="MATLAB script"
            className="min-h-40 w-full resize-y bg-body p-3 font-mono text-sm leading-relaxed text-ink outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRun} className="bg-shift px-4 py-2 text-sm font-semibold text-shift-ink">
              Compile and push
            </button>
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() => onExample(example.source)}
                className="bg-body px-3 py-2 text-sm text-ink"
              >
                {example.name}
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-2 font-mono text-xs text-muted">
            {face.log.map((row, index) => (
              <li key={`${row.name}-${index}`}>
                <span className="text-legend-r">{row.name}</span>
                <pre className="whitespace-pre text-ink">{row.text}</pre>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-pretty text-muted">
            Assignments stay in the workspace. A bare expression is compiled to a WASM function, run against the BLAS
            module, and pushed on the RPN stack. With an empty command line, +, −, ×, ÷ and yˣ pop the stack instead.
          </p>
        </div>
      ) : null}
      {tab === "wasm" ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{face.bytes ? `${face.bytes} bytes` : "Nothing compiled yet"}</p>
            <button type="button" onClick={onDownload} className="bg-body px-3 py-2 text-sm text-ink" disabled={!face.bytes}>
              Download module
            </button>
          </div>
          <pre className="max-h-[28rem] overflow-auto bg-body p-3 font-mono text-xs leading-relaxed whitespace-pre text-ink">
            {face.listing || "The last expression’s WASM listing shows up here, including dgemm for matrix products."}
          </pre>
        </div>
      ) : null}
      {tab === "vars" ? (
        <ul className="mt-3 flex flex-col gap-2">
          {face.vars.length === 0 ? <li className="text-sm text-muted">No named variables yet.</li> : null}
          {face.vars.map((row) => (
            <li key={row.name}>
              <button type="button" onClick={() => onInsert(row.name)} className="flex w-full items-baseline justify-between gap-3 bg-body px-3 py-2 text-left">
                <span className="font-mono text-legend-l">{row.name}</span>
                <span className="truncate font-mono text-sm text-ink">{row.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
