/**
 * Kannada Carousel Post Generator
 *
 * Pagination model
 * ----------------
 * Pages are filled with WHOLE SENTENCES first, then whole clauses (, ; : —),
 * and only as a last resort at word boundaries. A page therefore keeps a ragged
 * bottom instead of guzzling every last line, because breaking a Kannada
 * sentence mid-way is jarring to read. A `---` line on its own forces a break.
 *
 * Rendering notes
 * ---------------
 * - Text measurement happens against the real loaded font, and the same wrapper
 *   that measures also draws, so a line can never be wider than the column.
 * - The footer band is reserved before the line budget is computed.
 * - Page images are Blobs (not base64 data URLs) to keep memory flat.
 */

const FOOTER_RESERVE = 95;
const SENTENCE_RE = /[.!?।॥]+["'”’)\]}»⟩」』]*/g;
const CLAUSE_RE = /[^,;:—–]+[,;:—–]*/g;
const FORCE_BREAK_RE = /^\s*(?:-{3,}|={3,}|\*{3,})\s*$/;
const MARK_RE = /[\p{M}\u200C\u200D]/u;
const ABBREVIATIONS = new Set([
    'ಡಾ', 'ಪ್ರೊ', 'ಎಂ', 'ಶ್ರೀ', 'ಶ್ರೀಮತಿ', 'ಮು', 'ವಿ', 'ಅ',
    'dr', 'mr', 'mrs', 'ms', 'prof', 'no', 'vol', 'fig', 'vs', 'etc', 'approx', 'e.g', 'i.e'
]);

/**
 * Backgrounds. `paint` selects the renderer:
 *   plain    flat colour
 *   paper    flat colour + deterministic grain
 *   dots     flat colour + dot matrix
 *   rules    flat colour + horizontal rules
 *   gradient vertical multi-stop ramp (+ optional `overlay` tile on top)
 * Every entry carries its own text colour, chosen so body copy clears WCAG AA.
 */
const THEMES = {
    cream: {
        label: 'Cream', paint: 'paper',
        background: '#f4f0e5', text: '#2d2419',
        accentRGB: '139,119,101', accentAlpha: 0.15, borderAlpha: 0.40, ruleAlpha: 0.30
    },
    oldPaper: {
        label: 'Vintage', paint: 'paper',
        background: '#e8dcc8', text: '#33261a',
        accentRGB: '100,70,40', accentAlpha: 0.20, borderAlpha: 0.55, ruleAlpha: 0.45
    },
    newsprint: {
        label: 'Newsprint', paint: 'paper',
        background: '#e9edf1', text: '#1b242e',
        accentRGB: '86,102,118', accentAlpha: 0.16, borderAlpha: 0.45, ruleAlpha: 0.32
    },
    kraft: {
        label: 'Kraft', paint: 'paper',
        background: '#d8c2a2', text: '#3a2a16',
        accentRGB: '104,74,40', accentAlpha: 0.20, borderAlpha: 0.50, ruleAlpha: 0.38
    },
    white: {
        label: 'Clean', paint: 'plain',
        background: '#ffffff', text: '#1a1a1a',
        accentRGB: '0,0,0', accentAlpha: 0.08, borderAlpha: 0.30, ruleAlpha: 0.22
    },
    dotgrid: {
        label: 'Dot Grid', paint: 'dots', tile: 26, dotRadius: 1.4, dotAlpha: 0.5,
        background: '#fbfbfd', text: '#181a1f',
        accentRGB: '122,124,146', accentAlpha: 0.14, borderAlpha: 0.34, ruleAlpha: 0.26
    },
    ruled: {
        label: 'Ruled', paint: 'rules', tile: 46, ruleAlpha: 0.42,
        background: '#fdfdfa', text: '#1f2933',
        accentRGB: '104,128,152', accentAlpha: 0.14, borderAlpha: 0.34, ruleAlpha: 0.26
    },
    sage: {
        label: 'Sage', paint: 'gradient',
        gradient: [[0, '#e6ece1'], [1, '#cbdac9']],
        background: '#dbe6d8', text: '#1f3325',
        accentRGB: '84,116,90', accentAlpha: 0.16, borderAlpha: 0.46, ruleAlpha: 0.34
    },
    terracotta: {
        label: 'Terracotta', paint: 'gradient',
        gradient: [[0, '#f6e7db'], [1, '#e8c3ab']],
        background: '#efd6c3', text: '#4a2214',
        accentRGB: '176,92,58', accentAlpha: 0.18, borderAlpha: 0.48, ruleAlpha: 0.34
    },
    sunrise: {
        label: 'Sunrise', paint: 'gradient',
        gradient: [[0, '#ffe9c8'], [0.5, '#ffbe8e'], [1, '#e8708c']],
        background: '#ffd0a8', text: '#43161f',
        accentRGB: '176,58,74', accentAlpha: 0.18, borderAlpha: 0.46, ruleAlpha: 0.34
    },
    dusk: {
        label: 'Dusk', paint: 'gradient',
        gradient: [[0, '#1e1642'], [0.55, '#4f2565'], [1, '#93315a']],
        background: '#43235a', text: '#f7eeff',
        accentRGB: '255,196,228', accentAlpha: 0.16, borderAlpha: 0.46, ruleAlpha: 0.34
    },
    midnight: {
        label: 'Midnight', paint: 'gradient', overlay: 'stars',
        gradient: [[0, '#0a1120'], [0.6, '#152341'], [1, '#243a63']],
        background: '#152341', text: '#dfeaff',
        accentRGB: '150,190,255', accentAlpha: 0.14, borderAlpha: 0.44, ruleAlpha: 0.32
    },
    custom: {
        label: 'Custom', paint: 'plain',
        background: '#f4f0e5', text: '#2d2419',
        accentRGB: '139,119,101', accentAlpha: 0.15, borderAlpha: 0.40, ruleAlpha: 0.30
    }
};

const THEME_GROUPS = [
    { name: 'Paper', keys: ['cream', 'oldPaper', 'newsprint', 'kraft'] },
    { name: 'Ink', keys: ['white', 'dotgrid', 'ruled'] },
    { name: 'Colour', keys: ['sage', 'terracotta', 'sunrise', 'dusk', 'midnight'] }
];


/**
 * Font registry. `fallback` is a guaranteed-loaded Kannada face, so a missing
 * or slow webfont degrades to readable text rather than tofu.
 * `single` marks families with no real bold — the browser uses the same file
 * for 700 rather than synthesising a smeared weight.
 */
const FONTS = {
    'Tunga': { fallback: "'Noto Serif Kannada', serif", group: 'text' },
    'Kedage': { fallback: "'Noto Serif Kannada', serif", group: 'text' },
    'Kadamba': { fallback: "'Noto Serif Kannada', serif", group: 'text', single: true },
    'Anek Kannada': { fallback: "'Noto Sans Kannada', sans-serif", group: 'text' },
    'Lohit Kannada': { fallback: "'Noto Sans Kannada', sans-serif", group: 'text', single: true },

    'Karnata GTN': { fallback: "'Noto Serif Kannada', serif", group: 'display' },
    'Nudi 22K': { fallback: "'Noto Serif Kannada', serif", group: 'display', single: true },
    'Karnata Bandipur': { fallback: "'Noto Serif Kannada', serif", group: 'display', single: true },
    'Karnata F Kittel': { fallback: "'Noto Serif Kannada', serif", group: 'display', single: true },
    'Karnata Wesleyan': { fallback: "'Noto Serif Kannada', serif", group: 'display', single: true },
    'Karnata German Mission': { fallback: "'Noto Serif Kannada', serif", group: 'display', single: true },

    'Noto Serif Kannada': { fallback: 'serif', group: 'google' },
    'Noto Sans Kannada': { fallback: 'sans-serif', group: 'google' },
    'Baloo Tamma 2': { fallback: 'cursive', group: 'google' },
    'Tiro Kannada': { fallback: 'serif', group: 'google' }
};

const DRAFT_KEY = 'kannadaCarouselDraft';
const THEME_KEY = 'appTheme';

const PRESETS = [
    '#f4f0e5', '#e8dcc8', '#e9edf1', '#d8c2a2',
    '#dbe6d8', '#f6e7db', '#ffe9c8', '#241a48',
    '#0a1120', '#1a1a24', '#2d2419', '#8a8274'
];

function hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgbString(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '0,0,0';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
}

class KannadaCarouselGenerator {
    constructor() {
        this.aspectRatios = {
            '4:5': { width: 1080, height: 1350 },
            '1:1': { width: 1080, height: 1080 },
            '9:16': { width: 1080, height: 1920 }
        };

        this.fonts = FONTS;
        this.themes = THEMES;

        this.settings = {
            fontSize: 28,
            lineHeight: 1.8,
            padding: 80,
            fontFamily: 'Noto Serif Kannada',
            theme: 'cream',
            pageStyle: 'border',
            textAlign: 'left',
            aspectRatio: '4:5',
            imageFormat: 'png',
            imageQuality: 0.9,
            bgImageOverlay: 0.35,
            showTitleHeader: true,
            enableDropCap: false,
            customBgColor: '#f4f0e5',
            customTextColor: '#2d2419',
            watermarkPosition: 'bottom-right',
            watermarkOpacity: 0.5
        };

        this.generatedImages = [];
        this.objectUrls = [];
        this.customBgImage = null;
        this.watermarkImage = null;
        this.pasteTarget = null;
        this.tileCache = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.currentPageIndex = 0;
        this.isDirty = false;
        this.autoSaveTimeout = null;
        this.statusTimeout = null;
        this.draftStatusTimeout = null;
        this.lastFocused = null;

        this.webpSupported = this.detectWebp();
        this.md = new MdEngine(this);

        this.initDOM();
        this.initCanvas();
        this.bindEvents();
        this.loadDraft();
        this.loadThemePreference();
        this.syncControls();
    }

    // ===== Setup =====
    initDOM() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            articleTitle: $('articleTitle'),
            input: $('kannadaInput'),
            draftStatus: $('draftStatus'),
            staleBadge: $('staleBadge'),

            themeRadios: document.querySelectorAll('input[name="bgTheme"]'),
            customColorRow: $('customColorRow'),

            fontFamily: $('fontFamily'),
            fontSize: $('fontSize'),
            fontSizeValue: $('fontSizeValue'),
            lineHeight: $('lineHeight'),
            lineHeightValue: $('lineHeightValue'),
            padding: $('padding'),
            paddingValue: $('paddingValue'),
            alignButtons: document.querySelectorAll('.align-btn'),

            showTitleHeader: $('showTitleHeader'),
            enableDropCap: $('enableDropCap'),
            pageStyle: $('pageStyle'),

            bgImage: $('bgImage'),
            clearBgImage: $('clearBgImage'),
            bgDropZone: $('bgDropZone'),
            bgImageOverlay: $('bgImageOverlay'),
            bgImageOverlayValue: $('bgImageOverlayValue'),
            bgImageSettings: $('bgImageSettings'),

            watermarkImage: $('watermarkImage'),
            clearWatermark: $('clearWatermark'),
            wmDropZone: $('wmDropZone'),
            watermarkSettings: $('watermarkSettings'),
            watermarkPosition: $('watermarkPosition'),
            watermarkOpacity: $('watermarkOpacity'),
            watermarkOpacityValue: $('watermarkOpacityValue'),

            aspectRatio: $('aspectRatio'),
            imageFormat: $('imageFormat'),
            qualityRow: $('qualityRow'),
            imageQuality: $('imageQuality'),
            imageQualityValue: $('imageQualityValue'),

            generateBtn: $('generateBtn'),
            downloadBtn: $('downloadBtn'),
            clearDraftBtn: $('clearDraftBtn'),
            undoBtn: $('undoBtn'),
            redoBtn: $('redoBtn'),

            customBgChip: $('customBgChip'),
            customTextChip: $('customTextChip'),

            previewContainer: $('previewContainer'),
            pageCount: $('pageCount'),

            previewModal: $('previewModal'),
            modalImage: $('modalImage'),
            modalClose: $('modalClose'),
            modalDownload: $('modalDownload'),

            themeToggle: $('themeToggle'),
            canvas: $('renderCanvas')
        };
    }

    initCanvas() {
        this.ctx = this.elements.canvas.getContext('2d');
        this.updateCanvasSize();
    }

    updateCanvasSize() {
        const ratio = this.aspectRatios[this.settings.aspectRatio] || this.aspectRatios['4:5'];
        this.elements.canvas.width = ratio.width;
        this.elements.canvas.height = ratio.height;
        this.CANVAS_WIDTH = ratio.width;
        this.CANVAS_HEIGHT = ratio.height;
        this.tileCache.clear();
    }

    detectWebp() {
        try {
            return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
        } catch (e) {
            return false;
        }
    }

    // ===== Events =====
    bindEvents() {
        const e = this.elements;

        e.generateBtn.addEventListener('click', () => this.generate());
        e.downloadBtn.addEventListener('click', () => this.downloadZip());
        e.clearDraftBtn.addEventListener('click', () => this.clearDraft());

        e.themeRadios.forEach((radio) => {
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                this.settings.theme = radio.value;
                this.tileCache.clear();
                this.updateCustomColorVisibility();
                this.markStale();
            });
        });

        this.buildPickers();

        e.pageStyle.addEventListener('change', (ev) => {
            this.settings.pageStyle = ev.target.value;
            this.markStale();
        });

        e.bgImage.addEventListener('change', (ev) => this.handleImageUpload(ev, 'bg'));
        e.clearBgImage.addEventListener('click', () => this.clearImage('bg'));
        this.bindDropZone(e.bgDropZone, 'bg');
        this.bindPaste(e.bgDropZone, 'bg');
        // Pasting anywhere targets whichever slot is waiting for an image.
        document.addEventListener('paste', (ev) => {
            const kind = this.pasteTarget;
            const file = ev.clipboardData && ev.clipboardData.files && ev.clipboardData.files[0];
            if (!kind || !file) return;
            ev.preventDefault();
            this.pasteTarget = null;
            this.useImageFile(file, kind);
        });
        e.bgImageOverlay.addEventListener('input', (ev) => {
            this.settings.bgImageOverlay = parseFloat(ev.target.value);
            e.bgImageOverlayValue.textContent = `${Math.round(this.settings.bgImageOverlay * 100)}%`;
            this.markStale();
        });

        e.watermarkImage.addEventListener('change', (ev) => this.handleImageUpload(ev, 'watermark'));
        e.clearWatermark.addEventListener('click', () => this.clearImage('watermark'));
        this.bindDropZone(e.wmDropZone, 'watermark');
        this.bindPaste(e.wmDropZone, 'watermark');
        e.watermarkPosition.addEventListener('change', (ev) => {
            this.settings.watermarkPosition = ev.target.value;
            this.markStale();
        });
        e.watermarkOpacity.addEventListener('input', (ev) => {
            this.settings.watermarkOpacity = parseFloat(ev.target.value);
            e.watermarkOpacityValue.textContent = `${Math.round(this.settings.watermarkOpacity * 100)}%`;
            this.markStale();
        });

        e.showTitleHeader.addEventListener('change', (ev) => {
            this.settings.showTitleHeader = ev.target.checked;
            this.markStale();
        });
        e.enableDropCap.addEventListener('change', (ev) => {
            this.settings.enableDropCap = ev.target.checked;
            this.markStale();
        });

        e.fontFamily.addEventListener('change', (ev) => {
            this.settings.fontFamily = ev.target.value;
            this.updateFontNote();
            // Warm the face so the next compose is not waiting on the download.
            this.ensureFonts(this.elements.input.value).catch(() => { /* fall back */ });
            this.markStale();
        });

        e.fontSize.addEventListener('input', (ev) => {
            this.settings.fontSize = parseInt(ev.target.value, 10);
            e.fontSizeValue.textContent = `${this.settings.fontSize}px`;
            this.markStale();
        });
        e.lineHeight.addEventListener('input', (ev) => {
            this.settings.lineHeight = parseFloat(ev.target.value);
            e.lineHeightValue.textContent = this.settings.lineHeight.toFixed(1);
            this.markStale();
        });
        e.padding.addEventListener('input', (ev) => {
            this.settings.padding = parseInt(ev.target.value, 10);
            e.paddingValue.textContent = `${this.settings.padding}px`;
            this.markStale();
        });

        e.alignButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.settings.textAlign = btn.dataset.align;
                this.syncAlignButtons();
                this.markStale();
            });
        });

        e.aspectRatio.addEventListener('change', (ev) => {
            this.settings.aspectRatio = ev.target.value;
            this.updateCanvasSize();
            this.markStale();
        });

        e.imageFormat.addEventListener('change', (ev) => {
            this.settings.imageFormat = ev.target.value;
            this.updateQualityRowVisibility();
            this.markStale();
        });

        e.imageQuality.addEventListener('input', (ev) => {
            this.settings.imageQuality = parseFloat(ev.target.value);
            e.imageQualityValue.textContent = `${Math.round(this.settings.imageQuality * 100)}%`;
            this.markStale();
        });

        this.attachHistory(e.input, true);
        this.attachHistory(e.articleTitle, false);

        e.modalClose.addEventListener('click', () => this.closeModal());
        e.previewModal.addEventListener('click', (ev) => {
            if (ev.target === e.previewModal) this.closeModal();
        });
        e.modalDownload.addEventListener('click', () => this.downloadCurrentPage());

        e.undoBtn.addEventListener('click', () => this.undo());
        e.redoBtn.addEventListener('click', () => this.redo());

        e.themeToggle.addEventListener('click', () => this.toggleAppTheme());

        document.addEventListener('keydown', (ev) => this.onGlobalKeydown(ev));
        window.addEventListener('beforeunload', () => this.flushDraft());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flushDraft();
        });
    }

    onGlobalKeydown(ev) {
        const modalOpen = this.elements.previewModal.classList.contains('is-open');
        if (modalOpen) {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.closeModal();
                return;
            }
            if (ev.key === 'Tab') this.trapModalFocus(ev);
            return;
        }

        const inTextField = ev.target === this.elements.input || ev.target === this.elements.articleTitle;
        if (inTextField && ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === 'z') {
            ev.preventDefault();
            this.undo();
        } else if (inTextField && (ev.ctrlKey && ev.key.toLowerCase() === 'y' ||
            (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'z'))) {
            ev.preventDefault();
            this.redo();
        }
    }

    trapModalFocus(ev) {
        const focusables = this.elements.previewModal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
            ev.preventDefault();
            last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
            ev.preventDefault();
            first.focus();
        }
    }

    syncHistoryButtons() {
        this.elements.undoBtn.disabled = this.undoStack.length === 0;
        this.elements.redoBtn.disabled = this.redoStack.length === 0;
    }

    // ===== Undo / Redo =====
    attachHistory(el, isBody) {
        el.__history = { last: el.value, ready: false };
        el.addEventListener('input', () => {
            const h = el.__history;
            if (!h.ready) {
                h.last = el.value;
                h.ready = true;
            } else if (h.last !== el.value) {
                this.undoStack.push({ el, value: h.last, sel: el.selectionStart });
                if (this.undoStack.length > 100) this.undoStack.shift();
                this.redoStack.length = 0;
                h.last = el.value;
            }
            this.syncHistoryButtons();
            this.autoSaveDraft();
            this.markStale();
        });
    }

    undo() {
        while (this.undoStack.length) {
            const entry = this.undoStack.pop();
            if (entry.el.value === entry.value) continue;
            this.redoStack.push({ el: entry.el, value: entry.el.value, sel: entry.el.selectionStart });
            this.applyHistoryEntry(entry);
            this.syncHistoryButtons();
            return;
        }
    }

    redo() {
        while (this.redoStack.length) {
            const entry = this.redoStack.pop();
            if (entry.el.value === entry.value) continue;
            this.undoStack.push({ el: entry.el, value: entry.el.value, sel: entry.el.selectionStart });
            this.applyHistoryEntry(entry);
            this.syncHistoryButtons();
            return;
        }
    }

    applyHistoryEntry(entry) {
        entry.el.value = entry.value;
        entry.el.__history.last = entry.value;
        entry.el.__history.ready = true;
        try {
            entry.el.setSelectionRange(entry.sel, entry.sel);
            entry.el.focus();
        } catch (e) { /* selection unsupported on this input type */ }
        this.autoSaveDraft();
        this.markStale();
    }

    // ===== In-page colour pickers =====
    // A native <input type="color"> opens an OS dialog, which is the one thing
    // that can hand control away from the page. These stay entirely in-page.

    buildPickers() {
        const host = this.elements.customColorRow;
        if (!host || host.dataset.built) return;
        host.dataset.built = '1';

        const defs = [
            { key: 'customBgColor', name: 'Ground', value: this.settings.customBgColor },
            { key: 'customTextColor', name: 'Ink', value: this.settings.customTextColor }
        ];
        defs.forEach((def, n) => {
            const wrap = document.createElement('div');
            wrap.className = 'picker';

            const head = document.createElement('div');
            head.className = 'picker-head';
            const chip = document.createElement('span');
            chip.className = 'picker-swatch';
            const name = document.createElement('span');
            name.className = 'picker-name';
            name.textContent = def.name;
            const hex = document.createElement('span');
            hex.className = 'picker-hex';
            head.append(chip, name, hex);

            const presets = document.createElement('div');
            presets.className = 'picker-presets';
            presets.setAttribute('role', 'group');
            presets.setAttribute('aria-label', `${def.name} presets`);

            const sliders = document.createElement('div');
            sliders.className = 'picker-sliders';
            const mkSlider = (label, min, max, role) => {
                const row = document.createElement('div');
                row.className = 'slider';
                const lab = document.createElement('label');
                lab.className = 'slider-key';
                lab.textContent = label;
                lab.htmlFor = `pk-${n}-${role}`;
                const input = document.createElement('input');
                input.type = 'range';
                input.id = `pk-${n}-${role}`;
                input.min = min; input.max = max; input.value = 50;
                const out = document.createElement('output');
                out.className = 'slider-val';
                out.htmlFor = input.id;
                row.append(lab, input, out);
                return { row, input, out };
            };
            const hue = mkSlider('Hue', 0, 359, 'hue');
            const light = mkSlider('Light', 6, 94, 'light');
            sliders.append(hue.row, light.row);

            wrap.append(head, presets, sliders);
            host.appendChild(wrap);

            this.bindPicker(wrap, def, { chip, hex, presets, hue, light });
        });

        // Ground and ink are set independently, so warn when the pair becomes
        // unreadable rather than letting the user discover it on the page.
        const note = document.createElement('p');
        note.className = 'picker-contrast';
        note.id = 'pickerContrast';
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
        host.appendChild(note);
    }

    contrastRatio(a, b) {
        const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = (hex) => {
            const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
            if (!m) return 0;
            const n = parseInt(m[1], 16);
            return 0.2126 * srgb((n >> 16) & 255) + 0.7152 * srgb((n >> 8) & 255) + 0.0722 * srgb(n & 255);
        };
        const l1 = Math.max(lum(a), lum(b));
        const l2 = Math.min(lum(a), lum(b));
        return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
    }

    updateContrastNote() {
        const note = document.getElementById('pickerContrast');
        if (!note) return;
        const ratio = this.contrastRatio(this.settings.customBgColor, this.settings.customTextColor);
        const ok = ratio >= 4.5;
        note.textContent = `Contrast ${ratio.toFixed(2)}:1 — ${ok ? 'readable' : 'too low, raise the difference'}`;
        note.classList.toggle('is-bad', !ok);
    }

    bindPicker(wrap, def, refs) {
        const state = { h: 40, l: 90, s: 0.42 };
        const self = this;

        const apply = (hex) => {
            self.settings[def.key] = hex;
            refs.chip.style.background = hex;
            refs.hex.textContent = hex.toUpperCase();
            self.applyCustomTheme();
            self.syncColorInputs();
            self.markStale();
        };
        const fromHsl = () => hslToHex(state.h, state.s, state.l / 100);

        PRESETS.forEach((hex) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'picker-preset';
            b.style.background = hex;
            b.title = hex.toUpperCase();
            b.setAttribute('aria-label', `${def.name} ${hex.toUpperCase()}`);
            b.addEventListener('click', () => {
                refs.presets.querySelectorAll('.is-on').forEach((n) => n.classList.remove('is-on'));
                b.classList.add('is-on');
                apply(hex);
            });
            refs.presets.appendChild(b);
        });

        const onHue = () => {
            state.h = parseInt(refs.hue.input.value, 10);
            refs.hue.out.textContent = `${state.h}°`;
            refs.presets.querySelectorAll('.is-on').forEach((n) => n.classList.remove('is-on'));
            apply(fromHsl());
        };
        const onLight = () => {
            state.l = parseInt(refs.light.input.value, 10);
            refs.light.out.textContent = `${state.l}%`;
            refs.presets.querySelectorAll('.is-on').forEach((n) => n.classList.remove('is-on'));
            apply(fromHsl());
        };
        refs.hue.input.addEventListener('input', onHue);
        refs.light.input.addEventListener('input', onLight);

        // Reflect an externally restored colour.
        wrap.syncFrom = (hex) => {
            if (!hex) return;
            refs.chip.style.background = hex;
            refs.hex.textContent = hex.toUpperCase();
        };
    }

    syncColorInputs() {
        const host = this.elements.customColorRow;
        if (!host) return;
        const values = [this.settings.customBgColor, this.settings.customTextColor];
        [...host.querySelectorAll('.picker')].forEach((wrap, i) => {
            if (wrap.syncFrom) wrap.syncFrom(values[i]);
        });
        this.updateContrastNote();
    }

    // ===== Image uploads =====
    handleImageUpload(ev, kind) {
        const file = ev.target.files && ev.target.files[0];
        // Reset so re-picking the same file fires another change event.
        ev.target.value = '';
        if (file) this.useImageFile(file, kind);
    }

    /** Focusing a drop zone makes a later paste land there. */
    bindPaste(el, kind) {
        if (!el) return;
        el.addEventListener('click', () => {
            this.pasteTarget = kind;
            this.showDraftStatus('Paste an image, or drop one here');
        });
    }

    /**
     * Load a local image. Shared by the file picker, drag-and-drop and paste,
     * so no path requires a native dialog.
     */
    useImageFile(file, kind) {
        if (!file || !/^image\//.test(file.type)) {
            this.showDraftStatus('That file is not an image');
            return;
        }
        const reader = new FileReader();
        reader.onload = (result) => {
            const img = new Image();
            img.onload = () => {
                this.applyImage(img, kind);
                this.markStale();
            };
            img.onerror = () => this.showDraftStatus('Could not decode that image');
            img.src = result.target.result;
        };
        reader.onerror = () => this.showDraftStatus('Could not read that file');
        reader.readAsDataURL(file);
    }

    applyImage(img, kind) {
        if (kind === 'bg') {
            this.customBgImage = img;
            this.elements.clearBgImage.hidden = false;
            this.elements.bgImageSettings.hidden = false;
        } else {
            this.watermarkImage = img;
            this.elements.clearWatermark.hidden = false;
            this.elements.watermarkSettings.hidden = false;
        }
    }

    bindDropZone(el, kind) {
        if (!el) return;
        const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover'].forEach((type) => el.addEventListener(type, (e) => {
            stop(e);
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            el.classList.add('is-drop');
        }));
        el.addEventListener('dragleave', (e) => {
            stop(e);
            if (!el.contains(e.relatedTarget)) el.classList.remove('is-drop');
        });
        el.addEventListener('drop', (e) => {
            stop(e);
            el.classList.remove('is-drop');
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) this.useImageFile(file, kind);
        });
    }

    clearImage(kind) {
        if (kind === 'bg') {
            this.customBgImage = null;
            this.elements.bgImage.value = '';
            this.elements.clearBgImage.hidden = true;
            this.elements.bgImageSettings.hidden = true;
        } else {
            this.watermarkImage = null;
            this.elements.watermarkImage.value = '';
            this.elements.clearWatermark.hidden = true;
            this.elements.watermarkSettings.hidden = true;
        }
        this.markStale();
    }

    // ===== App chrome theme =====
    toggleAppTheme() {
        const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
        this.applyAppTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    }

    applyAppTheme(theme) {
        document.body.dataset.theme = theme;
    }

    loadThemePreference() {
        let saved = 'dark';
        try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* private mode */ }
        this.applyAppTheme(saved);
    }

    // ===== Draft persistence =====
    serializeState() {
        return {
            title: this.elements.articleTitle.value,
            content: this.elements.input.value,
            settings: { ...this.settings },
            images: {
                bg: this.customBgImage ? this.customBgImage.src : null,
                watermark: this.watermarkImage ? this.watermarkImage.src : null
            },
            hasImages: { bg: !!this.customBgImage, watermark: !!this.watermarkImage },
            timestamp: new Date().toISOString()
        };
    }

    writeDraft(state) {
        // Default to a fresh snapshot: calling this bare used to persist the
        // literal string "undefined", silently losing every draft.
        const payload = state || this.serializeState();
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    saveDraft(quiet) {
        const state = this.serializeState();
        let ok = this.writeDraft(state);
        if (!ok && state.images.bg) {
            // Most likely the quota: retry without the embedded images, keeping text.
            const lean = { ...state, images: { bg: null, watermark: null } };
            ok = this.writeDraft(lean);
            if (ok) this.showDraftStatus('Draft saved (images not saved — storage full)');
            return ok;
        }
        if (ok && !quiet) this.showDraftStatus('Draft saved');
        return ok;
    }

    autoSaveDraft() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => this.saveDraft(true), 1200);
    }

    flushDraft() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
            this.saveDraft(true);
        }
    }

    sanitizeSettings(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const num = (v, lo, hi, dflt) => {
            const n = Number(v);
            return Number.isFinite(n) ? clamp(n, lo, hi) : dflt;
        };
        const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
        const formats = this.webpSupported ? ['png', 'jpeg', 'webp'] : ['png', 'jpeg'];
        const d = this.settings;

        return {
            fontSize: num(src.fontSize, 18, 64, d.fontSize),
            lineHeight: num(src.lineHeight, 1, 3, d.lineHeight),
            padding: num(src.padding, 20, 150, d.padding),
            imageQuality: num(src.imageQuality, 0.5, 1, d.imageQuality),
            bgImageOverlay: num(src.bgImageOverlay, 0, 0.9, d.bgImageOverlay),
            watermarkOpacity: num(src.watermarkOpacity, 0.1, 1, d.watermarkOpacity),
            fontFamily: pick(src.fontFamily, Object.keys(FONTS), d.fontFamily),
            theme: pick(src.theme, Object.keys(THEMES), d.theme),
            pageStyle: pick(src.pageStyle, ['simple', 'border', 'vintage', 'minimal'], d.pageStyle),
            textAlign: pick(src.textAlign, ['left', 'center', 'justify'], d.textAlign),
            aspectRatio: pick(src.aspectRatio, Object.keys(this.aspectRatios), d.aspectRatio),
            imageFormat: pick(src.imageFormat, formats, d.imageFormat),
            watermarkPosition: pick(src.watermarkPosition,
                ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'], d.watermarkPosition),
            showTitleHeader: src.showTitleHeader !== false,
            enableDropCap: src.enableDropCap === true,
            customBgColor: /^#[0-9a-f]{6}$/i.test(src.customBgColor || '') ? src.customBgColor : d.customBgColor,
            customTextColor: /^#[0-9a-f]{6}$/i.test(src.customTextColor || '') ? src.customTextColor : d.customTextColor
        };
    }

    loadDraft() {
        let raw = null;
        try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
        if (!raw) return;
        let draft;
        try {
            draft = JSON.parse(raw);
        } catch (e) {
            console.warn('Discarding unreadable draft');
            try { localStorage.removeItem(DRAFT_KEY); } catch (e2) { /* ignore */ }
            return;
        }
        if (!draft || typeof draft !== 'object') return;

        this.elements.articleTitle.value = typeof draft.title === 'string' ? draft.title : '';
        this.elements.input.value = typeof draft.content === 'string' ? draft.content : '';
        this.settings = this.sanitizeSettings(draft.settings);
        this.applyCustomTheme();

        const images = draft.images || {};
        if (images.bg) this.restoreImage('bg', images.bg);
        if (images.watermark) this.restoreImage('watermark', images.watermark);

        this.updateCanvasSize();
        this.syncControls();
        this.showDraftStatus('Draft restored');
    }

    restoreImage(kind, src) {
        const img = new Image();
        img.onload = () => {
            if (kind === 'bg') {
                this.customBgImage = img;
                this.elements.clearBgImage.hidden = false;
                this.elements.bgImageSettings.hidden = false;
            } else {
                this.watermarkImage = img;
                this.elements.clearWatermark.hidden = false;
                this.elements.watermarkSettings.hidden = false;
            }
        };
        img.src = src;
    }

    clearDraft() {
        if (!confirm('Clear the saved draft (text and settings)?')) return;
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
        this.elements.articleTitle.value = '';
        this.elements.input.value = '';
        this.elements.input.__history.last = '';
        this.elements.articleTitle.__history.last = '';
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.showDraftStatus('Draft cleared');
        this.markStale();
    }

    showDraftStatus(message) {
        const el = this.elements.draftStatus;
        el.textContent = message;
        clearTimeout(this.draftStatusTimeout);
        this.draftStatusTimeout = setTimeout(() => { el.textContent = ''; }, 3000);
    }

    // ===== Control <-> state sync =====
    syncControls() {
        const e = this.elements;
        const s = this.settings;
        this.syncHistoryButtons();

        e.themeRadios.forEach((r) => { r.checked = r.value === s.theme; });
        this.updateCustomColorVisibility();
        this.syncColorInputs();

        e.fontFamily.value = s.fontFamily;
        this.updateFontNote();
        e.fontSize.value = s.fontSize;
        e.fontSizeValue.textContent = `${s.fontSize}px`;
        e.lineHeight.value = s.lineHeight;
        e.lineHeightValue.textContent = s.lineHeight.toFixed(1);
        e.padding.value = s.padding;
        e.paddingValue.textContent = `${s.padding}px`;
        this.syncAlignButtons();

        e.showTitleHeader.checked = s.showTitleHeader;
        e.enableDropCap.checked = s.enableDropCap;
        e.pageStyle.value = s.pageStyle;

        e.bgImageOverlay.value = s.bgImageOverlay;
        e.bgImageOverlayValue.textContent = `${Math.round(s.bgImageOverlay * 100)}%`;
        e.watermarkPosition.value = s.watermarkPosition;
        e.watermarkOpacity.value = s.watermarkOpacity;
        e.watermarkOpacityValue.textContent = `${Math.round(s.watermarkOpacity * 100)}%`;

        e.aspectRatio.value = s.aspectRatio;
        e.imageFormat.value = s.imageFormat;
        this.updateQualityRowVisibility();
        e.imageQuality.value = s.imageQuality;
        e.imageQualityValue.textContent = `${Math.round(s.imageQuality * 100)}%`;
    }

    syncAlignButtons() {
        this.elements.alignButtons.forEach((btn) => {
            const active = btn.dataset.align === this.settings.textAlign;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    updateCustomColorVisibility() {
        this.elements.customColorRow.hidden = this.settings.theme !== 'custom';
    }

    updateQualityRowVisibility() {
        const lossless = this.settings.imageFormat === 'png';
        this.elements.qualityRow.hidden = lossless;
    }

    applyCustomTheme() {
        const t = this.themes.custom;
        t.background = this.settings.customBgColor;
        t.text = this.settings.customTextColor;
        t.accentRGB = hexToRgbString(this.settings.customTextColor);
        this.tileCache.clear();
    }

    accent(alphaKey) {
        const t = this.themes[this.settings.theme] || this.themes.cream;
        const alpha = t[alphaKey] !== undefined ? t[alphaKey] : t.accentAlpha;
        return `rgba(${t.accentRGB}, ${alpha})`;
    }

    markStale() {
        if (!this.generatedImages.length) return;
        this.isDirty = true;
        this.elements.staleBadge.hidden = false;
    }

    clearStale() {
        this.isDirty = false;
        this.elements.staleBadge.hidden = true;
    }

    // ===== Font handling =====
    bodyFontString() {
        const f = FONTS[this.settings.fontFamily];
        return `${this.settings.fontSize}px "${this.settings.fontFamily}", ${f ? f.fallback : 'serif'}`;
    }

    boldFontString(size) {
        const f = FONTS[this.settings.fontFamily];
        return `700 ${size}px "${this.settings.fontFamily}", ${f ? f.fallback : 'serif'}`;
    }

    titleFontSize() {
        return Math.round(clamp(this.settings.fontSize * 1.4, 22, 46));
    }

    /** Tell the user whether a face is meant for headlines or running text. */
    updateFontNote() {
        const note = document.getElementById('fontNote');
        if (!note) return;
        const f = FONTS[this.settings.fontFamily] || {};
        if (f.group === 'display') {
            note.textContent = f.single
                ? 'Display face — single weight, best on a headline'
                : 'Display face — best on a headline';
        } else if (f.group === 'google') {
            note.textContent = 'Google face';
        } else {
            note.textContent = f.single ? 'Text face — single weight' : 'Text face';
        }
    }

    /**
     * Google Fonts serves Kannada as unicode-range subsets, so a bare
     * `fonts.load('28px "Noto Serif Kannada"')` only fetches the weight-400
     * faces and every `bold` title/drop cap silently renders synthesised-bold.
     * The locally vendored Sanchaya faces have no subsets, but loading with the
     * real text is still required before canvas will use them.
     */
    async ensureFonts(text) {
        const family = this.settings.fontFamily;
        const sample = `${(text || '').slice(0, 600)} ಕನ್ನಡ ಅ ಆ ಇ ಈ ಉ ಊ ಋ ಎ ಏ ಐ ಒ ಓ ಔ ೧ ೨ ೩ ೪`;
        try {
            await Promise.all([
                document.fonts.load(`${this.settings.fontSize}px "${family}"`, sample),
                document.fonts.load(this.boldFontString(this.titleFontSize()), sample),
                document.fonts.load(this.boldFontString(this.settings.fontSize * 3), sample)
            ]);
            await document.fonts.ready;
        } catch (err) {
            console.warn('Font loading issue:', err);
        }
    }

    /** Largest prefix of `text` that fits `maxWidth`, snapped to a safe break. */
    safeCut(text, maxWidth, measure) {
        const limit = Math.max(24, maxWidth);
        let cut = text.length;
        while (cut > 1 && measure(text.slice(0, cut)) > limit) cut -= 1;
        if (cut >= text.length) return 0;
        if (cut > 1 && text.charCodeAt(cut - 1) >= 0xDC00 && text.charCodeAt(cut - 1) <= 0xDFFF) cut -= 1;
        while (cut > 1 && MARK_RE.test(text[cut - 1])) cut -= 1;
        while (cut < text.length && MARK_RE.test(text[cut])) cut += 1;
        return Math.max(1, cut);
    }

    /** Absolute sentence spans over raw text, honouring abbreviations. */
    sentenceSpans(text) {
        const spans = [];
        let start = 0;
        SENTENCE_RE.lastIndex = 0;
        let m;
        while ((m = SENTENCE_RE.exec(text)) !== null) {
            const at = m.index;
            const end = at + m[0].length;
            const prevWord = (/\S+$/.exec(text.slice(start, at).trim()) || [''])[0];
            if (ABBREVIATIONS.has(prevWord.toLowerCase())) continue;
            if (m[0][0] === '.') {
                const next = /^\s*(\S)/.exec(text.slice(end));
                if (next && /[a-z0-9]/.test(next[1]) && /[A-Za-z0-9]$/.test(prevWord)) continue;
            }
            if (end > start) spans.push({ from: start, to: end });
            start = end;
        }
        if (start < text.length) spans.push({ from: start, to: text.length });
        return spans;
    }

    /** Absolute clause spans (`,` `;` `:` `—`) within [from, to). */
    clauseSpans(text, from, to) {
        const spans = [];
        const re = new RegExp(CLAUSE_RE.source, 'g');
        re.lastIndex = from;
        let m;
        while ((m = re.exec(text)) !== null && m.index < to) {
            const end = Math.min(to, m.index + m[0].length);
            if (end > from) spans.push({ from: m.index, to: end });
            re.lastIndex = end;
        }
        if (!spans.length && to > from) spans.push({ from, to });
        return spans;
    }

    splitSentences(paragraph) {
        return this.sentenceSpans(paragraph).map((s) => paragraph.slice(s.from, s.to)).filter(Boolean);
    }

    splitClauses(sentence) {
        const parts = sentence.match(CLAUSE_RE) || [sentence];
        const cleaned = parts.map((p) => p.trim()).filter(Boolean);
        return cleaned.length > 1 ? cleaned : [sentence];
    }


    // ===== Pagination =====
    titleFontSpec() {
        return this.boldFontString(this.titleFontSize());
    }

    measureHeader(title) {
        if (!title || !this.settings.showTitleHeader) return null;
        const size = this.titleFontSize();
        const lineH = Math.round(size * 1.35);
        const maxWidth = this.CANVAS_WIDTH - this.settings.padding * 2;
        // The headline honours inline markdown too.
        const lines = this.md.wrapRuns(window.parseInline(title), () => maxWidth, size);
        return { lines, size, lineH, height: lines.length * lineH + 22 + 30 };
    }

    lineWidth(line) {
        return line.reduce((sum, seg) => sum + seg.gap + seg.w, 0);
    }

    measureDropCap() {
        if (!this.settings.enableDropCap) return null;
        const ctx = this.ctx;
        const prev = ctx.font;
        const size = this.settings.fontSize * 3;
        ctx.font = this.boldFontString(size);
        const sample = 'ಕ';
        const width = ctx.measureText(sample).width;
        const height = ctx.measureText(sample).actualBoundingBoxAscent || size * 0.75;
        ctx.font = prev;
        const lineH = this.settings.fontSize * this.settings.lineHeight;
        const lines = clamp(Math.ceil(height / lineH), 2, 4);
        return { size, width, lines };
    }

    usableTop(isFirst, header) {
        const pad = this.settings.padding;
        return isFirst && header ? pad + header.height : pad;
    }

    usableBottom() {
        return this.CANVAS_HEIGHT - Math.max(this.settings.padding, FOOTER_RESERVE);
    }

    capacityFor(isFirst, header, lineH) {
        const room = this.usableBottom() - this.usableTop(isFirst, header);
        return Math.max(1, Math.floor(room / lineH));
    }

    /**
     * Paginate typed blocks into pages.
     *
     * Paragraphs and list items may split (paragraphs break on sentence or
     * clause boundaries, never mid-sentence). Headings, tables, quotes, code
     * and diagrams are atomic and move whole to the next page, so a table never
     * straddles a slide. Pages keep a ragged bottom rather than splitting a
     * sentence to fill.
     */
    layout(blocks, title) {
        const s = this.settings;
        const lineH = s.fontSize * s.lineHeight;
        const maxWidth = this.CANVAS_WIDTH - s.padding * 2;
        const header = this.measureHeader(title);
        const md = this.md;

        const firstCapacity = this.capacityFor(true, header, lineH);
        const capInfo = this.measureDropCap();

        // The drop cap only makes sense when the first flow element is prose.
        const firstBlock = blocks.find((b) => b.type !== 'pagebreak' && b.type !== 'spacer');
        const capUsable = capInfo && firstBlock && firstBlock.type === 'para' &&
            firstCapacity >= capInfo.lines + 2;
        let capChar = '';
        if (capUsable) {
            const at = firstBlock.runs.findIndex((r) => r.text.trim());
            const head = at >= 0 ? firstBlock.runs[at] : null;
            capChar = head ? [...head.text.trim()][0] : '';
            if (capChar) {
                // Copy rather than mutate: layout() must be repeatable on the
                // same block list.
                const runs = firstBlock.runs.slice();
                runs[at] = Object.assign({}, head, { text: head.text.trim().slice(capChar.length) });
                firstBlock.runs = runs.filter((r) => r.text.length);
            }
        }
        const cap = capChar ? { char: capChar, width: capInfo.width + 12, lines: capInfo.lines } : null;

        const pages = [];
        let page = this.newPage(header, cap);
        const gapSize = Math.round(lineH * 0.55);
        const used = () => {
            let h = 0;
            page.items.forEach((it) => { h += it.measure.height + (it.gap || 0); });
            return h;
        };
        const room = () => this.usableBottom() - this.usableTop(pages.length === 0, header) - used();
        // The gap about to be inserted counts against the space available.
        const incomingGap = () => (page.items.length ? gapSize : 0);
        const fits = (m) => room() >= incomingGap() + m.height;

        const place = (block, m, gapBefore) => {
            const gap = gapBefore && page.items.length ? gapSize : 0;
            page.items.push({ block, measure: m, gap, cap: null });
        };
        const startNewPage = () => {
            pages.push(page);
            page = this.newPage(header, null);
        };

        for (let bi = 0; bi < blocks.length; bi += 1) {
            const block = blocks[bi];

            if (block.type === 'pagebreak') { startNewPage(); continue; }
            if (block.type === 'spacer') continue;

            if (block.type === 'para') {
                const width = maxWidth;
                let capFor = (pages.length === 0 && firstBlock === block) ? cap : null;
                let maxLines = Math.max(1, Math.floor((room() - incomingGap()) / lineH));
                let measured = md.measureBlock(block, width, capFor);

                if (measured.lines.length > maxLines) {
                    // Rather than shred a sentence for a two-line remnant, take a
                    // clean page. This is what keeps ragged bottoms ragged.
                    const fullLines = this.capacityFor(false, header, lineH);
                    const worthIt = Math.max(3, Math.floor(fullLines * 0.3));
                    if (page.items.length && maxLines < worthIt) {
                        startNewPage();
                        capFor = page.cap;
                        maxLines = this.capacityFor(pages.length === 0, header, lineH);
                        measured = md.measureBlock(block, width, capFor);
                    }
                }
                if (measured.lines.length <= maxLines && fits(measured)) {
                    place(block, measured, page.items.length > 0);
                    continue;
                }

                const parts = this.splitProse(block, width, maxLines, capFor);
                for (const part of parts) {
                    const pm = md.measureBlock(part.block, width, part.cap);
                    if (!fits(pm) && page.items.length) startNewPage();
                    place(part.block, pm, page.items.length > 0);
                }
                continue;
            }

            if (block.type === 'list') {
                this.layoutList(block, maxWidth, fits, place, startNewPage, () => page.items.length > 0, md);
                continue;
            }

            if (block.type === 'table') {
                const cleanHeight = () => this.usableBottom() - this.usableTop(pages.length === 0, header);
                this.layoutTable(block, maxWidth, fits, place, startNewPage, md, cleanHeight);
                continue;
            }

            // Everything else is atomic: it never straddles a page break.
            const m = md.measureBlock(block, maxWidth, null);
            if (!fits(m) && page.items.length) startNewPage();
            place(block, m, page.items.length > 0);
        }
        if (page.items.length) pages.push(page);

        return { pages, header, cap, dropCapTop: cap ? this.usableTop(true, header) : 0 };
    }

    newPage(header, cap) {
        return { items: [], header, cap };
    }

    /** Plain text of a run list, with the char offset each run starts at. */
    runSpans(runs) {
        let at = 0;
        return runs.map((r) => {
            const start = at;
            at += r.text.length;
            return { run: r, start, end: at };
        });
    }

    /** Slice styled runs to a character range, preserving bold/italic/code. */
    sliceRuns(runs, from, to) {
        const out = [];
        this.runSpans(runs).forEach(({ run, start, end }) => {
            const a = Math.max(start, from);
            const b = Math.min(end, to);
            if (b > a) {
                out.push(Object.assign({}, run, { text: run.text.slice(a - start, b - start) }));
            }
        });
        return out.length ? out : [{ text: '' }];
    }

    /**
     * Break an over-long paragraph into page-sized chunks. Preference order is
     * whole sentence, then whole clause, then word — so a slide break never
     * lands mid-sentence unless a single clause is longer than a page.
     */
    splitProse(block, maxWidth, maxLines, cap) {
        const plain = block.runs.map((r) => r.text).join('');
        const maxH = maxLines * (this.settings.fontSize * this.settings.lineHeight);
        const md = this.md;
        const chunks = [];
        const capAt = (i) => (i === 0 ? cap : null);
        const heightOf = (from, to, i) =>
            md.measureBlock({ type: 'para', runs: this.sliceRuns(block.runs, from, to) }, maxWidth, capAt(i)).height;

        let cursor = 0;
        let index = 0;
        while (cursor < plain.length) {
            let best = -1;

            for (const sp of this.sentenceSpans(plain)) {
                if (sp.to <= cursor) continue;
                if (sp.from < cursor) continue;
                if (heightOf(cursor, sp.to, index) <= maxH) best = sp.to;
                else break;
            }
            if (best === -1) {
                for (const sp of this.clauseSpans(plain, cursor, plain.length)) {
                    if (sp.to <= cursor) continue;
                    if (heightOf(cursor, sp.to, index) <= maxH) best = sp.to;
                    else break;
                }
            }
            if (best === -1) {
                // A single clause exceeds a page: fill greedily by word.
                let trial = cursor;
                while (trial < plain.length) {
                    let next = trial;
                    while (next < plain.length && !/\s/.test(plain[next])) next += 1;
                    while (next < plain.length && /\s/.test(plain[next])) next += 1;
                    if (next <= trial) { next = trial + 1; }
                    if (heightOf(cursor, next, index) <= maxH) best = next;
                    else break;
                    trial = next;
                }
            }
            if (best <= cursor) best = Math.min(plain.length, cursor + 1);

            chunks.push({
                block: { type: 'para', runs: this.sliceRuns(block.runs, cursor, best) },
                cap: capAt(index)
            });
            cursor = best;
            index += 1;
        }
        return chunks.length ? chunks : [{ block, cap }];
    }

    /** Lay out a list, splitting between items so a slide never cuts an item. */
    layoutList(block, maxWidth, fits, place, startNewPage, hasItems, md) {
        const total = block.items.length;
        let offset = 0;
        let first = true;

        while (offset < total) {
            const sliceOf = (n) => ({
                type: 'list',
                ordered: block.ordered,
                start: block.start + offset,
                items: block.items.slice(offset, offset + n)
            });

            const whole = md.measureBlock(sliceOf(total - offset), maxWidth, null);
            if (fits(whole)) {
                place(sliceOf(total - offset), whole, !first);
                return;
            }

            // Largest prefix of items that fits in what is left.
            let take = 0;
            for (let n = total - offset; n >= 1; n -= 1) {
                if (fits(md.measureBlock(sliceOf(n), maxWidth, null))) { take = n; break; }
            }

            if (take === 0) {
                // Not even one item fits here. Move to a clean page and retry,
                // rather than overflowing. If the page is already empty, place
                // one item regardless so the loop always terminates.
                if (hasItems()) { startNewPage(); first = false; continue; }
                take = 1;
            }

            place(sliceOf(take), md.measureBlock(sliceOf(take), maxWidth, null), !first);
            offset += take;
            first = false;
            if (offset < total) startNewPage();
        }
    }

    /**
     * Tables split by row, never mid-row, and repeat the header row on each
     * continuation so every page stays readable on its own.
     */
    layoutTable(block, maxWidth, fits, place, startNewPage, md, cleanHeight) {
        const part = (from, count) => Object.assign({}, block, { rowFrom: from, rowCount: count });
        let from = 0;
        let first = true;

        while (from < block.rows.length) {
            let m = md.measureBlock(part(from, block.rows.length - from), maxWidth, null);
            if (!fits(m) && !first) {
                startNewPage();
                first = false;
                m = md.measureBlock(part(from, block.rows.length - from), maxWidth, null);
            }
            // Taller than a whole page: take as many rows as fit.
            if (m.height > cleanHeight() && block.rows.length - from > 1) {
                let lo = 1;
                let hi = block.rows.length - from;
                let best = 1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (md.measureBlock(part(from, mid), maxWidth, null).height <= cleanHeight()) { best = mid; lo = mid + 1; }
                    else hi = mid - 1;
                }
                m = md.measureBlock(part(from, best), maxWidth, null);
            }
            place(part(from, m.rowCount), m, !first);
            from += m.rowCount;
            first = false;
            if (from < block.rows.length) startNewPage();
        }
    }



    // ===== Drawing =====
    theme() {
        return this.themes[this.settings.theme] || this.themes.cream;
    }

    /**
     * Cached pattern tiles. Deterministic (seeded LCG) so a re-render is
     * pixel-identical, and cached so a 20-page carousel paints each once.
     */
    getTile(kind, theme) {
        const key = `${kind}|${theme.accentRGB}`;
        if (this.tileCache.has(key)) return this.tileCache.get(key);
        let tile = null;
        if (kind === 'paper' || kind === 'grain') tile = this.buildGrainTile(theme);
        else if (kind === 'dots') tile = this.buildDotsTile(theme);
        else if (kind === 'rules') tile = this.buildRulesTile(theme);
        else if (kind === 'stars') tile = this.buildStarsTile(theme);
        this.tileCache.set(key, tile);
        return tile;
    }

    /** createPattern throws on a null tile, and a missing texture is never fatal. */
    fillWithTile(ctx, kind, theme, w, h) {
        const tile = this.getTile(kind, theme);
        if (!tile) return false;
        const pattern = ctx.createPattern(tile, 'repeat');
        if (!pattern) return false;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
        return true;
    }

    makeTile(w, h) {
        const tile = document.createElement('canvas');
        tile.width = w;
        tile.height = h;
        return tile;
    }

    lcg(seed) {
        let s = seed >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return (s >>> 8) / 16777216;
        };
    }

    buildGrainTile(theme) {
        const size = 256;
        const tile = this.makeTile(size, size);
        const g = tile.getContext('2d');
        const img = g.createImageData(size, size);
        const [r, gr, b] = theme.accentRGB.split(',').map(Number);
        const rand = this.lcg(0x9e3779b9);
        for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = r;
            img.data[i + 1] = gr;
            img.data[i + 2] = b;
            img.data[i + 3] = rand() < 0.1 ? 2 + Math.floor(rand() * 8) : 0;
        }
        g.putImageData(img, 0, 0);
        return tile;
    }

    buildDotsTile(theme) {
        const size = theme.tile || 26;
        const tile = this.makeTile(size, size);
        const g = tile.getContext('2d');
        g.fillStyle = `rgba(${theme.accentRGB}, ${theme.dotAlpha})`;
        g.beginPath();
        g.arc(size / 2, size / 2, theme.dotRadius || 1.4, 0, Math.PI * 2);
        g.fill();
        return tile;
    }

    buildRulesTile(theme) {
        const h = theme.tile || 46;
        const tile = this.makeTile(8, h);
        const g = tile.getContext('2d');
        g.fillStyle = `rgba(${theme.accentRGB}, ${theme.ruleAlpha})`;
        g.fillRect(0, 0, 8, 1);
        return tile;
    }

    buildStarsTile(theme) {
        const size = 512;
        const tile = this.makeTile(size, size);
        const g = tile.getContext('2d');
        const rand = this.lcg(0x2545f491);
        for (let i = 0; i < 170; i++) {
            const x = rand() * size;
            const y = rand() * size;
            const r = 0.5 + rand() * 1.3;
            g.fillStyle = `rgba(255,255,255,${0.18 + rand() * 0.55})`;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
        return tile;
    }

    drawCover(ctx, img, w, h) {
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    drawBackground() {
        const ctx = this.ctx;
        const theme = this.theme();
        const W = this.CANVAS_WIDTH;
        const H = this.CANVAS_HEIGHT;

        if (this.customBgImage) {
            this.drawCover(ctx, this.customBgImage, W, H);
            const wash = this.settings.bgImageOverlay;
            if (wash > 0) {
                ctx.fillStyle = this.isLight(theme) ? `rgba(255,255,255,${wash})` : `rgba(0,0,0,${wash})`;
                ctx.fillRect(0, 0, W, H);
            }
            return;
        }

        if (theme.paint === 'gradient') {
            const ramp = ctx.createLinearGradient(0, 0, W * 0.22, H);
            theme.gradient.forEach(([stop, color]) => ramp.addColorStop(stop, color));
            ctx.fillStyle = ramp;
            ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = theme.background;
            ctx.fillRect(0, 0, W, H);
            if (theme.paint === 'paper' || theme.paint === 'dots' || theme.paint === 'rules') {
                this.fillWithTile(ctx, theme.paint, theme, W, H);
            }
        }

        if (theme.overlay === 'stars') this.fillWithTile(ctx, 'stars', theme, W, H);

        // Corner shade for depth
        const vignette = ctx.createRadialGradient(
            W / 2, H / 2, 0,
            W / 2, H / 2, W * 0.8
        );
        vignette.addColorStop(0, 'rgba(255,255,255,0.03)');
        vignette.addColorStop(1, `rgba(${theme.accentRGB}, ${theme.accentAlpha})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
    }

    isLight(color) {
        const m = /^#?([0-9a-f]{6})$/i.exec(color || '');
        if (!m) return true;
        const n = parseInt(m[1], 16);
        const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
        return lum > 140;
    }

    drawPageStyle() {
        const ctx = this.ctx;
        const inset = 25;
        const style = this.settings.pageStyle;
        if (style === 'simple') return;

        if (style === 'border') {
            ctx.save();
            ctx.strokeStyle = this.accent('borderAlpha');
            ctx.lineWidth = 3;
            ctx.strokeRect(inset, inset, this.CANVAS_WIDTH - inset * 2, this.CANVAS_HEIGHT - inset * 2);
            ctx.restore();
            return;
        }

        if (style === 'vintage') {
            const p = inset;
            this.drawCornerOrnament(p, p, 1, 1);
            this.drawCornerOrnament(this.CANVAS_WIDTH - p, p, -1, 1);
            this.drawCornerOrnament(p, this.CANVAS_HEIGHT - p, 1, -1);
            this.drawCornerOrnament(this.CANVAS_WIDTH - p, this.CANVAS_HEIGHT - p, -1, -1);
            return;
        }

        if (style === 'minimal') {
            const y1 = inset + 10;
            const y2 = this.CANVAS_HEIGHT - inset - 10;
            const x1 = this.settings.padding;
            const x2 = this.CANVAS_WIDTH - this.settings.padding;
            ctx.save();
            ctx.strokeStyle = this.accent('ruleAlpha');
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y1);
            ctx.moveTo(x1, y2);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
        }
    }

    drawCornerOrnament(x, y, dirX, dirY) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = this.accent('borderAlpha');
        ctx.lineWidth = 3;
        ctx.beginPath();
        const size = 44;
        ctx.moveTo(x, y + dirY * size);
        ctx.quadraticCurveTo(x, y, x + dirX * size, y);
        ctx.moveTo(x + dirX * 12, y + dirY * size * 0.6);
        ctx.quadraticCurveTo(x + dirX * 12, y + dirY * 12, x + dirX * size * 0.6, y + dirY * 12);
        ctx.stroke();
        ctx.restore();
    }

    drawTitleHeader(header) {
        if (!header) return;
        const ctx = this.ctx;
        const theme = this.theme();
        const top = this.settings.padding;
        const midX = this.CANVAS_WIDTH / 2;
        const maxWidth = this.CANVAS_WIDTH - this.settings.padding * 2;

        const widths = header.lines.map((line) => this.lineWidth(line));
        const widest = widths.length ? Math.max(...widths) : 0;

        ctx.save();
        ctx.fillStyle = theme.text;
        header.lines.forEach((line, i) => {
            const y = top + i * header.lineH;
            this.md.drawLine(line, midX - widths[i] / 2, y);
        });

        const ruleY = top + header.lines.length * header.lineH + 22;
        const half = Math.min(widest + 60, maxWidth) / 2;
        ctx.strokeStyle = this.accent('ruleAlpha');
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(midX - half, ruleY);
        ctx.lineTo(midX + half, ruleY);
        ctx.stroke();
        ctx.restore();
    }

    drawDropCap(char, x, y) {
        if (!char) return;
        const ctx = this.ctx;
        const size = this.settings.fontSize * 3;
        ctx.save();
        ctx.font = this.boldFontString(size);
        ctx.fillStyle = this.theme().text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(char, x, y);
        ctx.restore();
    }

    drawJustifiedText(ctx, text, x, y, maxWidth) {
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length <= 1) {
            ctx.fillText(text, x, y);
            return;
        }
        const glyphs = words.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
        const space = (maxWidth - glyphs) / (words.length - 1);
        // Negative or cramped spacing means the line cannot be justified
        // without overlapping words — leave it ragged instead.
        if (!Number.isFinite(space) || space < ctx.measureText(' ').width) {
            ctx.fillText(text, x, y);
            return;
        }
        let cursor = x;
        words.forEach((w, i) => {
            ctx.fillText(w, cursor, y);
            cursor += ctx.measureText(w).width + (i < words.length - 1 ? space : 0);
        });
    }

    drawBody(page, layout, isFirst) {
        const s = this.settings;
        const width = this.CANVAS_WIDTH - s.padding * 2;
        const x = s.padding;
        let y = this.usableTop(isFirst, layout.header);
        const cap = isFirst ? layout.cap : null;

        for (const item of page.items) {
            y += item.gap || 0;
            y += this.md.drawBlock(item.block, x, y, width, item.measure, cap);
        }
    }

    drawPageFooter(pageNum, totalPages, title) {
        const ctx = this.ctx;
        const theme = this.theme();
        const pad = this.settings.padding;
        const dividerY = this.CANVAS_HEIGHT - 70;
        const textTop = this.CANVAS_HEIGHT - 55;

        ctx.save();
        ctx.strokeStyle = this.accent('ruleAlpha');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pad, dividerY);
        ctx.lineTo(this.CANVAS_WIDTH - pad, dividerY);
        ctx.stroke();

        ctx.fillStyle = theme.text;
        ctx.globalAlpha = 0.65;
        ctx.textBaseline = 'top';

        if (title) {
            ctx.font = `18px "${this.settings.fontFamily}", serif`;
            ctx.textAlign = 'left';
            const maxWidth = this.CANVAS_WIDTH - pad * 2 - 90;
            let display = this.ellipsize(title, maxWidth, ctx);
            ctx.fillText(display, pad, textTop);
        }

        ctx.font = '20px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${pageNum} / ${totalPages}`, this.CANVAS_WIDTH - pad, textTop);
        ctx.restore();
    }

    /** Truncate on a safe break so we never cut a Kannada akshara in half. */
    ellipsize(text, maxWidth, ctx) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        const suffix = '...';
        const budget = Math.max(12, maxWidth - ctx.measureText(suffix).width);
        return `${this.safeCut(text, budget, (s) => ctx.measureText(s).width)}${suffix}`;
    }

    drawWatermark() {
        if (!this.watermarkImage) return;
        const ctx = this.ctx;
        const pad = 30;
        const maxSize = 120;
        const scale = Math.min(maxSize / this.watermarkImage.width, maxSize / this.watermarkImage.height);
        const w = this.watermarkImage.width * scale;
        const h = this.watermarkImage.height * scale;

        let x = this.CANVAS_WIDTH - w - pad;
        let y = this.CANVAS_HEIGHT - h - pad - 50;
        switch (this.settings.watermarkPosition) {
            case 'top-left': x = pad; y = pad; break;
            case 'top-right': x = this.CANVAS_WIDTH - w - pad; y = pad; break;
            case 'bottom-left': x = pad; break;
            case 'center':
                x = (this.CANVAS_WIDTH - w) / 2;
                y = (this.CANVAS_HEIGHT - h) / 2;
                break;
            default: break;
        }

        ctx.save();
        ctx.globalAlpha = this.settings.watermarkOpacity;
        ctx.drawImage(this.watermarkImage, x, y, w, h);
        ctx.restore();
    }

    renderPage(page, layout, pageNum, totalPages, title, isFirst) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
        this.drawBackground();
        this.drawPageStyle();
        if (isFirst) this.drawTitleHeader(layout.header);
        this.drawBody(page, layout, isFirst);
        this.drawPageFooter(pageNum, totalPages, title);
        this.drawWatermark();
    }

    canvasToBlob() {
        const format = this.settings.imageFormat;
        const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        const quality = format === 'png' ? undefined : this.settings.imageQuality;
        return new Promise((resolve, reject) => {
            this.elements.canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas export failed'));
            }, mime, quality);
        });
    }

    // ===== Generate =====
    async generate() {
        const text = this.elements.input.value.trim();
        const title = this.elements.articleTitle.value.trim();

        if (!text) {
            this.showDraftStatus('Enter some Kannada text first');
            this.elements.input.focus();
            return;
        }

        this.elements.generateBtn.classList.add('loading');
        this.elements.generateBtn.disabled = true;
        this.elements.generateBtn.setAttribute('aria-busy', 'true');

        try {
            await this.ensureFonts(text);

            const columnWidth = this.CANVAS_WIDTH - this.settings.padding * 2;
            let diagramError = false;
            const blocks = await window.prepareDiagrams(
                parseMarkdown(text), columnWidth, () => { diagramError = true; }
            );
            if (diagramError) this.showDraftStatus('Diagram unavailable — showing source');

            const layout = this.layout(blocks, title);
            if (!layout.pages.length) {
                this.showDraftStatus('Nothing to lay out — add some text');
                return;
            }

            this.releaseImages();
            const total = layout.pages.length;
            const ext = this.settings.imageFormat === 'jpeg' ? 'jpg' : this.settings.imageFormat;
            const pad = String(total).length;

            for (let i = 0; i < total; i++) {
                this.renderPage(layout.pages[i], layout, i + 1, total, title, i === 0);
                const blob = await this.canvasToBlob();
                // Zero-padded so the ZIP and every file browser list them in order.
                const name = `page-${String(i + 1).padStart(pad, '0')}.${ext}`;
                const url = URL.createObjectURL(blob);
                this.generatedImages.push({ blob, url, name });
                this.objectUrls.push(url);
                if (i < total - 1) await new Promise((r) => setTimeout(r, 0));
            }

            this.updatePreview();
            this.elements.downloadBtn.disabled = false;
            this.elements.pageCount.textContent = `${total} page${total === 1 ? '' : 's'}`;
            this.clearStale();
        } catch (error) {
            console.error('Generation error:', error);
            this.showDraftStatus('Could not compose — see console');
        } finally {
            this.elements.generateBtn.classList.remove('loading');
            this.elements.generateBtn.disabled = false;
            this.elements.generateBtn.removeAttribute('aria-busy');
        }
    }

    releaseImages() {
        this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
        this.objectUrls = [];
        this.generatedImages = [];
    }

    showVoid(container) {
        container.textContent = '';
        const blank = document.createElement('div');
        blank.className = 'void';
        blank.innerHTML =
            '<svg class="icon icon-xl" aria-hidden="true"><use href="#i-gauge"></use></svg>' +
            '<p class="void-title">Nothing set</p>' +
            '<p class="void-body">Paste Kannada text on the left, then compose.</p>';
        container.appendChild(blank);
    }

    updatePreview() {
        const container = this.elements.previewContainer;
        container.textContent = '';
        const total = this.generatedImages.length;

        if (!total) {
            this.showVoid(container);
            return;
        }

        const ratio = this.aspectRatios[this.settings.aspectRatio] || this.aspectRatios['4:5'];
        const pad = String(total).length;
        for (let index = 0; index < total; index += 1) {
            const image = this.generatedImages[index];
            if (!image) continue;
            const slug = String(index + 1).padStart(pad, '0');

            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'proof';
            card.setAttribute('aria-label', `Inspect page ${index + 1} of ${total}`);

            const frame = document.createElement('span');
            frame.className = 'proof-frame';

            const img = document.createElement('img');
            img.src = image.url;
            img.alt = `Composed page ${index + 1}`;
            img.loading = 'lazy';
            img.decoding = 'async';

            const mark = document.createElement('span');
            mark.className = 'proof-mark';
            mark.setAttribute('aria-hidden', 'true');
            mark.innerHTML = '<svg class="icon icon-sm"><use href="#i-expand"></use></svg>';
            frame.append(img, mark);

            const fig = document.createElement('span');
            fig.className = 'proof-slug';
            fig.innerHTML = `<span>${slug}</span><span>${ratio.width}×${ratio.height}</span>`;
            fig.setAttribute('aria-hidden', 'true');

            card.append(frame, fig);
            card.addEventListener('click', () => this.openModal(index));
            container.appendChild(card);
        }

        // Never leave the stage as an empty black panel.
        if (!container.children.length) this.showVoid(container);
    }

    // ===== Modal =====
    openModal(index) {
        const image = this.generatedImages[index];
        if (!image) return;
        this.currentPageIndex = index;
        this.lastFocused = document.activeElement;
        this.elements.modalImage.src = image.url;
        this.elements.modalImage.alt = `Composed page ${index + 1} of ${this.generatedImages.length}`;
        this.elements.previewModal.classList.add('is-open');
        this.elements.previewModal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        this.elements.modalClose.focus();
    }

    closeModal() {
        if (!this.elements.previewModal.classList.contains('is-open')) return;
        this.elements.previewModal.classList.remove('is-open');
        this.elements.previewModal.setAttribute('aria-hidden', 'true');
        this.elements.modalImage.removeAttribute('src');
        document.body.classList.remove('modal-open');
        if (this.lastFocused && typeof this.lastFocused.focus === 'function') this.lastFocused.focus();
    }

    async ensureFresh() {
        if (this.isDirty) await this.generate();
    }

    async downloadCurrentPage() {
        const image = this.generatedImages[this.currentPageIndex];
        if (!image) return;
        if (this.isDirty) await this.ensureFresh();
        const fresh = this.generatedImages[this.currentPageIndex];
        if (!fresh) return;
        this.saveBlob(fresh.blob, fresh.name);
    }

    saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    // ===== Download =====
    async downloadZip() {
        if (!this.generatedImages.length) {
            this.showDraftStatus('Compose the pages first');
            return;
        }
        if (this.isDirty) await this.ensureFresh();

        this.elements.downloadBtn.classList.add('loading');
        this.elements.downloadBtn.disabled = true;
        try {
            if (typeof JSZip === 'undefined') throw new Error('JSZip failed to load');
            const zip = new JSZip();
            for (const image of this.generatedImages) {
                zip.file(image.name, image.blob);
            }
            const content = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            const stamp = new Date().toISOString().slice(0, 10);
            const title = this.elements.articleTitle.value.trim().slice(0, 20).replace(/[\\/:*?"<>|]/g, '') || 'carousel';
            this.saveBlob(content, `${title}-${stamp}.zip`);
        } catch (error) {
            console.error('Download error:', error);
            this.showDraftStatus('Could not build the ZIP — see console');
        } finally {
            this.elements.downloadBtn.classList.remove('loading');
            this.elements.downloadBtn.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.carouselGenerator = new KannadaCarouselGenerator();
});
