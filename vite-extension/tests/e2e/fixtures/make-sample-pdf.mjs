/**
 * make-sample-pdf.mjs — regenerates tests/e2e/fixtures/sample.pdf (feature 37).
 * Run: node tests/e2e/fixtures/make-sample-pdf.mjs
 *
 * Three small (400×300 pt) pages with known ASCII text in the built-in
 * Helvetica font, so the E2E can target exact phrases in PDF.js' text layer.
 * Small pages keep the end of page 1 and the start of page 2 on screen
 * together, which the cross-page selection test needs.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES = [
  [
    [250, 'Pagina uno: introduccion al documento de prueba.'],
    [30, 'Final de la pagina uno con texto de cierre.'],
  ],
  [
    [260, 'La memoria de trabajo tiene capacidad limitada.'],
    [235, 'Segun Baddeley, el buffer episodico integra informacion.'],
    [30, 'Pie de la pagina dos.'],
  ],
  [[250, 'Pagina tres: conclusiones del documento.']],
];

function contentStream(lines) {
  return lines.map(([y, text]) => `BT /F1 12 Tf 20 ${y} Td (${text}) Tj ET`).join('\n');
}

function buildPdf() {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = PAGES.map((lines) => {
    const stream = contentStream(lines);
    const contents = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 400 300] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const here = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(path.join(here, 'sample.pdf'), buildPdf(), 'latin1');
