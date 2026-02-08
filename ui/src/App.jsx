import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import devsyncIcon from "./assets/devsync-logo.png"; // rename file if needed

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// ✅ Put icon-only file here: ui/public/devsync-icon.png
const DEV_SYNC_LOGO = devsyncIcon;

/* -------------------- Demo Diff -------------------- */
const sampleDiff = `diff --git a/config.py b/config.py
index 1111111..2222222 100644
--- a/config.py
+++ b/config.py
@@ -1,12 +1,18 @@
-API_KEY = "sk-live-1234567890"
-DB_PASSWORD = "password123"
+import os
+
+API_KEY = os.getenv("API_KEY")
+DB_PASSWORD = os.getenv("DB_PASSWORD")
 
 def connect_db():
-    return connect(password=DB_PASSWORD)
+    if not DB_PASSWORD:
+        raise ValueError("Missing DB_PASSWORD")
+    return connect(password=DB_PASSWORD)
 
 def call_api():
-    return request(API_KEY)
+    if not API_KEY:
+        raise ValueError("Missing API_KEY")
+    return request(API_KEY)
`;

/* -------------------- DEMO OLD/NEW (for algorithm switch) -------------------- */
const demoOldCode = `
API_KEY = "sk-live-1234567890"
DB_PASSWORD = "password123"

def connect_db():
    return connect(password=DB_PASSWORD)

def call_api():
    return request(API_KEY)
`;

const demoNewCode = `
import os

API_KEY = os.getenv("API_KEY")
DB_PASSWORD = os.getenv("DB_PASSWORD")

def connect_db():
    if not DB_PASSWORD:
        raise ValueError("Missing DB_PASSWORD")
    return connect(password=DB_PASSWORD)

def call_api():
    if not API_KEY:
        raise ValueError("Missing API_KEY")
    return request(API_KEY)
`;

/* -------------------- Myers rows (via diff library) -------------------- */
function buildMyersRows(oldText, newText) {
  const parts = diffLines(oldText, newText);
  const rows = [];

  let oldNo = 1;
  let newNo = 1;

  rows.push({ kind: "hunk", header: "@@ (computed diff) @@" });

  for (const part of parts) {
    const normalized = part.value.replace(/\r\n/g, "\n");
    const split = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");

    for (const line of split) {
      if (part.added) {
        rows.push({
          kind: "row",
          left: { no: null, text: "", type: "blank" },
          right: { no: newNo++, text: line, type: "add" },
          pairType: "add",
        });
      } else if (part.removed) {
        rows.push({
          kind: "row",
          left: { no: oldNo++, text: line, type: "del" },
          right: { no: null, text: "", type: "blank" },
          pairType: "del",
        });
      } else {
        rows.push({
          kind: "row",
          left: { no: oldNo++, text: line, type: "ctx" },
          right: { no: newNo++, text: line, type: "ctx" },
          pairType: "ctx",
        });
      }
    }
  }

  return rows;
}

/* -------------------- Helpers -------------------- */
const prettifyModel = (model) => {
  const m = (model || "").toLowerCase();
  if (m.includes("gemini-3")) return "Gemini 3";
  if (m.includes("gemini-2")) return "Gemini 2";
  if (m === "gemini") return "Gemini";
  if (m.startsWith("fallback:")) return "Fallback";
  return model || "unknown";
};

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function normalizeReview(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const out = { ...payload };
  if (!Array.isArray(out.risks)) out.risks = [];
  if (!Array.isArray(out.improvements)) out.improvements = [];
  if (typeof out.summary !== "string") out.summary = "";
  return out;
}

function extractFileFromDiff(diffText) {
  const m = /diff --git a\/(.+?) b\//.exec(diffText || "");
  return m?.[1] || "file.py";
}

function riskSeverity(r) {
  const t = (r || "").toLowerCase();
  if (t.includes("security") || t.includes("password") || t.includes("token") || t.includes("leak") || t.includes("secret")) return "HIGH";
  if (t.includes("keyerror") || t.includes("typeerror") || t.includes("uncaught") || t.includes("null")) return "MEDIUM";
  return "LOW";
}

function scoreFromRisks(risks) {
  let score = 0;
  for (const r of risks || []) {
    const sev = riskSeverity(r);
    score += sev === "HIGH" ? 35 : sev === "MEDIUM" ? 20 : 12;
  }
  return Math.min(100, score);
}

function checksFromReview(risks, improvements) {
  const score = scoreFromRisks(risks);
  const security = (risks || []).some(
    (r) => (r || "").toLowerCase().includes("security") || (r || "").toLowerCase().includes("password") || (r || "").toLowerCase().includes("secret")
  );
  const runtime = (risks || []).some(
    (r) => (r || "").toLowerCase().includes("keyerror") || (r || "").toLowerCase().includes("typeerror") || (r || "").toLowerCase().includes("null")
  );

  return [
    { name: "DevSync / AI Review", status: score >= 70 ? "FAIL" : score >= 35 ? "WARN" : "PASS", details: score >= 35 ? "Issues detected. Consider fixes." : "Looks good." },
    { name: "Security", status: security ? "WARN" : "PASS", details: security ? "Potential secret/auth weakness flagged." : "No obvious security risks flagged." },
    { name: "Reliability", status: runtime ? "WARN" : "PASS", details: runtime ? "Potential runtime exceptions detected." : "No obvious runtime exceptions." },
    { name: "Maintainability", status: (improvements || []).length ? "WARN" : "PASS", details: (improvements || []).length ? "Refactors suggested." : "No major maintainability concerns." },
  ];
}

function statusTone(status) {
  if (status === "FAIL") return "danger";
  if (status === "WARN") return "warn";
  return "ok";
}

function scoreTone(score) {
  if (score >= 80) return "danger";
  if (score >= 50) return "warn";
  if (score >= 20) return "info";
  return "ok";
}

function whyFlagged(sev) {
  if (sev === "HIGH") return "Security/auth pattern detected (hardcoded secret/static token).";
  if (sev === "MEDIUM") return "Runtime safety risk detected (type/nullable assumptions).";
  return "Best-practice improvement (clarity/robustness).";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* -------------------- Feature #1: Secret detection + masking -------------------- */
function detectSecrets(text) {
  const t = String(text || "");

  const patterns = [
    { name: "API_KEY", re: /\bAPI_KEY\b/i },
    { name: "DB_PASSWORD", re: /\bDB_PASSWORD\b/i },
    { name: "PASSWORD", re: /\bPASSWORD\b/i },
    { name: "SECRET", re: /\bSECRET\b/i },
    { name: "TOKEN", re: /\bTOKEN\b/i },
    { name: "AWS_ACCESS_KEY_ID", re: /\bAWS_ACCESS_KEY_ID\b/i },
    { name: "AWS_SECRET_ACCESS_KEY", re: /\bAWS_SECRET_ACCESS_KEY\b/i },
    { name: "PRIVATE_KEY", re: /\bPRIVATE_KEY\b/i },
    { name: "sk- (api token)", re: /\bsk-[a-z0-9_-]{8,}\b/gi },
  ];

  const hits = [];
  for (const p of patterns) {
    if (p.re.test(t)) hits.push(p.name);
  }
  return Array.from(new Set(hits));
}

function maskLineIfSecret(line, secretHits) {
  if (!secretHits?.length) return line;

  let out = String(line);

  out = out.replace(/\b(sk-[a-z0-9_-]{8,})\b/gi, "***REDACTED***");
  out = out.replace(/(API_KEY\s*=\s*)["'][^"']+["']/gi, `$1"***REDACTED***"`);
  out = out.replace(/(DB_PASSWORD\s*=\s*)["'][^"']+["']/gi, `$1"***REDACTED***"`);
  out = out.replace(/(PASSWORD\s*=\s*)["'][^"']+["']/gi, `$1"***REDACTED***"`);
  out = out.replace(/(SECRET\s*=\s*)["'][^"']+["']/gi, `$1"***REDACTED***"`);
  out = out.replace(/(TOKEN\s*=\s*)["'][^"']+["']/gi, `$1"***REDACTED***"`);

  return out;
}

/* -------------------- PR-ready Markdown Export -------------------- */
function escapeMd(text) {
  return String(text || "").replaceAll("\r\n", "\n").replaceAll("\t", "  ");
}

function formatPRMarkdown({ review, derived, persona, algo, context, maskSecrets, secretHits }) {
  const r = review || { summary: "", risks: [], improvements: [], model: "" };

  const summary = (r.summary || "").trim() || "(summary missing/empty)";
  const score = derived?.score ?? 0;

  const checks =
    (derived?.checks || []).map((c) => `- **${c.name}**: \`${c.status}\` — ${escapeMd(c.details)}`).join("\n") || "- (no checks)";

  const top5 =
    (derived?.comments || [])
      .slice(0, 5)
      .map((c) => {
        const why = whyFlagged(c.severity);
        return `1. **${c.severity}** \`${c.file}:${c.line}\` — ${escapeMd(c.comment)}\n   - _Why flagged:_ ${escapeMd(why)}`;
      })
      .join("\n") || "";

  const improvements =
    (r.improvements || [])
      .slice(0, 12)
      .map((x) => `- ${escapeMd(x)}`)
      .join("\n") || "- (none)";

  const secretLine =
    secretHits?.length
      ? `\n> 🔒 Secrets detected: **${secretHits.join(", ")}**${maskSecrets ? " (masked in UI)" : ""}`
      : "";

  return `## DevSync PR-ready Review

**Risk score:** \`${score}\`  
**Reviewer persona:** \`${persona}\`  
**Diff algo:** \`${algo}\` (context: \`${context}\`)${secretLine}

---

### Summary
${escapeMd(summary)}

---

### Checks
${checks}

---

### Top 5 comments
${top5 || "- (no comments)"}

---

### Suggested improvements
${improvements}
`;
}

async function copyText(text, onOk) {
  try {
    await navigator.clipboard.writeText(text);
    onOk?.();
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    onOk?.();
  }
}

/* -------------------- Diff parsing + alignment -------------------- */
function parseGitDiff(diffText) {
  const lines = (diffText || "").replace(/\r\n/g, "\n").split("\n");

  const files = [];
  let current = null;
  let inHunk = false;

  const fileHeaderRegex = /^diff --git a\/(.+?) b\/(.+)$/;
  const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;

  for (const line of lines) {
    const mFile = line.match(fileHeaderRegex);
    if (mFile) {
      if (current) files.push(current);
      current = { oldPath: mFile[1], newPath: mFile[2], hunks: [] };
      inHunk = false;
      continue;
    }
    if (!current) continue;

    const mHunk = line.match(hunkRegex);
    if (mHunk) {
      const oldStart = Number(mHunk[1]);
      const newStart = Number(mHunk[3]);
      current.hunks.push({ header: line, oldLine: oldStart, newLine: newStart, lines: [] });
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;
    if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    let type = "ctx";
    let text = line;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      type = "add";
      text = line.slice(1);
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      type = "del";
      text = line.slice(1);
    } else if (line.startsWith(" ")) {
      type = "ctx";
      text = line.slice(1);
    } else if (line === "\\ No newline at end of file") {
      type = "meta";
      text = line;
    }

    current.hunks[current.hunks.length - 1].lines.push({ type, text });
  }

  if (current) files.push(current);
  return files;
}

function alignSideBySide(file) {
  const rows = [];
  for (const hunk of file.hunks) {
    rows.push({ kind: "hunk", header: hunk.header });

    let oldNo = hunk.oldLine;
    let newNo = hunk.newLine;

    let i = 0;
    while (i < hunk.lines.length) {
      const cur = hunk.lines[i];

      if (cur.type === "ctx") {
        rows.push({
          kind: "row",
          left: { no: oldNo++, text: cur.text, type: "ctx" },
          right: { no: newNo++, text: cur.text, type: "ctx" },
          pairType: "ctx",
        });
        i++;
        continue;
      }

      if (cur.type === "del") {
        const dels = [];
        while (i < hunk.lines.length && hunk.lines[i].type === "del") {
          dels.push(hunk.lines[i]);
          i++;
        }

        const adds = [];
        let j = i;
        while (j < hunk.lines.length && hunk.lines[j].type === "add") {
          adds.push(hunk.lines[j]);
          j++;
        }

        const max = Math.max(dels.length, adds.length);
        for (let k = 0; k < max; k++) {
          const d = dels[k];
          const a = adds[k];
          rows.push({
            kind: "row",
            left: d ? { no: oldNo++, text: d.text, type: "del" } : { no: null, text: "", type: "blank" },
            right: a ? { no: newNo++, text: a.text, type: "add" } : { no: null, text: "", type: "blank" },
            pairType: d && a ? "mod" : d ? "del" : "add",
          });
        }

        i = j;
        continue;
      }

      if (cur.type === "add") {
        rows.push({
          kind: "row",
          left: { no: null, text: "", type: "blank" },
          right: { no: newNo++, text: cur.text, type: "add" },
          pairType: "add",
        });
        i++;
        continue;
      }

      rows.push({
        kind: "row",
        left: { no: null, text: cur.text, type: "meta" },
        right: { no: null, text: cur.text, type: "meta" },
        pairType: "meta",
      });
      i++;
    }
  }
  return rows;
}

/* -------------------- UI components -------------------- */
function Badge({ tone = "neutral", children }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: "0.82rem",
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5e7eb",
    whiteSpace: "nowrap",
  };
  const tones = {
    danger: { background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.35)", color: "#fecaca" },
    warn: { background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.35)", color: "#fde68a" },
    ok: { background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.35)", color: "#bbf7d0" },
    info: { background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.35)", color: "#bfdbfe" },
  };
  return <span style={{ ...base, ...(tones[tone] || {}) }}>{children}</span>;
}

function Section({ title, right, children }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          background: "rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          fontWeight: 900,
          color: "#e5e7eb",
        }}
      >
        <div>{title}</div>
        {right ? right : null}
      </div>
      <div style={{ padding: "10px 12px", color: "#e5e7eb" }}>{children}</div>
    </div>
  );
}

/* -------------------- DiffTable -------------------- */
function DiffTable({ rows, side, maskSecrets, secretHits }) {
  const palette = {
    addBg: "rgba(34,197,94,0.18)",
    delBg: "rgba(239,68,68,0.18)",
    modBg: "rgba(59,130,246,0.18)",
    hunkBg: "rgba(148,163,184,0.18)",
    addBar: "#22c55e",
    delBar: "#ef4444",
    modBar: "#3b82f6",
  };

  const lineStyle = {
    display: "grid",
    gridTemplateColumns: "64px 1fr",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  };

  const gutterStyle = {
    textAlign: "right",
    padding: "4px 10px 4px 6px",
    color: "#cbd5e1",
    userSelect: "none",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    fontWeight: 800,
  };

  const codeStyle = {
    padding: "4px 10px",
    whiteSpace: "pre",
    overflowX: "auto",
    lineHeight: 1.35,
    color: "#e5e7eb",
  };

  return (
    <div>
      {rows.map((r, idx) => {
        if (r.kind === "hunk") {
          return (
            <div
              key={idx}
              style={{
                padding: "6px 10px",
                background: palette.hunkBg,
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                fontWeight: 900,
                color: "#e5e7eb",
              }}
            >
              {r.header}
            </div>
          );
        }

        const cell = side === "left" ? r.left : r.right;

        const isAdd = cell.type === "add";
        const isDel = cell.type === "del";
        const isMod = r.pairType === "mod";

        const bg = isAdd ? palette.addBg : isDel ? palette.delBg : isMod ? palette.modBg : "transparent";
        const bar = isAdd ? palette.addBar : isDel ? palette.delBar : isMod ? palette.modBar : "transparent";

        return (
          <div
            key={idx}
            style={{
              ...lineStyle,
              background: bg,
              borderLeft: `6px solid ${bar}`,
            }}
          >
            <div style={gutterStyle}>{cell.no ?? ""}</div>
            <div style={codeStyle}>{maskSecrets ? maskLineIfSecret(cell.text, secretHits) : cell.text}</div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- tiny UI helpers -------------------- */
function Pill({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(15,23,42,0.65)",
        color: "#e5e7eb",
        fontWeight: 900,
        whiteSpace: "nowrap",
        boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function toolbarBtn(wide = false) {
  return {
    padding: wide ? "8px 10px" : "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 8px 22px rgba(0,0,0,0.25)",
    backdropFilter: "blur(10px)",
  };
}

function runBtn(canRun) {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(59,130,246,0.55)",
    background: canRun ? "rgba(59,130,246,0.22)" : "rgba(148,163,184,0.20)",
    color: "#e5e7eb",
    fontWeight: 900,
    cursor: canRun ? "pointer" : "not-allowed",
    boxShadow: canRun ? "0 10px 26px rgba(59,130,246,0.25)" : "none",
    backdropFilter: "blur(10px)",
  };
}

/* -------------------- App -------------------- */
export default function App() {
  const [diff, setDiff] = useState("");
  const [review, setReview] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [lastStatus, setLastStatus] = useState(null);
  const [lastText, setLastText] = useState("");
  const [lastParsed, setLastParsed] = useState(null);

  // Reviewer removed from UI (kept internal for backend)
  const persona = "Senior Engineer";

  const [demoMode, setDemoMode] = useState(false);
  const [algo, setAlgo] = useState("Patience");
  const [context, setContext] = useState(3);
  const [fontSize, setFontSize] = useState(11);
  const [fileIndex, setFileIndex] = useState(0);

  // Feature #1 state
  const [maskSecrets, setMaskSecrets] = useState(true);
  const secretHits = useMemo(() => detectSecrets(diff), [diff]);

  // PR export toast
  const [exportToast, setExportToast] = useState("");

  // scroll sync
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const syncingRef = useRef(false);

  const personaHint = () => "Be technical, specific, and actionable like a senior reviewer.";

  const canRun = useMemo(() => !loading && diff.trim().length > 0, [loading, diff]);

  const clearDiffOnly = () => {
    setDiff("");
    setReview(null);
    setShowRaw(false);
    setError("");
    setLastStatus(null);
    setLastText("");
    setLastParsed(null);
    setFileIndex(0);
  };

  const runReview = async () => {
    setLoading(true);
    setError("");
    setReview(null);
    setShowRaw(false);

    setLastStatus(null);
    setLastText("");
    setLastParsed(null);

    try {
      const res = await fetch(`${API_BASE}/ai/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diff,
          persona,
          algo,
          context,
          instructions: personaHint(),
          demoMode,
        }),
      });

      setLastStatus(res.status);

      let data = null;
      let rawText = "";

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
        rawText = JSON.stringify(data, null, 2);
      } else {
        rawText = await res.text();
        const parsed = safeJsonParse(rawText);
        if (!parsed.ok) throw new Error("Backend returned NON-JSON.");
        data = parsed.value;
      }

      setLastText(rawText);
      setLastParsed(data);

      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setReview(normalizeReview(data));
    } catch (e) {
      setError(e?.message || "Failed to run review.");
    } finally {
      setLoading(false);
    }
  };

  const files = useMemo(() => parseGitDiff(diff), [diff]);
  const activeFile = files[fileIndex] || null;

  useEffect(() => {
    if (!files.length) setFileIndex(0);
    else if (fileIndex > files.length - 1) setFileIndex(files.length - 1);
  }, [files.length, fileIndex]);

  useEffect(() => {
    if (!demoMode) return;
    if (diff.trim().length === 0) setDiff(sampleDiff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  const rows = useMemo(() => {
    if (demoMode) return buildMyersRows(demoOldCode.trim(), demoNewCode.trim());
    if (!activeFile) return [];
    return alignSideBySide(activeFile);
  }, [demoMode, algo, activeFile]);

  useEffect(() => {
    const L = leftRef.current;
    const R = rightRef.current;
    if (!L || !R) return;

    const onScrollL = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      R.scrollTop = L.scrollTop;
      R.scrollLeft = L.scrollLeft;
      requestAnimationFrame(() => (syncingRef.current = false));
    };

    const onScrollR = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      L.scrollTop = R.scrollTop;
      L.scrollLeft = R.scrollLeft;
      requestAnimationFrame(() => (syncingRef.current = false));
    };

    L.addEventListener("scroll", onScrollL, { passive: true });
    R.addEventListener("scroll", onScrollR, { passive: true });

    return () => {
      L.removeEventListener("scroll", onScrollL);
      R.removeEventListener("scroll", onScrollR);
    };
  }, [rows.length, activeFile?.newPath]);

  const derived = useMemo(() => {
    const r = review || { summary: "", risks: [], improvements: [], model: "" };
    const score = scoreFromRisks(r.risks);
    const checks = checksFromReview(r.risks, r.improvements);
    const file = extractFileFromDiff(diff);

    const comments = (r.risks || []).map((risk, idx) => {
      const sev = riskSeverity(risk);
      return { file, line: 1 + idx, severity: sev, comment: risk };
    });

    return { score, checks, comments };
  }, [review, diff]);

  const exportPRMarkdown = async () => {
    if (!review) return;
    const md = formatPRMarkdown({ review, derived, persona, algo, context, maskSecrets, secretHits });
    await copyText(md, () => {
      setExportToast("✅ Markdown copied (paste into PR)");
      setTimeout(() => setExportToast(""), 1400);
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 18,
        background:
          "radial-gradient(1200px 700px at 15% 10%, rgba(59,130,246,0.18), transparent 60%), radial-gradient(900px 500px at 85% 15%, rgba(34,197,94,0.14), transparent 55%), radial-gradient(900px 600px at 55% 90%, rgba(239,68,68,0.12), transparent 60%), #050b1a",
      }}
    >
      <div style={{ maxWidth: 1480, margin: "0 auto" }}>
        {/* TOP BAR (icon-only circle) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={DEV_SYNC_LOGO}
              alt="DevSync"
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                objectFit: "cover",
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}
            />
            <div style={{ fontSize: "0.95rem", color: "#94a3b8", fontWeight: 700, lineHeight: 1.3 }}>
              DevSync - Your AI teammate before CI fails, powered by <b>Gemini 3</b>.
              {error && <span style={{ color: "#fecaca", fontWeight: 900 }}> &nbsp;⚠️ {error}</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Pill>Risk score: {derived.score}</Pill>
            <Pill>Model: {prettifyModel(review?.model || "-")}</Pill>
            {secretHits.length > 0 && <Pill>🔒 Secrets: {secretHits.join(", ")}</Pill>}
          </div>
        </div>

        {/* TOOLBAR */}
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
            padding: "10px 10px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            backdropFilter: "blur(12px)",
          }}
        >
          <select
            value={algo}
            onChange={(e) => setAlgo(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15,23,42,0.65)",
              color: "#e5e7eb",
              fontWeight: 800,
            }}
          >
            <option>Patience</option>
            <option>Myers</option>
            <option>Histogram</option>
          </select>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#e5e7eb", fontWeight: 800 }}>
            Context:
            <input
              type="number"
              min={0}
              max={20}
              value={context}
              onChange={(e) => setContext(clamp(Number(e.target.value || 0), 0, 20))}
              style={{
                width: 64,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                color: "#e5e7eb",
                fontWeight: 800,
              }}
            />
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#e5e7eb", fontWeight: 800 }}>
            Font Size:
            <input
              type="number"
              min={9}
              max={18}
              value={fontSize}
              onChange={(e) => setFontSize(clamp(Number(e.target.value || 11), 9, 18))}
              style={{
                width: 64,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(15,23,42,0.65)",
                color: "#e5e7eb",
                fontWeight: 800,
              }}
            />
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#e5e7eb", fontWeight: 900, marginLeft: 6 }}>
            <input type="checkbox" checked={maskSecrets} onChange={(e) => setMaskSecrets(e.target.checked)} />
            Mask secrets
          </label>

          <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.14)", marginInline: 6 }} />

          <button onClick={() => setFileIndex((i) => Math.max(0, i - 1))} disabled={fileIndex <= 0} style={toolbarBtn()}>
            ◀
          </button>
          <div style={{ fontWeight: 900, color: "#e5e7eb" }}>{files.length ? `${fileIndex + 1}/${files.length}` : "0/0"}</div>
          <button onClick={() => setFileIndex((i) => Math.min(files.length - 1, i + 1))} disabled={fileIndex >= files.length - 1} style={toolbarBtn()}>
            ▶
          </button>

          <div style={{ flex: 1 }} />

          <button onClick={() => setDiff(sampleDiff)} style={toolbarBtn(true)}>
            Load demo diff
          </button>

          <button onClick={clearDiffOnly} style={toolbarBtn(true)}>
            Clear diff
          </button>

          <button
            disabled={!review}
            onClick={exportPRMarkdown}
            style={{
              ...toolbarBtn(true),
              border: review ? "1px solid rgba(34,197,94,0.55)" : "1px solid rgba(255,255,255,0.14)",
              background: review ? "rgba(34,197,94,0.16)" : "rgba(148,163,184,0.20)",
              cursor: review ? "pointer" : "not-allowed",
            }}
          >
            🧾 Export review as Markdown
          </button>

          {exportToast && <Pill>{exportToast}</Pill>}

          <button disabled={!canRun} onClick={runReview} style={runBtn(canRun)}>
            {loading ? "Running…" : "Run Review"}
          </button>
        </div>

        {/* MAIN GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1.45fr 0.85fr", gap: 12, alignItems: "stretch" }}>
          {/* DIFF VIEWER */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: "74vh",
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", fontWeight: 900, color: "#e5e7eb" }}>
              {demoMode ? "demo/config.py (computed diff view)" : activeFile ? activeFile.newPath : "(paste a diff to view)"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 10px 1fr", gap: 0, padding: 10, flex: 1, minHeight: 0 }}>
              <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(15,23,42,0.55)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.12)", fontWeight: 900, color: "#e5e7eb" }}>
                  {demoMode ? "Old (computed)" : activeFile?.oldPath || "Old"}
                </div>
                <div
                  ref={leftRef}
                  className="diffPane"
                  style={{
                    overflow: "auto",
                    flex: 1,
                    minHeight: 0,
                    fontSize,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  <DiffTable side="left" rows={rows} maskSecrets={maskSecrets} secretHits={secretHits} />
                </div>
              </div>

              <div style={{ width: 10, background: "rgba(255,255,255,0.10)", borderRadius: 999 }} />

              <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(15,23,42,0.55)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.12)", fontWeight: 900, color: "#e5e7eb" }}>
                  {demoMode ? "New (computed)" : activeFile?.newPath || "New"}
                </div>
                <div
                  ref={rightRef}
                  className="diffPane"
                  style={{
                    overflow: "auto",
                    flex: 1,
                    minHeight: 0,
                    fontSize,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  <DiffTable side="right" rows={rows} maskSecrets={maskSecrets} secretHits={secretHits} />
                </div>
              </div>
            </div>

            {/* INPUT */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", padding: 10, background: "rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, color: "#e5e7eb" }}>
                <div style={{ fontWeight: 900 }}>Input Diff</div>
                <div style={{ fontWeight: 800, color: "#cbd5e1" }}>
                  Chars: <b>{diff.length}</b>
                </div>
              </div>
              <textarea
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
                placeholder="Paste a git diff here…"
                style={{
                  width: "100%",
                  height: 140,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  resize: "vertical",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  background: "rgba(15,23,42,0.65)",
                  color: "#e5e7eb",
                }}
              />
            </div>

            <style>{`
              .diffPane ::selection { background: rgba(59,130,246,0.55); color: #fff; }
            `}</style>
          </div>

          {/* REVIEW */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: "74vh",
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: "#e5e7eb" }}>
              <div style={{ fontWeight: 900 }}>Review</div>
              <button onClick={() => setShowRaw((v) => !v)} style={toolbarBtn(true)}>
                {showRaw ? "Hide JSON" : "Show JSON"}
              </button>
            </div>

            <div style={{ padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              {!review && !loading && (
                <div style={{ border: "1px dashed rgba(255,255,255,0.18)", borderRadius: 14, padding: 12, background: "rgba(15,23,42,0.55)", color: "#94a3b8", lineHeight: 1.5 }}>
                  <b style={{ color: "#e5e7eb" }}>No review yet.</b>
                  <div style={{ marginTop: 6 }}>
                    Paste a diff and click <b style={{ color: "#e5e7eb" }}>Run Review</b>.
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ border: "1px dashed rgba(255,255,255,0.18)", borderRadius: 14, padding: 12, background: "rgba(15,23,42,0.55)", color: "#94a3b8" }}>
                  ⏳ Running review…
                </div>
              )}

              {review && (
                <>
                  <Section title="Checks" right={<Badge tone={scoreTone(derived.score)}>{derived.score}</Badge>}>
                    {derived.checks.map((c, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                        <div>
                          <div style={{ fontWeight: 900, color: "#e5e7eb" }}>{c.name}</div>
                          <div style={{ color: "#94a3b8", marginTop: 2 }}>{c.details}</div>
                        </div>
                      </div>
                    ))}
                  </Section>

                  <Section title="Summary" right={<Badge tone={scoreTone(derived.score)}>{scoreTone(derived.score).toUpperCase()}</Badge>}>
                    {review.summary?.trim() ? review.summary : "(summary missing/empty)"}
                  </Section>

                  <Section title="Review comments" right={<Badge tone="info">{derived.comments.length}</Badge>}>
                    {derived.comments.length ? (
                      derived.comments.map((c, i) => (
                        <div key={i} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 10, marginBottom: 10, background: "rgba(15,23,42,0.55)" }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <Badge tone={c.severity === "HIGH" ? "danger" : c.severity === "MEDIUM" ? "warn" : "ok"}>{c.severity}</Badge>
                            <Badge>{c.file}</Badge>
                            <Badge>Line {c.line}</Badge>
                          </div>
                          <div style={{ marginTop: 8, lineHeight: 1.5, color: "#e5e7eb" }}>{c.comment}</div>
                          <div style={{ marginTop: 6, color: "#94a3b8", fontSize: "0.85rem", fontWeight: 800 }}>
                            Why Gemini flagged this: {whyFlagged(c.severity)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "#94a3b8" }}>(no comments)</div>
                    )}
                  </Section>

                  <Section title="Improvements" right={<Badge tone="info">{review.improvements.length}</Badge>}>
                    {review.improvements.length ? (
                      <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#e5e7eb" }}>
                        {review.improvements.map((it, idx) => (
                          <li key={idx} style={{ marginBottom: 6 }}>
                            {it}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "#94a3b8" }}>(none)</div>
                    )}
                  </Section>

                  {showRaw && (
                    <pre
                      style={{
                        background: "rgba(15,23,42,0.85)",
                        color: "#e5e7eb",
                        padding: 12,
                        borderRadius: 14,
                        fontSize: "0.85rem",
                        whiteSpace: "pre-wrap",
                        overflowX: "auto",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      {JSON.stringify(review, null, 2)}
                    </pre>
                  )}

                  <Section title="Last response (debug)">
                    <pre
                      style={{
                        background: "rgba(15,23,42,0.85)",
                        color: "#e5e7eb",
                        padding: 12,
                        borderRadius: 14,
                        fontSize: "0.85rem",
                        whiteSpace: "pre-wrap",
                        overflowX: "auto",
                        border: "1px solid rgba(255,255,255,0.10)",
                        margin: 0,
                      }}
                    >{`HTTP: ${lastStatus ?? "—"}
Parsed JSON: ${lastParsed ? "yes" : "no"}

RAW:
${lastText || "(none yet)"}
`}</pre>
                  </Section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}