/**
 * markdown.js — block parser and layout/draw engine for the compositor.
 *
 * The paginator stacks typed blocks (paragraph, heading, list, table, quote,
 * code, diagram) instead of flat text lines, so structure survives into the
 * rendered page. Plain prose still flows through the same sentence-aware
 * pagination, so untagged text behaves exactly as before.
 *
 * Diagrams: ```mermaid fences are rendered by Mermaid, which is loaded lazily
 * from vendor/ only when a diagram is actually present. If it cannot load, the
 * source falls back to a monospace code block rather than failing the render.
 */

/* ---------- Grammar ---------- */
/* `---` / `***` / `___` are horizontal rules, as in standard markdown.
   A page break is the explicit `<!-- break -->`. */
const MD_PAGEBREAK = /^\s*<!--\s*(?:page)?break\s*-->\s*$/i;
const MD_RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const MD_HEADING = /^(#{1,6})\s+(\S.*?)\s*#*\s*$/;
const MD_FENCE = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
const MD_QUOTE = /^>\s?(.*)$/;
const MD_TASK = /^\[([ xX])\]\s+(.*)$/;
const MD_BULLET = /^(\s*)([-*+])\s+(\S.*)$/;
const MD_ORDERED = /^(\s*)(\d{1,3})[.)]\s+(\S.*)$/;
const MD_IMAGE = /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)\s*$/;
const MD_TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const MD_TABLE_SPLIT = /\|/;

/* ---------- Inline ---------- */

/**
 * Flatten inline markdown into styled runs.
 * Styles: bold, italic, code, strike.
 */
function parseInline(text) {
    const runs = [];
    let buf = '';
    const flush = (style) => {
        if (buf) {
            runs.push(Object.assign({ text: buf }, style));
            buf = '';
        }
    };
    const merge = (inner, extra) => inner.map((r) => Object.assign({}, r, extra));

    let i = 0;
    while (i < text.length) {
        if (text[i] === '\\' && i + 1 < text.length) {
            buf += text[i + 1];
            i += 2;
            continue;
        }
        const rest = text.slice(i);
        let m;

        if ((m = /^(`+)([^]*?)\1/.exec(rest))) {
            flush({});
            runs.push({ text: m[2].trim(), code: true });
            i += m[0].length;
            continue;
        }
        if ((m = /^(\*\*|__)(\S[^]*?)\1/.exec(rest))) {
            flush({});
            runs.push(...merge(parseInline(m[2]), { bold: true }));
            i += m[0].length;
            continue;
        }
        if ((m = /^(\*|_)(\S[^]*?)\1/.exec(rest)) && !/^\s/.test(m[2][0] || ' ')) {
            flush({});
            runs.push(...merge(parseInline(m[2]), { italic: true }));
            i += m[0].length;
            continue;
        }
        if ((m = /^~~(\S[^]*?)~~/.exec(rest))) {
            flush({});
            runs.push(...merge(parseInline(m[1]), { strike: true }));
            i += m[0].length;
            continue;
        }
        if ((m = /^\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/.exec(rest))) {
            flush({});
            runs.push(...parseInline(m[1] || m[2]));
            i += m[0].length;
            continue;
        }
        if ((m = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest))) {
            flush({});
            runs.push({ text: m[1], code: true });
            i += m[0].length;
            continue;
        }
        buf += text[i];
        i += 1;
    }
    flush({});
    return runs.length ? runs : [{ text: '', plain: true }];
}

/** Split runs into wrappable tokens, each carrying its leading space width. */
function tokenize(runs) {
    const words = [];
    runs.forEach((run) => {
        if (run.br) { words.push({ br: true }); return; }
        const parts = run.text.split(/(\s+)/);
        parts.forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
                if (words.length && !words[words.length - 1].br) words[words.length - 1].space = true;
            } else {
                words.push({ text: part, style: run });
            }
        });
    });
    return words;
}

/* ---------- Block parser ---------- */

function splitTableRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(MD_TABLE_SPLIT).map((c) => c.trim());
}

function parseMarkdown(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i += 1; continue; }

        if (MD_PAGEBREAK.test(line)) { blocks.push({ type: 'pagebreak' }); i += 1; continue; }
        if (MD_RULE.test(line)) { blocks.push({ type: 'rule' }); i += 1; continue; }

        let m;
        m = MD_IMAGE.exec(line.trim());
        if (m) {
            // A remote image cannot be fetched from a local page, so the alt text
            // is set as a figure caption rather than leaking the URL.
            blocks.push({ type: 'figure', alt: m[1] || m[2] });
            i += 1;
            continue;
        }

        // Fenced code / diagram
        m = MD_FENCE.exec(line);
        if (m) {
            const marker = m[1][0];
            const lang = (m[2] || '').toLowerCase();
            const body = [];
            i += 1;
            while (i < lines.length && !new RegExp(`^\\s*${marker}{${m[1].length},}\\s*$`).test(lines[i])) {
                body.push(lines[i]);
                i += 1;
            }
            i += 1;
            const source = body.join('\n');
            if (lang === 'mermaid' || lang === 'mmd') {
                blocks.push({ type: 'diagram', code: source });
            } else {
                blocks.push({ type: 'code', lang, text: source });
            }
            continue;
        }

        m = MD_HEADING.exec(line);
        if (m) {
            blocks.push({ type: 'heading', level: m[1].length, runs: parseInline(m[2].trim()) });
            i += 1;
            continue;
        }

        if (MD_QUOTE.test(line)) {
            const body = [];
            while (i < lines.length && (MD_QUOTE.test(lines[i]) || (body.length && lines[i].trim() && !MD_PAGEBREAK.test(lines[i])))) {
                const q = MD_QUOTE.exec(lines[i]);
                body.push(q ? q[1] : lines[i]);
                i += 1;
            }
            blocks.push({ type: 'quote', blocks: parseMarkdown(body.join('\n')) });
            continue;
        }

        // Table: header row followed by a delimiter row
        if (line.includes('|') && i + 1 < lines.length && MD_TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
            const header = splitTableRow(line).map(parseInline);
            const align = splitTableRow(lines[i + 1]).map((c) => {
                const left = c.startsWith(':');
                const right = c.endsWith(':');
                if (left && right) return 'center';
                if (right) return 'right';
                return 'left';
            });
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
                const cells = splitTableRow(lines[i]);
                while (cells.length < header.length) cells.push('');
                rows.push(cells.slice(0, header.length).map(parseInline));
                i += 1;
            }
            blocks.push({ type: 'table', header, align, rows });
            continue;
        }

        // Lists
        if (MD_BULLET.test(line) || MD_ORDERED.test(line)) {
            const ordered = MD_ORDERED.test(line);
            const re = ordered ? MD_ORDERED : MD_BULLET;
            const first = re.exec(line);
            const items = [];
            let start = ordered ? parseInt(first[2], 10) : 1;
            while (i < lines.length) {
                const im = re.exec(lines[i]);
                if (!im) {
                    // A blank line between items does not end the list, which is
                    // how CommonMark reads it and how people actually write long
                    // numbered items. Look past the blanks for another item of
                    // the same kind before giving up.
                    if (!lines[i].trim()) {
                        let j = i;
                        while (j < lines.length && !lines[j].trim()) j += 1;
                        if (j < lines.length && re.test(lines[j])) { i = j; continue; }
                        break;
                    }
                    // Lazy continuation line folds into the previous item
                    if (items.length && lines[i].trim() && !MD_HEADING.test(lines[i]) &&
                        !MD_BULLET.test(lines[i]) && !MD_ORDERED.test(lines[i]) &&
                        !MD_PAGEBREAK.test(lines[i]) && !MD_RULE.test(lines[i])) {
                        const last = items[items.length - 1];
                        last.runs.push({ text: ' ' }, { text: lines[i].trim() });
                        i += 1;
                        continue;
                    }
                    break;
                }
                // Task list item: "- [x] done" / "- [ ] pending"
                let marker = ordered ? `${im[2]}.` : '';
                let checked = null;
                let content = im[3];
                if (!ordered) {
                    const task = MD_TASK.exec(content);
                    if (task) { checked = task[1].toLowerCase() === 'x'; content = task[2]; }
                }
                items.push({
                    indent: Math.min(3, Math.floor(im[1].replace(/\t/g, '  ').length / 2)),
                    marker,
                    checked,
                    runs: parseInline(content)
                });
                i += 1;
            }
            blocks.push({ type: 'list', ordered, start, items });
            continue;
        }

        // Paragraph: run until a blank line or the start of another block
        const body = [];
        while (i < lines.length && lines[i].trim() &&
            !MD_PAGEBREAK.test(lines[i]) && !MD_RULE.test(lines[i]) && !MD_IMAGE.test(lines[i].trim()) &&
            !MD_HEADING.test(lines[i]) && !MD_FENCE.test(lines[i]) &&
            !MD_QUOTE.test(lines[i]) && !MD_BULLET.test(lines[i]) && !MD_ORDERED.test(lines[i]) &&
            !(lines[i].includes('|') && i + 1 < lines.length && MD_TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-'))) {
            body.push(lines[i]);
            i += 1;
        }
        if (body.length) {
            // Two trailing spaces (or a trailing backslash) is a hard break.
            const runs = [];
            body.forEach((raw, k) => {
                const hard = /\s{2,}$/.test(raw) || /\\$/.test(raw);
                const line = raw.replace(/(\s{2,}|\\)$/, '').trim();
                if (line) runs.push(...parseInline(line));
                if (hard && k < body.length - 1) runs.push({ text: '\n', br: true });
            });
            blocks.push({ type: 'para', runs: runs.length ? runs : [{ text: '' }] });
        } else i += 1;
    }

    return blocks;
}

/* ---------- Mermaid (lazy) ---------- */

let mermaidLoad = null;

function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (mermaidLoad) return mermaidLoad;
    mermaidLoad = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = 'vendor/mermaid-11.min.js';
        el.async = true;
        el.onload = () => {
            if (!window.mermaid) { mermaidLoad = null; reject(new Error('mermaid missing')); return; }
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                theme: 'neutral',
                htmlLabels: false,
                flowchart: { htmlLabels: false },
                sequence: { useMaxWidth: true },
                fontFamily: 'Archivo, system-ui, sans-serif'
            });
            resolve(window.mermaid);
        };
        el.onerror = () => { mermaidLoad = null; reject(new Error('mermaid failed to load')); };
        document.head.appendChild(el);
    });
    return mermaidLoad;
}

let diagramSeq = 0;

async function rasteriseSvg(svg, width) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.documentElement;
    const vb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const ratio = vb.length === 4 && vb[2] && vb[3] ? vb[2] / vb[3] : 1;
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    el.setAttribute('width', String(Math.round(width)));
    el.setAttribute('height', String(Math.round(width * ratio)));
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('svg could not be rasterised'));
        img.src = src;
    });
}

async function renderDiagram(block, width) {
    const mermaid = await loadMermaid();
    diagramSeq += 1;
    const { svg } = await mermaid.render(`md-diagram-${diagramSeq}`, block.code);
    const img = await rasteriseSvg(svg, width);
    block.type = 'diagram-img';
    block.img = img;
    block.aspect = img.height / img.width;
    return block;
}

/**
 * Resolve every diagram block into a raster before pagination, because page
 * heights must be known synchronously. Failures degrade to a code block.
 */
async function prepareDiagrams(blocks, width, onError) {
    const jobs = [];
    const visit = (list) => {
        list.forEach((b) => {
            if (b.type === 'diagram') jobs.push(b);
            else if (b.type === 'quote') visit(b.blocks);
        });
    };
    visit(blocks);
    if (!jobs.length) return blocks;

    await Promise.all(jobs.map(async (b) => {
        try {
            await renderDiagram(b, width);
        } catch (err) {
            b.type = 'code';
            b.lang = 'mermaid';
            b.text = b.code;
            if (onError) onError(err);
        }
    }));
    return blocks;
}

/* ---------- Engine ---------- */

const MARK_ZERO_WIDTH = /[\p{M}\u200C\u200D]/u;

class MdEngine {
    constructor(gen) {
        this.gen = gen;
        this._font = '';
    }

    get ctx() { return this.gen.ctx; }
    get s() { return this.gen.settings; }
    get theme() { return this.gen.theme(); }

    useFont(font) {
        if (this._font !== font) {
            this.ctx.font = font;
            this._font = font;
        }
    }

    measure(text, font) {
        this.useFont(font);
        return this.ctx.measureText(text).width;
    }

    /* --- fonts --- */
    bodyFont() { return this.gen.bodyFontString(); }
    boldFont() { return this.gen.boldFontString(this.s.fontSize); }
    headingFont(level) {
        const base = this.s.fontSize;
        const scale = [1.55, 1.3, 1.14, 1.0, 0.93, 0.87][level - 1] || 0.87;
        const size = Math.round(clamp(base * scale, 13, 54));
        return { size, font: this.gen.boldFontString(size) };
    }
    codeFont(size) {
        const px = size || Math.round(clamp(this.s.fontSize * 0.86, 11, 30));
        return { size: px, font: `${px}px "JetBrains Mono", ui-monospace, monospace` };
    }
    codeBoldFont(size) { return `${size}px "JetBrains Mono", ui-monospace, monospace`; }

    /** Font for an inline run. */
    runFont(style, baseSize) {
        const size = baseSize || this.s.fontSize;
        if (style.code) {
            const px = Math.round(size * 0.88);
            return `${px}px "JetBrains Mono", ui-monospace, monospace`;
        }
        if (style.bold) return this.gen.boldFontString(size);
        return `${size}px "${this.s.fontFamily}", serif`;
    }

    /* --- wrapping --- */

    /** Word-wrap styled runs. widthAt(lineIndex) lets a drop cap narrow early lines. */
    wrapRuns(runs, widthAt, baseSize) {
        const words = tokenize(runs);
        const lines = [];
        let line = [];
        let lineW = 0;

        const flushLine = () => {
            while (line.length && !line[line.length - 1].text) line.pop();
            lines.push(line);
            line = [];
            lineW = 0;
        };

        for (let k = 0; k < words.length; k += 1) {
            const word = words[k];

            // A hard line break (two trailing spaces) starts a new line.
            if (word.br) {
                if (line.length) flushLine();
                continue;
            }

            const font = this.runFont(word.style, baseSize);
            const w = this.measure(word.text, font);
            const gap = k > 0 && words[k - 1].space && line.length ? this.measure(' ', font) : 0;
            const avail = widthAt(lines.length);

            if (line.length && lineW + gap + w > avail) {
                flushLine();
            }
            const g = line.length ? gap : 0;
            line.push({ text: word.text, font, w, gap: g, style: word.style });
            lineW += g + w;

            // A single token wider than the column: break it on a safe boundary.
            let guard = 0;
            while (lineW > widthAt(lines.length) && guard < 120) {
                guard += 1;
                const last = line[line.length - 1];
                const budget = widthAt(lines.length) - (lineW - last.w - last.gap) - last.gap;
                const cut = this.safeCut(last.text, budget, (t) => this.measure(t, last.font));
                if (cut <= 0) break;
                lines.push([last]);
                last.text = last.text.slice(cut);
                last.w = this.measure(last.text, last.font);
                last.gap = 0;
                line = [last];
                lineW = last.w;
            }
        }
        if (line.length) flushLine();
        return lines.filter((l, i) => l.length || i === 0);
    }

    safeCut(text, maxWidth, measure) {
        const limit = Math.max(8, maxWidth);
        let cut = text.length;
        while (cut > 1 && measure(text.slice(0, cut)) > limit) cut -= 1;
        if (cut >= text.length) return 0;
        if (cut > 1) {
            const c = text.charCodeAt(cut - 1);
            if (c >= 0xdc00 && c <= 0xdfff) cut -= 1;
        }
        while (cut > 1 && MARK_ZERO_WIDTH.test(text[cut - 1])) cut -= 1;
        while (cut < text.length && MARK_ZERO_WIDTH.test(text[cut])) cut += 1;
        return Math.max(1, cut);
    }

    /* --- measurement --- */

    /**
     * Height of a block at the given width.
     * `cap` is an optional drop-cap descriptor applied to the first lines.
     */
    measureBlock(block, width, cap) {
        switch (block.type) {
            case 'para': return this.measurePara(block, width, cap);
            case 'heading': return this.measureHeading(block, width);
            case 'list': return this.measureList(block, width);
            case 'quote': return this.measureQuote(block, width);
            case 'table': return this.measureTable(block, width);
            case 'code': return this.measureCode(block, width);
            case 'diagram-img': return this.measureDiagram(block, width);
            case 'rule': return { height: Math.round(this.s.fontSize * 1.2) };
            case 'figure': return this.measureFigure(block, width);
            case 'spacer': return { height: Math.round(this.s.fontSize * this.s.lineHeight * 0.6) };
            default: return { height: 0 };
        }
    }

    measurePara(block, width, cap) {
        const lineH = this.s.fontSize * this.s.lineHeight;
        const widthAt = cap
            ? (i) => Math.max(60, width - (i < cap.lines ? cap.width : 0))
            : () => width;
        const lines = this.wrapRuns(block.runs, widthAt);
        return { height: lines.length * lineH, lines, lineH };
    }

    measureHeading(block, width) {
        const { size, font } = this.headingFont(block.level);
        const lineH = Math.round(size * 1.28);
        const lines = this.wrapRuns(block.runs, () => width, size);
        const spaceBefore = block.level <= 2 ? Math.round(this.s.fontSize * 0.9) : Math.round(this.s.fontSize * 0.6);
        const spaceAfter = Math.round(this.s.fontSize * 0.34);
        return { height: spaceBefore + lines.length * lineH + spaceAfter, lines, lineH, size, font, spaceBefore, spaceAfter };
    }

    listGeometry(block) {
        const lineH = this.s.fontSize * this.s.lineHeight;
        const markerGap = Math.round(this.s.fontSize * 0.62);
        const step = Math.round(this.s.fontSize * 0.5);
        return { lineH, markerGap, step, indent: block.indent || 0 };
    }

    measureList(block, width) {
        const { lineH, markerGap, step, indent } = this.listGeometry(block);
        let height = 0;
        let maxMarker = 0;
        const items = Array.isArray(block.items) ? block.items : [];
        const laid = items.map((item, n) => {
            const x = indent * step + markerGap;
            const avail = Math.max(80, width - x);
            // A split item carries an explicit label: its number on the first
            // part, '' on the continuation, so a part never renumbers the list.
            let marker;
            if (item.label !== undefined) marker = item.label;
            else if (item.checked !== null && item.checked !== undefined) marker = '';
            else marker = block.ordered ? `${block.start + n}.` : '';
            maxMarker = Math.max(maxMarker, this.measure(marker, this.bodyFont()));
            const lines = this.wrapRuns(item.runs, () => avail);
            const h = lines.length * lineH;
            height += h + (n < items.length - 1 ? Math.round(lineH * 0.3) : 0);
            return { lines, indent, marker, checked: item.checked, height: h };
        });
        height += Math.round(this.s.fontSize * 0.2);
        return { height, lineH, markerGap, step, maxMarker, laid };
    }

    measureQuote(block, width) {
        const inset = Math.round(this.s.fontSize * 1.15);
        const inner = Math.max(90, width - inset - Math.round(this.s.fontSize * 0.6));
        const pad = Math.round(this.s.fontSize * 0.5);
        let height = pad;
        const laid = block.blocks.map((b) => {
            const m = this.measureBlock(b, inner, null);
            height += m.height;
            return { block: b, measure: m, height: m.height };
        });
        height += pad;
        return { height, inset, inner, pad, laid, lineH: this.s.fontSize * this.s.lineHeight };
    }

    tableGeometry(block, width) {
        const { font, size } = this.codeFont();
        const headFont = this.gen.boldFontString(size);
        const cellPadX = Math.round(this.s.fontSize * 0.5);
        const cellPadY = Math.round(this.s.fontSize * 0.3);
        const lineH = Math.round(size * 1.5);
        const cols = block.header.length;
        const grid = Math.max(2, Math.min(6, cols));
        return { font, headFont, size, cellPadX, cellPadY, lineH, cols, grid };
    }

    measureTable(block, width) {
        const { font, headFont, size, cellPadX, cellPadY, lineH, cols } = this.tableGeometry(block, width);
        const from = block.rowFrom || 0;
        const to = block.rowCount === undefined
            ? block.rows.length
            : Math.min(block.rows.length, from + block.rowCount);
        const body = block.rows.slice(from, to);
        const all = [block.header].concat(body);

        // Natural widths, then shrink proportionally to fit the column.
        const natural = [];
        for (let c = 0; c < cols; c += 1) {
            let w = 0;
            all.forEach((row, ri) => {
                const cell = row[c] || [{ text: '' }];
                w = Math.max(w, this.measure(cell.map((r) => r.text).join(''), ri === 0 ? headFont : font));
            });
            natural.push(Math.max(w + cellPadX * 2, size * 3.2));
        }
        const totalPad = cellPadX * 2 * cols;
        let widths = natural.slice();
        const overflow = natural.reduce((a, b) => a + b, 0) + totalPad - width;
        if (overflow > 0) {
            const scale = (natural.reduce((a, b) => a + b, 0) + totalPad - overflow) / natural.reduce((a, b) => a + b, 0);
            widths = natural.map((w) => Math.max(size * 2.4, w * scale));
            const still = widths.reduce((a, b) => a + b, 0) + totalPad;
            if (still > width) {
                const k = (still - totalPad) / widths.reduce((a, b) => a + b, 0);
                widths = widths.map((w) => w * k);
            }
        }

        const layoutRow = (cells, isHead) => {
            const laid = [];
            let maxLines = 1;
            for (let c = 0; c < cols; c += 1) {
                const runs = cells[c] || [{ text: '' }];
                const avail = Math.max(size * 2, widths[c] - cellPadX * 2);
                const lines = this.wrapRuns(runs, () => avail, size);
                maxLines = Math.max(maxLines, lines.length);
                laid.push(lines);
            }
            return { cells: laid, height: maxLines * lineH + cellPadY * 2 };
        };

        // The header repeats on every continuation so each page stands alone.
        const head = layoutRow(block.header, true);
        const rows = body.map((r) => layoutRow(r, false));
        const rule = Math.max(1, Math.round(this.s.fontSize / 14));
        const height = head.height + rows.reduce((a, r) => a + r.height, 0) + rule * 2;

        return {
            height, widths, head, body: rows, lineH, cellPadX, cellPadY, rule,
            headFont, font, size, rowFrom: from, rowTo: to, rowCount: to - from
        };
    }

    measureCode(block, width) {
        const { size, font } = this.codeFont();
        const lineH = Math.round(size * 1.45);
        const padX = Math.round(size * 0.8);
        const padY = Math.round(size * 0.6);
        const avail = Math.max(80, width - padX * 2);
        // Code does not reflow — it is hard-wrapped so columns stay legible.
        const lines = [];
        String(block.text).split('\n').forEach((raw) => {
            if (!raw) { lines.push([]); return; }
            let rest = raw;
            let guard = 0;
            while (this.measure(rest, font) > avail && guard < 200) {
                guard += 1;
                const cut = this.safeCut(rest, avail, (t) => this.measure(t, font));
                if (cut <= 0) break;
                lines.push([{ text: rest.slice(0, cut), font, w: this.measure(rest.slice(0, cut), font), gap: 0 }]);
                rest = rest.slice(cut);
            }
            lines.push(rest ? [{ text: rest, font, w: this.measure(rest, font), gap: 0 }] : []);
        });
        return { height: lines.length * lineH + padY * 2, lines, lineH, padX, padY, font, size, lang: block.lang };
    }

    measureDiagram(block, width) {
        const caption = block.title ? Math.round(this.s.fontSize * 1.4) : 0;
        const w = Math.min(width, Math.max(160, width * 0.94));
        const h = Math.round(w * (block.aspect || 0.6));
        return { height: h + caption, imgW: w, imgH: h, caption: block.title, captionH: caption };
    }

    /** A linked image renders as its caption, centred between two short rules. */
    measureFigure(block, width) {
        const size = Math.round(clamp(this.s.fontSize * 0.92, 13, 34));
        const inner = Math.max(120, width * 0.76);
        const lines = this.wrapRuns([{ text: block.alt }], () => inner, size);
        const lineH = Math.round(size * 1.5);
        const ruleGap = Math.round(this.s.fontSize * 0.5);
        return {
            height: lines.length * lineH + ruleGap * 2 + Math.round(this.s.fontSize * 0.7),
            lines, lineH, ruleGap, size, inner
        };
    }

    /* --- drawing --- */

    drawBlock(block, x, y, width, m, cap) {
        const ctx = this.ctx;

        switch (block.type) {
            case 'para': return this.drawPara(block, x, y, width, m, cap);
            case 'heading': return this.drawHeading(block, x, y, width, m);
            case 'list': return this.drawList(block, x, y, width, m);
            case 'quote': return this.drawQuote(block, x, y, width, m);
            case 'table': return this.drawTable(block, x, y, width, m);
            case 'code': return this.drawCode(block, x, y, width, m);
            case 'diagram-img': return this.drawDiagram(block, x, y, width, m);
            case 'figure': return this.drawFigure(block, x, y, width, m);
            case 'rule': {
                ctx.save();
                const cy = y + m.height / 2;
                ctx.strokeStyle = this.gen.accent('ruleAlpha');
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + width * 0.22, cy);
                ctx.lineTo(x + width * 0.78, cy);
                ctx.stroke();
                ctx.restore();
                return m.height;
            }
            default: return 0;
        }
    }

    drawLine(line, x, y, opts) {
        const ctx = this.ctx;
        const o = opts || {};
        // Guard: a nested array here means a caller passed lines instead of a
        // line. Skip it rather than painting "undefined" on the page.
        const segs = (Array.isArray(line) && line.length && Array.isArray(line[0]))
            ? line[0]
            : line;
        if (!segs || !segs.length) { if (o.after) o.after(x, y); return; }
        this.useFont(segs[0].font || this.bodyFont());
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        if (o.color) ctx.fillStyle = o.color;
        const strikeAll = !!o.strike;

        if (o.justify && segs.length > 1) {
            const glyphs = segs.reduce((sum, seg) => sum + seg.w, 0);
            const gaps = segs.slice(1).reduce((sum, seg) => sum + seg.gap, 0);
            const slack = o.width - glyphs;
            const gapCount = segs.length - 1;
            const minGap = gaps / Math.max(1, gapCount);
            if (slack > 0 && minGap > 0 && slack / gapCount >= minGap) {
                const extra = slack / gapCount;
                let cx = x;
                segs.forEach((seg, i) => {
                    if (i > 0) cx += seg.gap + extra;
                    ctx.font = seg.font;
                    ctx.fillText(seg.text, cx, y);
                    cx += seg.w;
                });
                if (o.after) o.after(x, y);
                return;
            }
        }

        let cx = x;
        segs.forEach((seg, i) => {
            if (i > 0) cx += seg.gap;
            ctx.font = seg.font;
            ctx.fillText(seg.text, cx, y);
            if ((seg.style && seg.style.strike) || strikeAll) {
                const prev = ctx.strokeStyle;
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = Math.max(1, this.s.fontSize / 15);
                ctx.beginPath();
                ctx.moveTo(cx, y + this.s.fontSize * 0.55);
                ctx.lineTo(cx + seg.w, y + this.s.fontSize * 0.55);
                ctx.stroke();
                ctx.strokeStyle = prev;
            }
            cx += seg.w;
        });
        if (o.after) o.after(x, y);
    }

    drawPara(block, x, y, width, m, cap) {
        const ctx = this.ctx;
        const align = this.s.textAlign;
        ctx.fillStyle = this.theme.text;
        const justify = align === 'justify';

        if (cap && cap.char) this.gen.drawDropCap(cap.char, x, y);

        let cy = y;
        m.lines.forEach((line, i) => {
            const indent = cap && i < cap.lines ? cap.width : 0;
            const avail = width - indent;
            if (!line.length) { cy += m.lineH; return; }
            const lw = line.reduce((s, seg) => s + seg.gap + seg.w, 0);
            const isLast = i === m.lines.length - 1;
            if (align === 'center') {
                this.drawLine(line, x + indent + (avail - lw) / 2, cy);
            } else if (justify && !isLast) {
                this.drawLine(line, x + indent, cy, { justify: true, width: avail });
            } else {
                this.drawLine(line, x + indent, cy);
            }
            cy += m.lineH;
        });
        return cy - y;
    }

    drawHeading(block, x, y, width, m) {
        const ctx = this.ctx;
        const cy = y + m.spaceBefore;
        ctx.fillStyle = this.theme.text;
        // m.lines is a list of lines; drawLine expects one line of segments.
        m.lines.forEach((line, i) => this.drawLine(line, x, cy + i * m.lineH));
        if (block.level <= 2) {
            const cy2 = cy + m.lines.length * m.lineH + Math.round(m.spaceAfter * 0.55);
            ctx.save();
            ctx.strokeStyle = this.gen.accent('ruleAlpha');
            ctx.lineWidth = Math.max(1, Math.round(this.s.fontSize / 16));
            const w = Math.min(width * 0.34, 120);
            ctx.beginPath();
            ctx.moveTo(x, cy2);
            ctx.lineTo(x + w, cy2);
            ctx.stroke();
            ctx.restore();
        }
        return m.height;
    }

    drawList(block, x, y, width, m) {
        const ctx = this.ctx;
        // A measure belonging to a different block shape carries no list layout.
        // Re-measure this block rather than reading a field that is not there.
        if (!m || !Array.isArray(m.laid)) m = this.measureList(block, width);
        let cy = y;
        m.laid.forEach((item, n) => {
            const ix = x + item.indent * m.step;
            const tx = ix + m.markerGap;
            const boxSize = Math.max(9, Math.round(this.s.fontSize * 0.62));

            if (item.checked === null || item.checked === undefined) {
                this.useFont(this.bodyFont());
                ctx.fillStyle = this.theme.text;
                if (block.ordered) {
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    ctx.fillText(item.marker, tx - m.markerGap * 0.4, cy);
                } else {
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.beginPath();
                    ctx.arc(ix + m.markerGap * 0.42, cy + this.s.fontSize * 0.44,
                        Math.max(2, this.s.fontSize * 0.085), 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                // Task marker: an outlined box, ticked when done.
                const bx = ix;
                const by = cy + Math.round(this.s.fontSize * 0.12);
                ctx.save();
                ctx.strokeStyle = this.gen.accent('borderAlpha');
                ctx.lineWidth = 1.4;
                ctx.strokeRect(bx + 0.5, by + 0.5, boxSize - 1, boxSize - 1);
                if (item.checked) {
                    ctx.strokeStyle = this.gen.accent('accentAlpha');
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(bx + boxSize * 0.24, by + boxSize * 0.52);
                    ctx.lineTo(bx + boxSize * 0.42, by + boxSize * 0.72);
                    ctx.lineTo(bx + boxSize * 0.78, by + boxSize * 0.26);
                    ctx.stroke();
                }
                ctx.restore();
            }

            ctx.textAlign = 'left';
            item.lines.forEach((line, i) => {
                const strike = item.checked === true;
                this.drawLine(line, tx, cy + i * m.lineH, strike ? { strike: true } : null);
            });
            cy += item.height + (n < m.laid.length - 1 ? Math.round(m.lineH * 0.3) : 0);
        });
        return m.height;
    }

    drawQuote(block, x, y, width, m) {
        const ctx = this.ctx;
        const gx = x + m.inset;
        let cy = y + m.pad;
        ctx.save();
        ctx.fillStyle = this.gen.accent('borderAlpha');
        ctx.fillRect(x, y + m.pad * 0.4, Math.max(2, Math.round(this.s.fontSize * 0.09)), m.height - m.pad * 0.8);
        ctx.restore();
        m.laid.forEach((item) => {
            cy += this.drawBlock(item.block, gx, cy, m.inner, item.measure, null);
        });
        return m.height;
    }

    drawTable(block, x, y, width, m) {
        const ctx = this.ctx;
        const theme = this.theme;
        let cy = y;

        const paintRow = (row, isHead) => {
            ctx.save();
            if (isHead) ctx.fillStyle = theme.text;
            else ctx.fillStyle = theme.text;
            ctx.globalAlpha = isHead ? 1 : 0.92;
            let cx = x;
            row.cells.forEach((lines, c) => {
                const align = block.align[c] || 'left';
                lines.forEach((line, li) => {
                    const lw = line.reduce((s, seg) => s + seg.gap + seg.w, 0);
                    const inner = m.widths[c] - m.cellPadX * 2;
                    let tx = x + cx + m.cellPadX;
                    if (align === 'center') tx = x + cx + (m.widths[c] - lw) / 2;
                    else if (align === 'right') tx = x + cx + m.widths[c] - m.cellPadX - lw;
                    ctx.font = isHead ? m.headFont : m.font;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    let px = tx;
                    line.forEach((seg, i) => {
                        if (i > 0) px += seg.gap;
                        ctx.font = seg.font;
                        ctx.fillText(seg.text, px, cy + m.cellPadY + li * m.lineH);
                        px += seg.w;
                    });
                });
                cx += m.widths[c];
            });
            ctx.restore();
            cy += row.height;
        };

        // Rules above, below and between the header and body.
        ctx.save();
        ctx.strokeStyle = this.gen.accent('borderAlpha');
        ctx.lineWidth = m.rule;
        ctx.beginPath();
        ctx.moveTo(x, cy + m.rule / 2);
        ctx.lineTo(x + width, cy + m.rule / 2);
        ctx.stroke();
        cy += m.rule;

        paintRow(m.head, true);

        ctx.strokeStyle = this.gen.accent('ruleAlpha');
        ctx.beginPath();
        ctx.moveTo(x, cy + m.rule / 2);
        ctx.lineTo(x + width, cy + m.rule / 2);
        ctx.stroke();
        cy += m.rule;

        m.body.forEach((row, i) => {
            if (i > 0) {
                ctx.save();
                ctx.strokeStyle = this.gen.accent('ruleAlpha');
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, cy);
                ctx.lineTo(x + width, cy);
                ctx.stroke();
                ctx.restore();
            }
            paintRow(row, false);
        });

        ctx.strokeStyle = this.gen.accent('borderAlpha');
        ctx.lineWidth = m.rule;
        ctx.beginPath();
        ctx.moveTo(x, cy + m.rule / 2);
        ctx.lineTo(x + width, cy + m.rule / 2);
        ctx.stroke();
        ctx.restore();
        cy += m.rule;
        return m.height;
    }

    drawCode(block, x, y, width, m) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = this.theme.background === '#ffffff' ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(x, y, width, m.height);
        ctx.strokeStyle = this.gen.accent('ruleAlpha');
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, m.height - 1);
        ctx.restore();

        let cy = y + m.padY;
        m.lines.forEach((line) => {
            if (line.length) this.drawLine(line, x + m.padX, cy, { color: this.theme.text });
            cy += m.lineH;
        });
        return m.height;
    }

    drawFigure(block, x, y, width, m) {
        const ctx = this.ctx;
        const midX = x + width / 2;
        const half = Math.min(m.inner, width * 0.4) / 2;
        const top = y + m.ruleGap * 0.6;
        const bottom = top + m.lines.length * m.lineH + m.ruleGap;

        ctx.save();
        ctx.strokeStyle = this.gen.accent('ruleAlpha');
        ctx.lineWidth = 1;
        [top, bottom].forEach((ry) => {
            ctx.beginPath();
            ctx.moveTo(midX - half, ry);
            ctx.lineTo(midX + half, ry);
            ctx.stroke();
        });
        ctx.restore();

        const widest = m.lines.reduce((max, l) => Math.max(max, l.reduce((s, seg) => s + seg.gap + seg.w, 0)), 0);
        m.lines.forEach((line, i) => {
            const lw = line.reduce((s, seg) => s + seg.gap + seg.w, 0);
            this.drawLine(line, midX - lw / 2, top + m.ruleGap * 0.4 + i * m.lineH, {
                color: this.theme.text
            });
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.restore();
        });
        return m.height;
    }

    drawDiagram(block, x, y, width, m) {
        const ctx = this.ctx;
        const dx = x + (width - m.imgW) / 2;
        ctx.drawImage(block.img, dx, y, m.imgW, m.imgH);
        if (m.caption) {
            const ctx2 = this.ctx;
            ctx2.save();
            ctx2.font = `${Math.round(this.s.fontSize * 0.8)}px "${this.s.fontFamily}", serif`;
            ctx2.fillStyle = this.theme.text;
            ctx2.globalAlpha = 0.72;
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'top';
            ctx2.fillText(m.caption, x + width / 2, y + m.imgH + Math.round(this.s.fontSize * 0.3));
            ctx2.restore();
        }
        return m.height;
    }
}

window.MdEngine = MdEngine;
window.parseMarkdown = parseMarkdown;
window.parseInline = parseInline;
window.prepareDiagrams = prepareDiagrams;
