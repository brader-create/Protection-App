import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// One PDF reading engine for the life of the page, started as early as
// possible. If it were started when a document is first read, the browser
// would fetch it at the exact moment you pick a file — which looks like an
// upload. Kept at module scope so switching tabs doesn't rebuild it.
let sharedPdfWorker = null;

export function warmPdfEngine() {
  if (!sharedPdfWorker || sharedPdfWorker.destroyed) {
    sharedPdfWorker = new pdfjsLib.PDFWorker({ name: 'document-reader' });
  }
  return sharedPdfWorker;
}
