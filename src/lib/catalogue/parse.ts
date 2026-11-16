/**
 * Parser for "Complete Robotics Components Master List.md".
 * Pure function — used by the import script, the completeness tests and the in-app
 * completeness validator (which can also parse a freshly uploaded copy of the list).
 */

export interface ParsedEntry {
  sectionNumber: number;
  sectionTitle: string;
  subcategory: string | null;
  itemNumber: number;
  name: string;
  line: number;
}

export interface ParsedCompetitionRow {
  category: string;
  race: string;
  line: string;
  sumo: string;
  lineNo: number;
}

export interface ParsedMasterList {
  sections: { number: number; title: string; line: number; entryCount: number }[];
  entries: ParsedEntry[];
  competitionTable: ParsedCompetitionRow[];
  warnings: string[];
}

const SECTION_RE = /^##\s+\*{0,2}\s*(\d+)\.\s+(.+?)\s*\*{0,2}\s*$/;
const SUBCAT_RE = /^\*\*(.+?)\*\*\s*$/;
const ITEM_RE = /^(\d+)\.\s+(.+?)\s*$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;

export function parseMasterList(markdown: string): ParsedMasterList {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections: ParsedMasterList["sections"] = [];
  const entries: ParsedEntry[] = [];
  const competitionTable: ParsedCompetitionRow[] = [];
  const warnings: string[] = [];

  let section: { number: number; title: string } | null = null;
  let subcategory: string | null = null;

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line) return;

    const sm = SECTION_RE.exec(line);
    if (sm) {
      section = { number: Number(sm[1]), title: sm[2].replace(/\*+/g, "").trim() };
      subcategory = null;
      sections.push({ number: section.number, title: section.title, line: lineNo, entryCount: 0 });
      return;
    }
    if (!section) return; // preamble (e.g. the list of three competitions) is not catalogue content

    const sub = SUBCAT_RE.exec(line);
    if (sub && !line.startsWith("**A note")) {
      const text = sub[1].trim();
      // Bold paragraph text that is not a sub-heading ends with punctuation; sub-headings are short labels.
      if (!/[.:]$/.test(text) && text.length < 60) {
        subcategory = text.charAt(0).toUpperCase() + text.slice(1);
      }
      return;
    }

    const tr = TABLE_ROW_RE.exec(line);
    if (tr) {
      const cells = tr[1].split("|").map((c) => c.trim());
      if (cells.length >= 4 && !/^-+$/.test(cells[0].replace(/\s/g, "")) && cells[0] !== "Component category") {
        if (!/^[-\s]+$/.test(cells[1])) {
          competitionTable.push({ category: cells[0], race: cells[1], line: cells[2], sumo: cells[3], lineNo });
        }
      }
      return;
    }

    const im = ITEM_RE.exec(line);
    if (im) {
      const name = im[2].replace(/\*+/g, "").trim();
      entries.push({
        sectionNumber: section.number,
        sectionTitle: section.title,
        subcategory,
        itemNumber: Number(im[1]),
        name,
        line: lineNo,
      });
      const s = sections[sections.length - 1];
      s.entryCount++;
    }
  });

  // Sanity: numbering inside each section should be strictly increasing by 1.
  for (const s of sections) {
    const list = entries.filter((e) => e.sectionNumber === s.number);
    list.forEach((e, i) => {
      if (e.itemNumber !== i + 1) warnings.push(`Section ${s.number}: item "${e.name}" is numbered ${e.itemNumber}, expected ${i + 1}`);
    });
  }

  return { sections, entries, competitionTable, warnings };
}

/** Lower-case, alphanumeric-and-dash slug. "Arduino Uno R3" -> "arduino-uno-r3", "4 × AA Battery Pack" -> "4x-aa-battery-pack". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/Ω/g, "ohm")
    .replace(/µ/g, "u")
    .replace(/\+/g, "-plus")
    .replace(/\(.*?\)/g, "") // drop parenthetical notes like "(RP2040 microcontroller board, not an SBC)"
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.(?=\D)|(?<=\D)\./g, "-") // keep dots between digits (0.96, 2.5) only
    .replace(/\./g, "_")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Normalised name used to detect the same component listed in more than one section. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\bmodule\b|\bdiode\b|\bdisplay\b/g, "")
    .replace(/s\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
