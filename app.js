/**
 * Kannada Carousel Post Generator - Enhanced Version
 * Features: Multiple themes, fonts, aspect ratios, watermark, draft saving
 */

class KannadaCarouselGenerator {
    constructor() {
        // Base canvas dimensions (will be adjusted by aspect ratio)
        this.BASE_WIDTH = 1080;

        // Aspect ratio configurations
        this.aspectRatios = {
            '4:5': { width: 1080, height: 1350 },
            '1:1': { width: 1080, height: 1080 },
            '9:16': { width: 1080, height: 1920 }
        };

        // Theme configurations
        this.themes = {
            oldPaper: {
                background: '#e8dcc8',
                text: '#3d2e1f',
                accent: 'rgba(100, 70, 40, 0.2)'
            },
            cream: {
                background: '#f4f0e5',
                text: '#2d2419',
                accent: 'rgba(139, 119, 101, 0.15)'
            },
            white: {
                background: '#ffffff',
                text: '#1a1a1a',
                accent: 'rgba(0, 0, 0, 0.08)'
            },
            dark: {
                background: '#1a1a24',
                text: '#e8e8ed',
                accent: 'rgba(255, 255, 255, 0.1)'
            },
            custom: {
                background: '#f4f0e5',
                text: '#2d2419',
                accent: 'rgba(139, 119, 101, 0.15)'
            }
        };

        // Font configurations
        this.fonts = {
            'Noto Serif Kannada': { fallback: 'serif', loaded: false },
            'Noto Sans Kannada': { fallback: 'sans-serif', loaded: false },
            'Baloo Tamma 2': { fallback: 'cursive', loaded: false },
            'Tiro Kannada': { fallback: 'serif', loaded: false }
        };

        // Settings with defaults
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
            showTitleHeader: true,
            enableDropCap: false,
            customBgColor: '#f4f0e5',
            customTextColor: '#2d2419'
        };

        // State
        this.generatedImages = [];
        this.customBgImage = null;
        this.watermarkImage = null;
        this.watermarkPosition = 'bottom-right';
        this.watermarkOpacity = 0.5;
        this.undoStack = [];
        this.redoStack = [];
        this.currentPageIndex = 0;

        this.initDOM();
        this.initCanvas();
        this.bindEvents();
        this.loadDraft();
        this.loadThemePreference();
    }

    initDOM() {
        this.elements = {
            // Inputs
            articleTitle: document.getElementById('articleTitle'),
            input: document.getElementById('kannadaInput'),

            // Theme & Visual
            bgTheme: document.getElementById('bgTheme'),
            customColorRow: document.getElementById('customColorRow'),
            customBgColor: document.getElementById('customBgColor'),
            customTextColor: document.getElementById('customTextColor'),
            pageStyle: document.getElementById('pageStyle'),
            bgImage: document.getElementById('bgImage'),
            clearBgImage: document.getElementById('clearBgImage'),
            showTitleHeader: document.getElementById('showTitleHeader'),
            enableDropCap: document.getElementById('enableDropCap'),

            // Typography
            fontFamily: document.getElementById('fontFamily'),
            fontSize: document.getElementById('fontSize'),
            fontSizeValue: document.getElementById('fontSizeValue'),
            lineHeight: document.getElementById('lineHeight'),
            lineHeightValue: document.getElementById('lineHeightValue'),
            padding: document.getElementById('padding'),
            paddingValue: document.getElementById('paddingValue'),
            alignmentBtns: document.querySelectorAll('.align-btn'),

            // Export
            aspectRatio: document.getElementById('aspectRatio'),
            imageFormat: document.getElementById('imageFormat'),
            qualityRow: document.getElementById('qualityRow'),
            imageQuality: document.getElementById('imageQuality'),
            imageQualityValue: document.getElementById('imageQualityValue'),
            watermarkImage: document.getElementById('watermarkImage'),
            clearWatermark: document.getElementById('clearWatermark'),
            watermarkPositionRow: document.getElementById('watermarkPositionRow'),
            watermarkPosition: document.getElementById('watermarkPosition'),
            watermarkOpacityRow: document.getElementById('watermarkOpacityRow'),
            watermarkOpacity: document.getElementById('watermarkOpacity'),
            watermarkOpacityValue: document.getElementById('watermarkOpacityValue'),

            // Actions
            generateBtn: document.getElementById('generateBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            saveDraftBtn: document.getElementById('saveDraftBtn'),
            clearDraftBtn: document.getElementById('clearDraftBtn'),

            // Preview
            previewContainer: document.getElementById('previewContainer'),
            pageCount: document.getElementById('pageCount'),
            draftStatus: document.getElementById('draftStatus'),

            // Modal
            previewModal: document.getElementById('previewModal'),
            modalImage: document.getElementById('modalImage'),
            modalClose: document.getElementById('modalClose'),
            modalDownload: document.getElementById('modalDownload'),

            // Theme toggle
            themeToggle: document.getElementById('themeToggle'),

            // Canvas
            canvas: document.getElementById('renderCanvas')
        };
    }

    initCanvas() {
        this.ctx = this.elements.canvas.getContext('2d');
        this.updateCanvasSize();
    }

    updateCanvasSize() {
        const ratio = this.aspectRatios[this.settings.aspectRatio];
        this.elements.canvas.width = ratio.width;
        this.elements.canvas.height = ratio.height;
        this.CANVAS_WIDTH = ratio.width;
        this.CANVAS_HEIGHT = ratio.height;
    }

    bindEvents() {
        // Generate & Download
        this.elements.generateBtn.addEventListener('click', () => this.generate());
        this.elements.downloadBtn.addEventListener('click', () => this.downloadZip());

        // Theme selection
        this.elements.bgTheme.addEventListener('change', (e) => {
            this.settings.theme = e.target.value;
            this.elements.customColorRow.style.display =
                e.target.value === 'custom' ? 'flex' : 'none';
        });

        // Custom colors
        this.elements.customBgColor.addEventListener('input', (e) => {
            this.settings.customBgColor = e.target.value;
            this.themes.custom.background = e.target.value;
        });
        this.elements.customTextColor.addEventListener('input', (e) => {
            this.settings.customTextColor = e.target.value;
            this.themes.custom.text = e.target.value;
        });

        // Page style
        this.elements.pageStyle.addEventListener('change', (e) => {
            this.settings.pageStyle = e.target.value;
        });

        // Background image
        this.elements.bgImage.addEventListener('change', (e) => this.handleBgImageUpload(e));
        this.elements.clearBgImage.addEventListener('click', () => this.clearBgImage());

        // Checkboxes
        this.elements.showTitleHeader.addEventListener('change', (e) => {
            this.settings.showTitleHeader = e.target.checked;
        });
        this.elements.enableDropCap.addEventListener('change', (e) => {
            this.settings.enableDropCap = e.target.checked;
        });

        // Font family
        this.elements.fontFamily.addEventListener('change', (e) => {
            this.settings.fontFamily = e.target.value;
        });

        // Sliders
        this.elements.fontSize.addEventListener('input', (e) => {
            this.settings.fontSize = parseInt(e.target.value);
            this.elements.fontSizeValue.textContent = `${e.target.value}px`;
        });
        this.elements.lineHeight.addEventListener('input', (e) => {
            this.settings.lineHeight = parseFloat(e.target.value);
            this.elements.lineHeightValue.textContent = e.target.value;
        });
        this.elements.padding.addEventListener('input', (e) => {
            this.settings.padding = parseInt(e.target.value);
            this.elements.paddingValue.textContent = `${e.target.value}px`;
        });

        // Text alignment
        this.elements.alignmentBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.alignmentBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.settings.textAlign = btn.dataset.align;
            });
        });

        // Aspect ratio
        this.elements.aspectRatio.addEventListener('change', (e) => {
            this.settings.aspectRatio = e.target.value;
            this.updateCanvasSize();
        });

        // Image format
        this.elements.imageFormat.addEventListener('change', (e) => {
            this.settings.imageFormat = e.target.value;
        });

        // Image quality
        this.elements.imageQuality.addEventListener('input', (e) => {
            this.settings.imageQuality = parseFloat(e.target.value);
            this.elements.imageQualityValue.textContent = `${Math.round(e.target.value * 100)}%`;
        });

        // Watermark
        this.elements.watermarkImage.addEventListener('change', (e) => this.handleWatermarkUpload(e));
        this.elements.clearWatermark.addEventListener('click', () => this.clearWatermark());
        this.elements.watermarkPosition.addEventListener('change', (e) => {
            this.watermarkPosition = e.target.value;
        });
        this.elements.watermarkOpacity.addEventListener('input', (e) => {
            this.watermarkOpacity = parseFloat(e.target.value);
            this.elements.watermarkOpacityValue.textContent = `${Math.round(e.target.value * 100)}%`;
        });

        // Draft management
        this.elements.saveDraftBtn.addEventListener('click', () => this.saveDraft());
        this.elements.clearDraftBtn.addEventListener('click', () => this.clearDraft());

        // Auto-save on input change
        this.elements.input.addEventListener('input', () => this.autoSaveDraft());
        this.elements.articleTitle.addEventListener('input', () => this.autoSaveDraft());

        // Modal
        this.elements.modalClose.addEventListener('click', () => this.closeModal());
        this.elements.previewModal.addEventListener('click', (e) => {
            if (e.target === this.elements.previewModal) this.closeModal();
        });
        this.elements.modalDownload.addEventListener('click', () => this.downloadCurrentPage());

        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => this.toggleAppTheme());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Undo/Redo tracking
        this.elements.input.addEventListener('beforeinput', () => {
            this.pushToUndoStack();
        });
    }

    // ===== Image Upload Handlers =====
    handleBgImageUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.customBgImage = img;
                    this.elements.clearBgImage.style.display = 'inline-block';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    clearBgImage() {
        this.customBgImage = null;
        this.elements.bgImage.value = '';
        this.elements.clearBgImage.style.display = 'none';
    }

    handleWatermarkUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.watermarkImage = img;
                    this.elements.clearWatermark.style.display = 'inline-block';
                    this.elements.watermarkPositionRow.style.display = 'flex';
                    this.elements.watermarkOpacityRow.style.display = 'flex';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    clearWatermark() {
        this.watermarkImage = null;
        this.elements.watermarkImage.value = '';
        this.elements.clearWatermark.style.display = 'none';
        this.elements.watermarkPositionRow.style.display = 'none';
        this.elements.watermarkOpacityRow.style.display = 'none';
    }

    // ===== Theme Management =====
    toggleAppTheme() {
        const currentTheme = document.body.dataset.theme;
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.body.dataset.theme = newTheme;
        this.elements.themeToggle.querySelector('.theme-icon').textContent =
            newTheme === 'light' ? '☀️' : '🌙';
        localStorage.setItem('appTheme', newTheme);
    }

    loadThemePreference() {
        const savedTheme = localStorage.getItem('appTheme') || 'dark';
        document.body.dataset.theme = savedTheme;
        this.elements.themeToggle.querySelector('.theme-icon').textContent =
            savedTheme === 'light' ? '☀️' : '🌙';
    }

    // ===== Draft Management =====
    saveDraft() {
        const draft = {
            title: this.elements.articleTitle.value,
            content: this.elements.input.value,
            settings: this.settings,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('kannadaCarouselDraft', JSON.stringify(draft));
        this.showDraftStatus('Draft saved!');
    }

    autoSaveDraft() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveDraft();
        }, 2000);
    }

    loadDraft() {
        const saved = localStorage.getItem('kannadaCarouselDraft');
        if (saved) {
            try {
                const draft = JSON.parse(saved);
                this.elements.articleTitle.value = draft.title || '';
                this.elements.input.value = draft.content || '';
                if (draft.settings) {
                    Object.assign(this.settings, draft.settings);
                    this.applyLoadedSettings();
                }
                this.showDraftStatus('Draft restored');
            } catch (e) {
                console.warn('Could not load draft:', e);
            }
        }
    }

    applyLoadedSettings() {
        this.elements.fontFamily.value = this.settings.fontFamily;
        this.elements.fontSize.value = this.settings.fontSize;
        this.elements.fontSizeValue.textContent = `${this.settings.fontSize}px`;
        this.elements.lineHeight.value = this.settings.lineHeight;
        this.elements.lineHeightValue.textContent = this.settings.lineHeight;
        this.elements.padding.value = this.settings.padding;
        this.elements.paddingValue.textContent = `${this.settings.padding}px`;
        this.elements.bgTheme.value = this.settings.theme;
        this.elements.pageStyle.value = this.settings.pageStyle;
        this.elements.aspectRatio.value = this.settings.aspectRatio;
        this.elements.imageFormat.value = this.settings.imageFormat;
        this.elements.showTitleHeader.checked = this.settings.showTitleHeader;
        this.elements.enableDropCap.checked = this.settings.enableDropCap;

        // Update alignment buttons
        this.elements.alignmentBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === this.settings.textAlign);
        });

        this.updateCanvasSize();
    }

    clearDraft() {
        if (confirm('Clear all saved content?')) {
            localStorage.removeItem('kannadaCarouselDraft');
            this.elements.articleTitle.value = '';
            this.elements.input.value = '';
            this.showDraftStatus('Draft cleared');
        }
    }

    showDraftStatus(message) {
        this.elements.draftStatus.textContent = message;
        setTimeout(() => {
            this.elements.draftStatus.textContent = '';
        }, 3000);
    }

    // ===== Undo/Redo =====
    pushToUndoStack() {
        this.undoStack.push(this.elements.input.value);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length > 0) {
            this.redoStack.push(this.elements.input.value);
            this.elements.input.value = this.undoStack.pop();
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            this.undoStack.push(this.elements.input.value);
            this.elements.input.value = this.redoStack.pop();
        }
    }

    // ===== Font Loading =====
    async loadFont(fontFamily) {
        if (this.fonts[fontFamily]?.loaded) return;

        try {
            await document.fonts.load(`${this.settings.fontSize}px "${fontFamily}"`);
            await document.fonts.ready;
            this.fonts[fontFamily].loaded = true;
        } catch (e) {
            console.warn(`Font loading issue for ${fontFamily}:`, e);
        }
    }

    // ===== Text Processing =====
    calculateLinesPerPage() {
        const padding = this.settings.padding;
        const lineHeightPx = this.settings.fontSize * this.settings.lineHeight;
        // Optimized height: subtract padding and a small buffer (40px) for descenders/border clearance
        let availableHeight = this.CANVAS_HEIGHT - (padding * 2) - 40;

        return Math.floor(availableHeight / lineHeightPx);
    }

    wrapText(text, maxWidth) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = '';
        const punctuationThreshold = maxWidth * 0.70; // Prefer break at punctuation if line is >70% full

        for (const word of words) {
            if (!word) continue;
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const testWidth = this.ctx.measureText(testLine).width;

            if (testWidth > maxWidth && currentLine) {
                // Must break - line is full
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
                // Prefer breaking after sentence punctuation when line is reasonably full
                if (/[.!?।॥]$/.test(word) && testWidth > punctuationThreshold) {
                    lines.push(currentLine);
                    currentLine = '';
                }
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    splitTextIntoPages(text, hasHeader) {
        const ctx = this.ctx;
        const padding = this.settings.padding;
        const maxWidth = this.CANVAS_WIDTH - (padding * 2);
        let linesPerPage = this.calculateLinesPerPage();

        ctx.font = `${this.settings.fontSize}px "${this.settings.fontFamily}", ${this.fonts[this.settings.fontFamily]?.fallback || 'serif'}`;

        const pages = [];
        let currentPageLines = [];
        let isFirstPage = true;

        // Adjust first page if header is shown
        let firstPageLines = linesPerPage;
        if (hasHeader && this.settings.showTitleHeader) {
            firstPageLines -= 3; // Reserve space for header
        }

        const paragraphs = text.split(/\n\n+/);

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
            const paragraph = paragraphs[pIdx].trim();
            if (!paragraph) continue;

            const wrappedLines = this.wrapText(paragraph, maxWidth);

            for (let i = 0; i < wrappedLines.length; i++) {
                const line = wrappedLines[i];
                const maxLines = isFirstPage ? firstPageLines : linesPerPage;

                // If adding this line would exceed the limit
                if (currentPageLines.length >= maxLines) {
                    // Page is full. We need to split.
                    // Optimized breaking: Strong (4 lines), Weak (6 lines)
                    let breakIndex = currentPageLines.length;
                    let foundBreak = false;

                    // Pass 1: Strong breaks (. ! ? । ॥) - last 4 lines
                    const strongLimit = Math.min(currentPageLines.length, 4);
                    for (let back = 0; back < strongLimit; back++) {
                        const idx = currentPageLines.length - 1 - back;
                        const checkLine = currentPageLines[idx];
                        if (/[.!?।॥]\s*$/.test(checkLine)) {
                            breakIndex = idx + 1;
                            foundBreak = true;
                            break;
                        }
                    }

                    // Pass 2: Weak breaks (, ; -) - last 6 lines
                    if (!foundBreak) {
                        const weakLimit = Math.min(currentPageLines.length, 6);
                        for (let back = 0; back < weakLimit; back++) {
                            const idx = currentPageLines.length - 1 - back;
                            const checkLine = currentPageLines[idx];
                            if (/[,;\-]\s*$/.test(checkLine)) {
                                breakIndex = idx + 1;
                                foundBreak = true;
                                break;
                            }
                        }
                    }

                    // Move lines that should go to next page
                    const carryOver = currentPageLines.splice(breakIndex);

                    pages.push([...currentPageLines]);
                    currentPageLines = carryOver;
                    isFirstPage = false;
                }

                currentPageLines.push(line);
            }

            // Paragraph break (add blank line if not at very end of page)
            const maxLines = isFirstPage ? firstPageLines : linesPerPage;
            if (pIdx < paragraphs.length - 1 && currentPageLines.length < maxLines) {
                currentPageLines.push('');
            }
        }

        if (currentPageLines.length > 0) {
            pages.push(currentPageLines);
        }

        return pages;
    }

    // ===== Drawing Functions =====
    drawBackground() {
        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];

        // Draw custom background image if available
        if (this.customBgImage) {
            ctx.drawImage(this.customBgImage, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
            // Add overlay for text readability
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
            return;
        }

        // Base color
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

        // Add paper texture for paper themes
        if (['oldPaper', 'cream'].includes(this.settings.theme)) {
            ctx.save();
            for (let i = 0; i < 4000; i++) {
                const x = Math.random() * this.CANVAS_WIDTH;
                const y = Math.random() * this.CANVAS_HEIGHT;
                const opacity = Math.random() * 0.04;
                ctx.fillStyle = `rgba(139, 119, 101, ${opacity})`;
                ctx.fillRect(x, y, 1, 1);
            }
            ctx.restore();
        }

        // Add gradient for depth
        const gradient = ctx.createRadialGradient(
            this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2, 0,
            this.CANVAS_WIDTH / 2, this.CANVAS_HEIGHT / 2, this.CANVAS_WIDTH * 0.8
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
        gradient.addColorStop(1, theme.accent);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    }

    drawPageStyle() {
        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];
        const padding = 25;

        switch (this.settings.pageStyle) {
            case 'border':
                ctx.strokeStyle = theme.accent;
                ctx.lineWidth = 2;
                ctx.strokeRect(padding, padding, this.CANVAS_WIDTH - padding * 2, this.CANVAS_HEIGHT - padding * 2);
                break;

            case 'vintage':
                // Corner ornaments
                this.drawCornerOrnament(ctx, padding, padding, 1, 1, theme);
                this.drawCornerOrnament(ctx, this.CANVAS_WIDTH - padding, padding, -1, 1, theme);
                this.drawCornerOrnament(ctx, padding, this.CANVAS_HEIGHT - padding, 1, -1, theme);
                this.drawCornerOrnament(ctx, this.CANVAS_WIDTH - padding, this.CANVAS_HEIGHT - padding, -1, -1, theme);
                break;

            case 'minimal':
                ctx.strokeStyle = theme.accent;
                ctx.lineWidth = 1;
                // Top and bottom lines only
                ctx.beginPath();
                ctx.moveTo(this.settings.padding, padding + 10);
                ctx.lineTo(this.CANVAS_WIDTH - this.settings.padding, padding + 10);
                ctx.moveTo(this.settings.padding, this.CANVAS_HEIGHT - padding - 10);
                ctx.lineTo(this.CANVAS_WIDTH - this.settings.padding, this.CANVAS_HEIGHT - padding - 10);
                ctx.stroke();
                break;
        }
    }

    drawCornerOrnament(ctx, x, y, dirX, dirY, theme) {
        ctx.save();
        ctx.strokeStyle = theme.accent.replace('0.15', '0.4');
        ctx.lineWidth = 2;
        ctx.beginPath();

        // Decorative corner flourish
        const size = 40;
        ctx.moveTo(x, y + dirY * size);
        ctx.quadraticCurveTo(x, y, x + dirX * size, y);

        // Inner curve
        ctx.moveTo(x + dirX * 10, y + dirY * size * 0.6);
        ctx.quadraticCurveTo(x + dirX * 10, y + dirY * 10, x + dirX * size * 0.6, y + dirY * 10);

        ctx.stroke();
        ctx.restore();
    }

    drawTitleHeader(title) {
        if (!title || !this.settings.showTitleHeader) return;

        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];
        const padding = this.settings.padding;

        ctx.save();

        // Title styling
        const titleSize = Math.min(this.settings.fontSize * 1.5, 48);
        ctx.font = `bold ${titleSize}px "${this.settings.fontFamily}", serif`;
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw title
        const titleY = padding + 30;
        ctx.fillText(title, this.CANVAS_WIDTH / 2, titleY);

        // Decorative line under title
        const titleWidth = Math.min(ctx.measureText(title).width + 60, this.CANVAS_WIDTH - padding * 2);
        ctx.strokeStyle = theme.accent.replace('0.15', '0.3');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo((this.CANVAS_WIDTH - titleWidth) / 2, titleY + titleSize + 15);
        ctx.lineTo((this.CANVAS_WIDTH + titleWidth) / 2, titleY + titleSize + 15);
        ctx.stroke();

        ctx.restore();

        return titleSize + 50; // Return header height
    }

    drawDropCap(firstChar, x, y, maxWidth) {
        if (!this.settings.enableDropCap || !firstChar) return 0;

        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];
        const dropCapSize = this.settings.fontSize * 3;

        ctx.save();
        ctx.font = `bold ${dropCapSize}px "${this.settings.fontFamily}", serif`;
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(firstChar, x, y);

        const charWidth = ctx.measureText(firstChar).width + 10;
        ctx.restore();

        return charWidth;
    }

    drawPageFooter(pageNum, totalPages, title) {
        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];
        const padding = this.settings.padding;
        const footerY = this.CANVAS_HEIGHT - 55;

        ctx.save();

        // Footer line
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, footerY - 15);
        ctx.lineTo(this.CANVAS_WIDTH - padding, footerY - 15);
        ctx.stroke();

        ctx.fillStyle = theme.text;
        ctx.globalAlpha = 0.6;

        // Title on left
        if (title) {
            ctx.font = `18px "${this.settings.fontFamily}", serif`;
            ctx.textAlign = 'left';
            let displayTitle = title;
            const maxWidth = this.CANVAS_WIDTH - padding * 2 - 80;
            while (ctx.measureText(displayTitle).width > maxWidth && displayTitle.length > 0) {
                displayTitle = displayTitle.slice(0, -1);
            }
            if (displayTitle !== title) displayTitle += '...';
            ctx.fillText(displayTitle, padding, footerY);
        }

        // Page number on right
        ctx.font = '20px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${pageNum} / ${totalPages}`, this.CANVAS_WIDTH - padding, footerY);

        ctx.restore();
    }

    drawWatermark() {
        if (!this.watermarkImage) return;

        const ctx = this.ctx;
        const padding = 30;
        const maxSize = 120;

        // Calculate watermark size (maintain aspect ratio)
        let width = this.watermarkImage.width;
        let height = this.watermarkImage.height;
        const scale = Math.min(maxSize / width, maxSize / height);
        width *= scale;
        height *= scale;

        // Calculate position
        let x, y;
        switch (this.watermarkPosition) {
            case 'top-left':
                x = padding; y = padding;
                break;
            case 'top-right':
                x = this.CANVAS_WIDTH - width - padding; y = padding;
                break;
            case 'bottom-left':
                x = padding; y = this.CANVAS_HEIGHT - height - padding - 50;
                break;
            case 'bottom-right':
                x = this.CANVAS_WIDTH - width - padding; y = this.CANVAS_HEIGHT - height - padding - 50;
                break;
            case 'center':
                x = (this.CANVAS_WIDTH - width) / 2; y = (this.CANVAS_HEIGHT - height) / 2;
                break;
            default:
                x = this.CANVAS_WIDTH - width - padding; y = this.CANVAS_HEIGHT - height - padding - 50;
        }

        ctx.save();
        ctx.globalAlpha = this.watermarkOpacity;
        ctx.drawImage(this.watermarkImage, x, y, width, height);
        ctx.restore();
    }

    renderPage(lines, pageNum, totalPages, title, isFirstPage) {
        const ctx = this.ctx;
        const theme = this.themes[this.settings.theme];
        const padding = this.settings.padding;

        ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

        // Draw background
        this.drawBackground();

        // Draw page style/decorations
        this.drawPageStyle();

        // Draw title header on first page
        let headerOffset = 0;
        if (isFirstPage && title && this.settings.showTitleHeader) {
            headerOffset = this.drawTitleHeader(title);
        }

        // Set text style
        ctx.font = `${this.settings.fontSize}px "${this.settings.fontFamily}", ${this.fonts[this.settings.fontFamily]?.fallback || 'serif'}`;
        ctx.fillStyle = theme.text;
        ctx.textBaseline = 'top';

        const lineHeightPx = this.settings.fontSize * this.settings.lineHeight;
        const maxWidth = this.CANVAS_WIDTH - (padding * 2);

        let y = padding + 30 + headerOffset;
        let dropCapWidth = 0;
        let dropCapLines = 0;

        // Handle drop cap on first page
        if (isFirstPage && this.settings.enableDropCap && lines.length > 0 && lines[0]) {
            const firstLine = lines[0];
            const firstChar = firstLine.charAt(0);
            dropCapWidth = this.drawDropCap(firstChar, padding, y, maxWidth);
            dropCapLines = 3;
            lines[0] = firstLine.substring(1).trim();
        }

        // Render lines
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) {
                y += lineHeightPx;
                continue;
            }

            // Set alignment
            let textX = padding;
            const currentMaxWidth = (i < dropCapLines && isFirstPage) ? maxWidth - dropCapWidth : maxWidth;
            const textXOffset = (i < dropCapLines && isFirstPage) ? dropCapWidth : 0;

            switch (this.settings.textAlign) {
                case 'center':
                    ctx.textAlign = 'center';
                    textX = this.CANVAS_WIDTH / 2;
                    break;
                case 'justify':
                    ctx.textAlign = 'left';
                    textX = padding + textXOffset;
                    // Basic justify - space out words
                    if (i < lines.length - 1 && line.trim()) {
                        this.drawJustifiedText(ctx, line, textX, y, currentMaxWidth - textXOffset);
                        y += lineHeightPx;
                        continue;
                    }
                    break;
                default:
                    ctx.textAlign = 'left';
                    textX = padding + textXOffset;
            }

            ctx.fillText(line, textX, y);
            y += lineHeightPx;
        }

        // Draw page footer
        this.drawPageFooter(pageNum, totalPages, title);

        // Draw watermark
        this.drawWatermark();

        // Return as data URL
        const format = this.settings.imageFormat === 'jpeg' ? 'image/jpeg' :
            this.settings.imageFormat === 'webp' ? 'image/webp' : 'image/png';
        const quality = this.settings.imageFormat === 'png' ? 1 : this.settings.imageQuality;

        return this.elements.canvas.toDataURL(format, quality);
    }

    drawJustifiedText(ctx, text, x, y, maxWidth) {
        const words = text.split(/\s+/);
        if (words.length <= 1) {
            ctx.fillText(text, x, y);
            return;
        }

        const totalTextWidth = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
        const totalSpace = maxWidth - totalTextWidth;
        const spaceWidth = totalSpace / (words.length - 1);

        let currentX = x;
        for (let i = 0; i < words.length; i++) {
            ctx.fillText(words[i], currentX, y);
            currentX += ctx.measureText(words[i]).width + spaceWidth;
        }
    }

    // ===== Generate =====
    async generate() {
        const text = this.elements.input.value.trim();
        const title = this.elements.articleTitle.value.trim();

        if (!text) {
            alert('Please enter some Kannada text first!');
            return;
        }

        this.elements.generateBtn.classList.add('loading');
        this.elements.generateBtn.disabled = true;

        try {
            await this.loadFont(this.settings.fontFamily);
            await new Promise(resolve => setTimeout(resolve, 150));

            const pages = this.splitTextIntoPages(text, !!title);
            this.generatedImages = [];

            for (let i = 0; i < pages.length; i++) {
                const imageData = this.renderPage(pages[i], i + 1, pages.length, title, i === 0);
                const ext = this.settings.imageFormat === 'jpeg' ? 'jpg' : this.settings.imageFormat;
                this.generatedImages.push({
                    data: imageData,
                    name: `page-${i + 1}.${ext}`
                });
            }

            this.updatePreview();
            this.elements.downloadBtn.disabled = false;
            this.elements.pageCount.textContent = `${pages.length} page${pages.length !== 1 ? 's' : ''}`;

        } catch (error) {
            console.error('Generation error:', error);
            alert('Error generating images. Please try again.');
        } finally {
            this.elements.generateBtn.classList.remove('loading');
            this.elements.generateBtn.disabled = false;
        }
    }

    updatePreview() {
        this.elements.previewContainer.innerHTML = '';

        if (this.generatedImages.length === 0) {
            this.elements.previewContainer.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📝</span>
                    <p>Enter text and click "Generate Preview" to see your carousel cards</p>
                </div>
            `;
            return;
        }

        this.generatedImages.forEach((image, index) => {
            const card = document.createElement('div');
            card.className = 'preview-card';
            card.innerHTML = `
                <img src="${image.data}" alt="Page ${index + 1}">
                <div class="card-overlay"><span>👁️</span></div>
                <span class="page-number">${index + 1}</span>
            `;

            card.addEventListener('click', () => this.openModal(index));
            this.elements.previewContainer.appendChild(card);
        });
    }

    // ===== Modal =====
    openModal(index) {
        this.currentPageIndex = index;
        this.elements.modalImage.src = this.generatedImages[index].data;
        this.elements.previewModal.classList.add('active');
    }

    closeModal() {
        this.elements.previewModal.classList.remove('active');
    }

    downloadCurrentPage() {
        const image = this.generatedImages[this.currentPageIndex];
        if (image) {
            const link = document.createElement('a');
            link.download = image.name;
            link.href = image.data;
            link.click();
        }
    }

    // ===== Download =====
    async downloadZip() {
        if (this.generatedImages.length === 0) {
            alert('Please generate images first!');
            return;
        }

        this.elements.downloadBtn.classList.add('loading');
        this.elements.downloadBtn.disabled = true;

        try {
            const zip = new JSZip();

            for (const image of this.generatedImages) {
                const base64Data = image.data.split(',')[1];
                zip.file(image.name, base64Data, { base64: true });
            }

            const content = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const timestamp = new Date().toISOString().slice(0, 10);
            const title = this.elements.articleTitle.value.trim().slice(0, 20) || 'carousel';
            saveAs(content, `${title}-${timestamp}.zip`);

        } catch (error) {
            console.error('Download error:', error);
            alert('Error creating ZIP file. Please try again.');
        } finally {
            this.elements.downloadBtn.classList.remove('loading');
            this.elements.downloadBtn.disabled = false;
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.carouselGenerator = new KannadaCarouselGenerator();
});
