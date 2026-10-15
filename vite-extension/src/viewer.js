/**
 * viewer.js — controller of the extension's PDF viewer (feature 37).
 * ---------------------------------------------------------------------------
 * Chrome's built-in PDF viewer can't run content scripts, so PDFs are opened
 * here instead: viewer.html?file=<PDF url>#page=N&item=<id>.
 *
 *   1. Check file:// access, load the PDF with PDF.js (viewer/pdf.js).
 *   2. Reuse the web capture UI (capture/ui.js) with a PDF adapter: one page
 *      per selection, anchors relative to that page's text layer, and
 *      `page` + `sourceTitle` stored on the item.
 *   3. Re-paint saved highlights page by page (viewer/anchoring.js) and
 *      answer the side panel's messages like content.js does.
 *
 * An extension page, not a content script: it imports storage.js directly.
 * ---------------------------------------------------------------------------
 */
import * as Store from './storage.js';
import { initCaptureUI } from './capture/ui.js';
import { paintRange } from './capture/paint.js';
import { openPdf } from './viewer/pdf.js';
import { createPdfAnchoring } from './viewer/anchoring.js';
import { parseViewerUrl, isOpenableUrl } from './viewer/source.js';

const ONE_PAGE_ONLY = 'Selecciona texto dentro de una sola página';
const SCANNED_HINT_PAGES = 2;

const els = {
  title: document.getElementById('vw-title'),
  page: document.getElementById('vw-page'),
  pages: document.getElementById('vw-pages'),
  zoomIn: document.getElementById('vw-zoom-in'),
  zoomOut: document.getElementById('vw-zoom-out'),
  zoomLevel: document.getElementById('vw-zoom-level'),
  native: document.getElementById('vw-native'),
  notice: document.getElementById('vw-notice'),
  container: document.getElementById('viewerContainer'),
  state: document.getElementById('vw-state'),
  stateTitle: document.getElementById('vw-state-title'),
  stateBody: document.getElementById('vw-state-body'),
  stateActions: document.getElementById('vw-state-actions'),
};

/**
 * Full-page message replacing the document (errors, missing file access).
 * @param {{title: string, body: string, actions?: {label: string, href?: string, onClick?: Function, ghost?: boolean}[]}} s
 */
function showState({ title, body, actions = [] }) {
  els.stateTitle.textContent = title;
  els.stateBody.textContent = body;
  els.stateActions.innerHTML = '';
  for (const a of actions) {
    const el = document.createElement(a.href ? 'a' : 'button');
    el.className = 'vw-state-action' + (a.ghost ? ' ghost' : '');
    el.textContent = a.label;
    if (a.href) el.href = a.href;
    else {
      el.type = 'button';
      el.addEventListener('click', a.onClick);
    }
    els.stateActions.appendChild(el);
  }
  els.state.hidden = false;
}

function showNotice(text) {
  els.notice.textContent = text;
  els.notice.hidden = false;
}

/** "Abrir en el visor de Chrome" — only for http(s); pages can't navigate to file://. */
function nativeViewerAction(pdfUrl) {
  return /^https?:/i.test(pdfUrl) ? [{ label: 'Abrir en el visor de Chrome', href: pdfUrl, ghost: true }] : [];
}

/** Spanish message for a PDF.js loading error. */
function describeLoadError(err) {
  switch (err && err.name) {
    case 'InvalidPDFException':
      return 'El archivo no es un PDF válido o está dañado.';
    case 'PasswordException':
      return 'Este PDF está protegido con contraseña; todavía no es compatible.';
    case 'ResponseException':
      return err.status
        ? `El servidor respondió con un error (${err.status}).`
        : 'No se pudo descargar el PDF.';
    default:
      return 'No se pudo cargar el PDF.';
  }
}

// ----- selection helpers (one text layer = one page) -----

function elementOf(node) {
  return node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function textLayerOf(node) {
  const el = elementOf(node);
  return el && el.closest ? el.closest('.textLayer') : null;
}

function pageNumberOf(node) {
  const el = elementOf(node);
  const pageEl = el && el.closest ? el.closest('.page[data-page-number]') : null;
  return pageEl ? Number(pageEl.dataset.pageNumber) : null;
}

/** Null when the selection sits inside one page's text layer, else the hint. */
function validateSelection(range) {
  if (!range) return ONE_PAGE_ONLY;
  const start = textLayerOf(range.startContainer);
  const end = textLayerOf(range.endContainer);
  return start && start === end ? null : ONE_PAGE_ONLY;
}

/**
 * PDF selections cross text-layer <br>s: Selection.toString() inserts
 * newlines there, Range.toString() doesn't. The readable note collapses
 * whitespace; the anchoring quote is the raw Range text (anchor space).
 */
function pdfSelectionText(sel, range) {
  return {
    text: sel.toString().replace(/\s+/g, ' ').trim(),
    rawText: range ? range.toString().trim() : sel.toString().trim(),
  };
}

// ----- toolbar (page indicator + zoom) -----

function wireToolbar(viewer, eventBus) {
  const renderZoom = () => {
    els.zoomLevel.textContent = Math.round(viewer.currentScale * 100) + '%';
  };
  eventBus.on('pagesinit', () => {
    els.pages.textContent = String(viewer.pagesCount);
    els.page.textContent = String(viewer.currentPageNumber);
  });
  eventBus.on('pagechanging', ({ pageNumber }) => {
    els.page.textContent = String(pageNumber);
  });
  eventBus.on('scalechanging', renderZoom);
  els.zoomIn.addEventListener('click', () => viewer.increaseScale());
  els.zoomOut.addEventListener('click', () => viewer.decreaseScale());
}

/** Non-blocking hint when the first rendered pages have no text at all. */
function watchForScannedPdf(eventBus) {
  let empty = 0;
  let sawText = false;
  const onRendered = ({ source }) => {
    const hasText = !!(source?.textLayer?.div?.textContent || '').trim();
    if (hasText) sawText = true;
    else empty++;
    if (sawText) eventBus.off('textlayerrendered', onRendered);
    else if (empty >= SCANNED_HINT_PAGES) {
      showNotice('Este PDF no tiene texto seleccionable (¿es un escaneo?). No se puede resaltar.');
      eventBus.off('textlayerrendered', onRendered);
    }
  };
  eventBus.on('textlayerrendered', onRendered);
}

// ----- side panel messaging (same contract as content.js) -----

function wireMessaging(pdfUrl, anchoring) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'CH_GET_ANCHOR_STATUS') {
      sendResponse({ url: pdfUrl, statuses: anchoring.statuses() });
    } else if (msg.type === 'CH_SCROLL_TO_ITEM') {
      anchoring.scrollTo(msg.itemId);
    } else if (msg.type === 'CH_REMOVE_HL') {
      anchoring.remove(msg.itemId);
    }
  });
}

async function loadSavedItems(pdfUrl) {
  const data = await Store.readAll();
  const items = [];
  for (const ctx of Object.values(data.contexts || {})) {
    for (const it of ctx.items || []) {
      if (it.sourceUrl === pdfUrl && Store.isPdfItem(it) && it.rangePrefix != null) items.push(it);
    }
  }
  return items;
}

async function main() {
  const { file: pdfUrl, page, itemId } = parseViewerUrl(location.href);
  if (!pdfUrl || !isOpenableUrl(pdfUrl)) {
    showState({ title: 'No hay ningún PDF para abrir', body: 'Abre un PDF y usa "Abrir en Active Reading".' });
    return;
  }

  const sourceTitle = Store.pdfFilename(pdfUrl);
  document.title = sourceTitle + ' — Active Reading';
  els.title.textContent = sourceTitle;
  els.title.title = pdfUrl;
  if (/^https?:/i.test(pdfUrl)) {
    els.native.href = pdfUrl;
    els.native.hidden = false;
  }

  if (/^file:/i.test(pdfUrl) && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    showState({
      title: 'Activa el acceso a archivos locales',
      body:
        'Para abrir PDFs guardados en tu computadora, activa "Permitir acceso a URLs de archivo" ' +
        'en los detalles de Active Reading y vuelve a cargar esta pestaña.',
      actions: [
        {
          label: 'Abrir ajustes de la extensión',
          onClick: () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
        },
      ],
    });
    return;
  }

  // Read storage up front: everything that listens to PDF.js events must be
  // registered synchronously in beforeAttach (see openPdf).
  const savedItems = await loadSavedItems(pdfUrl);
  let anchoring = null;

  try {
    await openPdf(pdfUrl, els.container, ({ viewer, eventBus }) => {
      wireToolbar(viewer, eventBus);
      watchForScannedPdf(eventBus);
      anchoring = createPdfAnchoring({ pdfUrl, viewer, eventBus, items: savedItems });
      eventBus.on('pagesinit', () => {
        viewer.currentScaleValue = 'auto';
        if (page && page <= viewer.pagesCount) viewer.currentPageNumber = page;
        if (itemId) anchoring.scrollTo(itemId);
        anchoring.notify();
      });
    });
  } catch (err) {
    console.warn('[CH] PDF load failed:', err);
    showState({ title: 'No se pudo abrir el PDF', body: describeLoadError(err), actions: nativeViewerAction(pdfUrl) });
    return;
  }
  wireMessaging(pdfUrl, anchoring);

  initCaptureUI({
    store: Store,
    getSourceUrl: () => pdfUrl,
    getAnchorRoot: (range) => (range ? textLayerOf(range.startContainer) : null),
    getCaptureMeta: (range) => ({
      page: range ? pageNumberOf(range.startContainer) : null,
      sourceTitle,
      source: sourceTitle,
    }),
    validateSelection,
    getSelectionText: pdfSelectionText,
    afterSave(item, range, { category, ctxId, fast }) {
      if (range && item) {
        paintRange(range.cloneRange(), category, item.id);
        anchoring.noteLive(item);
      }
      if (fast) chrome.runtime.sendMessage({ type: 'CH_OPEN_PANEL_CTX', ctxId }).catch(() => {});
    },
  });
}

main();
