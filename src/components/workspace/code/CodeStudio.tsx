"use client";
import Editor, { type Monaco, loader } from "@monaco-editor/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { CheckCircle2, Download, FileUp, Lock, Play, Save, Sparkles, Wand2 } from "lucide-react";
import { useApp } from "@/lib/store/app";
import { useWorkspace } from "@/lib/store/workspace";
import { compile, getBoard, SUPPORTED_FEATURES, UNSUPPORTED_FEATURES, AVR_SUPPORTED_BOARDS } from "@/lib/arduino";
import type { CompileResult } from "@/lib/arduino/types";
import { checkCodeAgainstCircuit, wiredControllerPins } from "@/lib/code/check";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { buildGraph } from "@/lib/circuit/nets";
import { getComponent } from "@/lib/catalogue";
import { designFingerprint, validationState } from "@/lib/fingerprint";
import type { Project, ValidationIssue } from "@/lib/types";
import { Button, Modal, Tabs } from "@/components/ui";
import { IssueCard } from "../Validation";
import { explainCode } from "@/lib/code/explain";
import { useArenaHex } from "@/lib/store/hex";

loader.config({ paths: { vs: "/monaco/vs" } });

const ARDUINO_API = [
  ["pinMode", "pinMode(${1:pin}, ${2:OUTPUT});", "Configure a pin as INPUT, OUTPUT or INPUT_PULLUP"],
  ["digitalWrite", "digitalWrite(${1:pin}, ${2:HIGH});", "Set a digital output HIGH or LOW"],
  ["digitalRead", "digitalRead(${1:pin})", "Read a digital input (HIGH/LOW)"],
  ["analogWrite", "analogWrite(${1:pin}, ${2:value});", "PWM output 0–255 (PWM pins only)"],
  ["analogRead", "analogRead(${1:A0})", "Read an analog input 0–1023 (10-bit)"],
  ["delay", "delay(${1:ms});", "Pause for milliseconds"],
  ["delayMicroseconds", "delayMicroseconds(${1:us});", "Pause for microseconds"],
  ["millis", "millis()", "Milliseconds since start"],
  ["micros", "micros()", "Microseconds since start"],
  ["pulseIn", "pulseIn(${1:pin}, ${2:HIGH}, ${3:30000})", "Measure a pulse length in µs (e.g. HC-SR04 ECHO)"],
  ["map", "map(${1:value}, ${2:fromLow}, ${3:fromHigh}, ${4:toLow}, ${5:toHigh})", "Re-map a number from one range to another (integer)"],
  ["constrain", "constrain(${1:x}, ${2:a}, ${3:b})", "Limit a value to a range"],
  ["Serial.begin", "Serial.begin(${1:9600});", "Start the serial port"],
  ["Serial.println", "Serial.println(${1});", "Print with newline"],
  ["Serial.print", "Serial.print(${1});", "Print"],
  ["Serial.available", "Serial.available()", "Bytes waiting to be read"],
  ["Serial.read", "Serial.read()", "Read one byte (-1 if none)"],
  ["attachInterrupt", "attachInterrupt(digitalPinToInterrupt(${1:2}), ${2:isr}, ${3:RISING});", "Run a function on a pin edge"],
] as const;

function formatCode(src: string): string {
  let depth = 0;
  return src
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      const opens = (line.match(/{/g) ?? []).length,
        closes = (line.match(/}/g) ?? []).length;
      if (line.startsWith("}")) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      depth = Math.max(0, depth + opens - closes + (line.startsWith("}") ? 1 : 0));
      return out;
    })
    .join("\n");
}

export default function CodeStudio({ project }: { project: Project }) {
  const { updateProject, award, user } = useApp();
  const ws = useWorkspace();
  const { hex, setHex } = useArenaHex();
  const [code, setCode] = useState(project.code);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>(project.codeCheck?.issues ?? []);
  const [tab, setTab] = useState<"check" | "pins" | "explain" | "features">("check");
  const [tplOpen, setTplOpen] = useState(false);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const vstate = validationState(project);
  const graph = useMemo(() => buildGraph(project), [project]);
  const ctrl = graph.parts.find((p) => graph.comps.get(p.uid)?.kind === "controller");
  const boardKey = (ctrl && graph.comps.get(ctrl.uid)?.board) || "generic";
  const board = getBoard(boardKey);
  const wired = useMemo(() => wiredControllerPins(graph), [graph]);

  // autosave code (debounced via the store)
  useEffect(() => {
    if (code === project.code) return;
    const t = setTimeout(() => updateProject(project.id, (p) => ({ ...p, code }), { history: false }), 600);
    return () => clearTimeout(t);
  }, [code, project.code, project.id, updateProject]);

  // live diagnostics
  useEffect(() => {
    const t = setTimeout(() => {
      const r = compile(code, { board });
      setResult(r);
      const m = monacoRef.current,
        ed = editorRef.current;
      if (m && ed?.getModel()) {
        m.editor.setModelMarkers(
          ed.getModel()!,
          "beast",
          r.diagnostics.map((d) => ({ startLineNumber: d.line, startColumn: d.column, endLineNumber: d.endLine ?? d.line, endColumn: d.endColumn ?? d.column + 1, message: `${d.code ? `[${d.code}] ` : ""}${d.message}`, severity: d.severity === "error" ? m.MarkerSeverity.Error : d.severity === "warning" ? m.MarkerSeverity.Warning : m.MarkerSeverity.Info })),
        );
      }
    }, 350);
    return () => clearTimeout(t);
  }, [code, board]);

  // circuit changed after the code was checked → status out of date
  const stale = project.codeCheck?.fingerprint && project.codeCheck.fingerprint !== designFingerprint(project);

  const runCheck = async () => {
    const r = compile(code, { board });
    setResult(r);
    const circuitIssues = r.ok ? checkCodeAgainstCircuit({ ...project, code }, r, user?.name ?? "Engineer") : [];
    const compileIssues: ValidationIssue[] = r.diagnostics
      .filter((d) => d.severity !== "info")
      .map((d, n) => ({ id: `CMP-${n}`, severity: d.severity === "error" ? "critical" : "warning", area: "code", code: d.code ?? "COMPILE", title: d.severity === "error" ? `LINE ${d.line}: ${d.message}` : `LINE ${d.line}: ${d.message}`, explanation: d.code === "UNSUPPORTED_FEATURE" ? "This C++ feature is not supported by the BEAST interpreter. Real Arduino may accept it; here it is reported instead of guessed." : "Fix this before simulating.", fix: "See the highlighted line in the editor.", pinId: String(d.line) }));
    const all = [...compileIssues, ...circuitIssues];
    setIssues(all);
    const ok = r.ok && !all.some((i) => i.severity === "critical");
    updateProject(project.id, (p) => ({ ...p, code, codeCheck: { at: new Date().toISOString(), ok, issues: all, fingerprint: designFingerprint(p) } }), { history: false });
    setTab("check");
    if (ok) await award("code-check-pass", project.id);
    const m = monacoRef.current,
      ed = editorRef.current;
    if (m && ed?.getModel()) {
      const lineIssues = circuitIssues.filter((i) => i.pinId && /^\d+$/.test(i.pinId));
      m.editor.setModelMarkers(ed.getModel()!, "circuit", lineIssues.map((i) => ({ startLineNumber: Number(i.pinId), startColumn: 1, endLineNumber: Number(i.pinId), endColumn: 200, message: `${i.title} ${i.fix}`, severity: i.severity === "critical" ? m.MarkerSeverity.Error : m.MarkerSeverity.Warning })));
    }
  };

  const goToLine = (line: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
  };
  useEffect(() => {
    if (ws.focus?.issue?.area === "code" && ws.focus.pinId && /^\d+$/.test(ws.focus.pinId)) setTimeout(() => goToLine(Number(ws.focus!.pinId)), 300);
  }, [ws.focus]);

  const saveVersion = () => updateProject(project.id, (p) => ({ ...p, code, codeVersions: [...p.codeVersions.slice(-29), { id: `cv_${Date.now()}`, at: new Date().toISOString(), source: code, note: `Saved ${new Date().toLocaleTimeString()}` }] }));
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = `${project.name.replace(/\W+/g, "_")}.ino`;
    a.click();
  };
  const explanation = useMemo(() => explainCode(code, result, wired), [code, result, wired]);

  if (vstate !== "passed")
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="bf-panel max-w-lg space-y-3 p-6 text-center">
          <Lock className="mx-auto text-accent-ink" size={32} />
          <div className="font-display text-xl font-bold">{vstate === "stale" ? "YOUR DESIGN CHANGED — VALIDATE AGAIN" : vstate === "failed" ? "FIX YOUR ROBOT FIRST" : "VALIDATE YOUR ROBOT FIRST"}</div>
          <p className="text-sm text-muted">Code Studio checks your code against your real circuit, so the circuit has to pass validation (no critical errors) before you continue.</p>
          <div className="flex justify-center gap-2">
            <Link href={`/workspace/${project.id}/circuit`} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">Open Circuit Studio</Link>
            <Link href={`/workspace/${project.id}/design`} className="rounded-md border border-line2 px-4 py-2 text-sm">Robot Designer</Link>
          </div>
          {project.validation && vstate === "failed" && <div className="text-xs text-bad">{project.validation.issues.filter((i) => i.severity === "critical").length} critical issue(s) remain.</div>}
        </div>
      </div>
    );

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_380px]">
      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-bg2 px-2 py-1.5">
          <span className="mr-2 font-mono text-[10px] text-dim">BOARD: {board.name.toUpperCase()}</span>
          <Button size="sm" variant="primary" onClick={() => void runCheck()}><CheckCircle2 size={13} /> VALIDATE CODE</Button>
          <Button size="sm" onClick={() => setTplOpen(true)}><Sparkles size={13} /> Templates</Button>
          <Button size="sm" onClick={() => setCode(formatCode(code))}><Wand2 size={13} /> Format</Button>
          <Button size="sm" onClick={saveVersion}><Save size={13} /> Save version</Button>
          <Button size="sm" onClick={download}><Download size={13} /> .ino</Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line2 px-2.5 py-1 text-xs hover:border-brand">
            <FileUp size={13} /> Import
            <input type="file" accept=".ino,.cpp,.c,.h,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCode(await f.text()); }} />
          </label>
          <Link href={`/workspace/${project.id}/arena`} className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-semibold text-on-brand"><Play size={13} /> Simulate</Link>
        </div>
        {stale && <div className="border-b border-warn/40 bg-warn/10 px-3 py-1 text-xs text-warn">Your circuit changed after the last code check — press VALIDATE CODE again.</div>}
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            language="cpp"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? "")}
            options={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minimap: { enabled: false }, tabSize: 2, automaticLayout: true, scrollBeyondLastLine: false }}
            onMount={(ed, monaco) => {
              editorRef.current = ed;
              monacoRef.current = monaco;
              monaco.editor.defineTheme("beast", {
                base: "vs-dark",
                inherit: true,
                rules: [
                  { token: "", foreground: "F1EEE3" },
                  { token: "keyword", foreground: "FF4D42", fontStyle: "bold" },
                  { token: "number", foreground: "F2C46B" },
                  { token: "string", foreground: "A9DDB8" },
                  { token: "comment", foreground: "AEB7AC", fontStyle: "italic" },
                  { token: "type", foreground: "A9D1E6" },
                ],
                colors: {
                  "editor.background": "#18201B",
                  "editor.foreground": "#F1EEE3",
                  "editorLineNumber.foreground": "#8E9A90",
                  "editorLineNumber.activeForeground": "#F1EEE3",
                  "editor.lineHighlightBackground": "#1E2721",
                  "editor.selectionBackground": "#F20B0B55",
                  "editorCursor.foreground": "#F20B0B",
                  "editorGutter.background": "#18201B",
                  "editorWidget.background": "#131A16",
                  "editorIndentGuide.background1": "#27322B",
                },
              });
              monaco.editor.setTheme("beast");
              monaco.languages.registerCompletionItemProvider("cpp", {
                provideCompletionItems: (model: MonacoEditor.ITextModel, position: { lineNumber: number; column: number }) => {
                  const word = model.getWordUntilPosition(position);
                  const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
                  const api = ARDUINO_API.map(([label, insert, doc]) => ({ label, kind: monaco.languages.CompletionItemKind.Function, insertText: insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: doc, range }));
                  const consts = ["HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "LED_BUILTIN", "RISING", "FALLING", "CHANGE"].map((c) => ({ label: c, kind: monaco.languages.CompletionItemKind.Constant, insertText: c, range }));
                  const pins = useArenaHex.getState().wired.map((w) => ({ label: `#define ${w.modulePin.replace(/\W/g, "_")} ${w.arduinoPin}`, kind: monaco.languages.CompletionItemKind.Snippet, insertText: `#define ${w.modulePin.replace(/\W/g, "_")} ${w.arduinoPin}  // ${w.pinLabel} → ${w.module} ${w.modulePin}`, documentation: `From your circuit: ${w.pinLabel} is wired to ${w.module} ${w.modulePin}`, range }));
                  return { suggestions: [...api, ...consts, ...pins] };
                },
              });
              if (!code.trim()) ed.setValue("// Write your robot's brain here — or press Templates for a starting point.\n\nvoid setup() {\n  \n}\n\nvoid loop() {\n  \n}\n");
            }}
          />
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-bg2 px-3 py-1 font-mono text-[10px]">
          {result ? (
            result.ok ? <span className="text-ok">✔ Compiles for the BEAST interpreter</span> : <span className="text-bad">✖ {result.diagnostics.filter((d) => d.severity === "error").length} error(s)</span>
          ) : <span className="text-dim">checking…</span>}
          <span className="text-dim">{result?.diagnostics.filter((d) => d.severity === "warning").length ?? 0} warnings</span>
          <span className="ml-auto text-dim">Executed in a sandboxed interpreter (Arduino C/C++ subset) — not a full C++ compiler</span>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col border-l border-line bg-bg2">
        <div className="border-b border-line p-2">
          <Tabs value={tab} onChange={setTab} items={[{ value: "check", label: "Check" }, { value: "pins", label: "Pin map" }, { value: "explain", label: "Explain" }, { value: "features", label: "Runtime" }]} />
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 text-sm">
          {tab === "check" && (
            <>
              {!project.codeCheck && <div className="text-muted">Press VALIDATE CODE to compile and compare your code with your circuit.</div>}
              {project.codeCheck && (project.codeCheck.ok ? <div className="rounded border border-ok/40 bg-ok/10 p-2 text-ok">Code compiles and matches your circuit. Ready to simulate!</div> : <div className="rounded border border-bad/40 bg-bad/10 p-2 text-bad">Fix the critical issues below before simulating.</div>)}
              {issues.map((i, n) => (
                <div key={i.id} onClick={() => i.pinId && /^\d+$/.test(i.pinId) && goToLine(Number(i.pinId))} className="cursor-pointer">
                  <IssueCard issue={i} n={n + 1} />
                </div>
              ))}
            </>
          )}
          {tab === "pins" && (
            <div className="space-y-2 text-xs">
              <p className="text-muted">Pins wired to your controller in Circuit Studio (click to insert a #define):</p>
              {wired.length === 0 && <div className="text-dim">Nothing is wired to the controller yet.</div>}
              {wired.map((w, i) => (
                <button key={i} className="flex w-full justify-between rounded border border-line px-2 py-1 font-mono hover:border-brand" onClick={() => editorRef.current?.trigger("keyboard", "type", { text: `#define ${w.modulePin.replace(/\W/g, "_")} ${w.arduinoPin}  // ${w.pinLabel} → ${w.module} ${w.modulePin}\n` })}>
                  <span className="text-brand">{w.pinLabel} ({w.arduinoPin})</span>
                  <span>→ {w.module}.{w.modulePin}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "explain" && (
            <div className="space-y-2 text-xs">
              {explanation.map((e, i) => (
                <div key={i} className="rounded border border-line p-2">
                  <div className="font-semibold text-text">{e.title}</div>
                  <div className="text-muted">{e.body}</div>
                  {e.line && <button className="mt-1 text-brand" onClick={() => goToLine(e.line!)}>Go to line {e.line}</button>}
                </div>
              ))}
            </div>
          )}
          {tab === "features" && (
            <div className="space-y-3 text-xs">
              <div className="rounded border border-brand/40 bg-brand/5 p-2 text-muted">
                <b className="text-brand">How your code runs:</b> the BEAST interpreter executes a documented subset of Arduino C/C++ in a sandbox inside your browser (no server, no access to anything outside the simulator, time and step limits). Unsupported features are reported — never silently guessed.
              </div>
              <div>
                <div className="bf-label mb-1">Supported</div>
                <ul className="list-disc space-y-0.5 pl-4 text-muted">{SUPPORTED_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
              <div>
                <div className="bf-label mb-1">Not supported</div>
                <ul className="list-disc space-y-0.5 pl-4 text-muted">{UNSUPPORTED_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
              <div className="rounded border border-line p-2">
                <div className="bf-label mb-1">Advanced: run a real compiled binary</div>
                <p className="text-muted">For {AVR_SUPPORTED_BOARDS.join(" / ").toUpperCase()} you can upload the .hex from Arduino IDE (Sketch → Export Compiled Binary). It runs on a cycle-level ATmega328P emulator (avr8js), so any code the real compiler accepts will execute.</p>
                {AVR_SUPPORTED_BOARDS.includes(board.key) ? (
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded border border-line2 px-2 py-1 hover:border-brand">
                    <FileUp size={12} /> {hex ? "Replace .hex" : "Upload .hex"}
                    <input type="file" accept=".hex" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setHex(project.id, await f.text(), f.name); }} />
                  </label>
                ) : <div className="mt-1 text-warn">Not available for {board.name}.</div>}
                {hex?.projectId === project.id && <div className="mt-1 text-ok">Loaded {hex.name} — the arena will run it instead of the editor code. <button className="text-bad" onClick={() => setHex(project.id, null)}>Remove</button></div>}
              </div>
            </div>
          )}
        </div>
        <SyncWired wired={wired} />
      </aside>

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Code templates (optional)" wide>
        <p className="mb-3 text-sm text-muted">Templates are starting points — you can always write your own. Inserting a template replaces the editor contents (your current code is saved as a version first). Check the #define pin numbers against your circuit!</p>
        <div className="grid gap-2 md:grid-cols-2">
          {CODE_TEMPLATES.map((t) => (
            <button key={t.id} className="rounded border border-line p-3 text-left hover:border-accent" onClick={() => { saveVersion(); setCode(t.code); setTplOpen(false); }}>
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-muted">{t.description}</div>
              <div className="mt-1 font-mono text-[10px] uppercase text-accent-ink">{t.competition}</div>
            </button>
          ))}
        </div>
        {project.codeVersions.length > 0 && (
          <div className="mt-4">
            <div className="bf-label mb-1">Your saved versions</div>
            {[...project.codeVersions].reverse().slice(0, 8).map((v) => (
              <button key={v.id} className="mr-2 mt-1 rounded border border-line px-2 py-1 text-xs hover:border-brand" onClick={() => { setCode(v.source); setTplOpen(false); }}>{v.note}</button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SyncWired({ wired }: { wired: ReturnType<typeof wiredControllerPins> }) {
  const set = useArenaHex((s) => s.setWired);
  useEffect(() => set(wired), [wired, set]);
  return null;
}
export { getComponent };
