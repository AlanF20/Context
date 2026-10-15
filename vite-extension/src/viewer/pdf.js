/**
 * viewer/pdf.js — PDF.js setup for the extension's PDF viewer (feature 37).
 * ---------------------------------------------------------------------------
 * Uses pdfjs-dist's PDFViewer component (lazy page rendering, selectable
 * text layer, `textlayerrendered` per page). The worker is bundled by Vite
 * (`?url`); cMaps, standard fonts and wasm decoders are copied to
 * public/vendor/pdfjs/ by scripts/copy-pdfjs-assets.js. PDF scripting is
 * never enabled (no scriptingManager), so no eval-like code runs.
 * ---------------------------------------------------------------------------
 */
import { getDocument, GlobalWorkerOptions, AnnotationMode } from 'pdfjs-dist';
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

const TEXT_LAYER_ENABLE = 1;

/** Absolute URL of a vendored PDF.js asset folder. */
function assetUrl(folder) {
  return chrome.runtime.getURL(`vendor/pdfjs/${folder}/`);
}

/**
 * Load `pdfUrl` into `container` (an absolutely positioned div whose first
 * child is the `.pdfViewer` div). `beforeAttach({ viewer, eventBus })` runs
 * once the PDF has loaded but before its pages are attached, so listeners
 * for `pagesinit` / `textlayerrendered` can't miss the first events.
 * Rejects with PDF.js' own exceptions (InvalidPDFException,
 * PasswordException, ResponseException…).
 */
export async function openPdf(pdfUrl, container, beforeAttach) {
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus });
  const viewer = new PDFViewer({
    container,
    eventBus,
    linkService,
    textLayerMode: TEXT_LAYER_ENABLE,
    annotationMode: AnnotationMode.ENABLE,
  });
  linkService.setViewer(viewer);

  const pdfDocument = await getDocument({
    url: pdfUrl,
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
    enableXfa: false,
  }).promise;

  beforeAttach({ viewer, eventBus });
  viewer.setDocument(pdfDocument);
  linkService.setDocument(pdfDocument);
}
