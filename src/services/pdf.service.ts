import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { env } from '../config/env';
import { Adaptation } from '../models/worksheet.model';
import { logger } from '../config/logger';

type Doc = PDFKit.PDFDocument;

const DEVANAGARI = /[ऀ-ॿ]/;
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d?: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface Fonts {
  regular: string;
  bold: string;
}

/**
 * Picks fonts for the document. Devanagari needs a font that has the glyphs (Noto Sans
 * Devanagari); OpenDyslexic is used when requested and available. Falls back to Helvetica.
 */
const BUNDLED = path.join(process.cwd(), 'fonts');
/** Env path first, then the repo's fonts/ folder (used on Vercel where no system fonts exist). */
function fontFile(envPath: string | undefined, bundledName: string): string | undefined {
  for (const candidate of [envPath, path.join(BUNDLED, bundledName)]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function setupFonts(doc: Doc, opts: { dyslexia?: boolean; hindi?: boolean }): Fonts {
  const tryRegister = (name: string, file?: string) => {
    if (!file || !fs.existsSync(file)) return false;
    try {
      doc.registerFont(name, file);
      return true;
    } catch (err) {
      logger.warn({ err, file }, 'Could not load PDF font');
      return false;
    }
  };

  const hindiFile = fontFile(env.HINDI_FONT_PATH, 'NotoSansDevanagari-Regular.ttf');
  const dysFile = fontFile(env.DYSLEXIA_FONT_PATH, 'OpenDyslexic-Regular.otf');
  if (opts.hindi) {
    if (tryRegister('Deva', hindiFile)) {
      const boldFile = hindiFile!.replace(/Regular/, 'Bold');
      return { regular: 'Deva', bold: tryRegister('Deva-Bold', boldFile) ? 'Deva-Bold' : 'Deva' };
    }
    logger.warn('Hindi content but no Devanagari font found (HINDI_FONT_PATH or fonts/); text may not render');
  }
  if (opts.dyslexia && tryRegister('Dys', dysFile)) {
    const boldFile = dysFile!.replace(/Regular/, 'Bold');
    return { regular: 'Dys', bold: tryRegister('Dys-Bold', boldFile) ? 'Dys-Bold' : 'Dys' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

const bottomOf = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/* ------------------------------------------------------------------ IEP ------------------------------------------------------------------ */

export interface IepPdfData {
  school: { name: string; city?: string; state?: string };
  student: { name: string; grade: string; section?: string | null; dateOfBirth?: Date | null; disabilityCategories: string[] };
  iep: {
    status: string;
    presentLevels?: string | null;
    startDate: Date;
    reviewDate: Date;
    aiGenerated?: boolean | null;
    approvedAt?: Date | null;
    goals: {
      domain: string;
      goalText: string;
      baseline?: string | null;
      target?: string | null;
      measurement?: string | null;
      accommodations: string[];
      interventions: string[];
      status: string;
    }[];
  };
  approvedByName?: string;
}

export function renderIepPdf(data: IepPdfData, out: Writable) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `IEP – ${data.student.name}`, Author: 'AbleSprout' } });
  doc.pipe(out);
  const hindi = DEVANAGARI.test(JSON.stringify(data.iep));
  const f = setupFonts(doc, { hindi });
  const width = doc.page.width - 100;

  const draftMark = () => {
    if (data.iep.status !== 'DRAFT') return;
    doc.save().rotate(-35, { origin: [300, 420] }).font('Helvetica-Bold').fontSize(90).fillColor('#000', 0.06);
    doc.text('DRAFT', 80, 380, { lineBreak: false });
    doc.restore().fillColor('#111', 1);
  };
  draftMark();
  doc.on('pageAdded', draftMark);

  doc.font(f.bold).fontSize(18).fillColor('#1d4d2b').text('Individualised Education Programme (IEP)');
  doc.font(f.regular).fontSize(10).fillColor('#555').text(
    `${data.school.name}${data.school.city ? `, ${data.school.city}` : ''}${data.school.state ? `, ${data.school.state}` : ''}`,
  );
  doc.moveDown(0.8).fillColor('#111');

  const row = (label: string, value: string) => {
    doc.font(f.bold).fontSize(10).text(`${label}: `, { continued: true }).font(f.regular).text(value);
  };
  row('Student', data.student.name);
  row('Class', `${data.student.grade}${data.student.section ? `-${data.student.section}` : ''}`);
  row('Date of birth', fmtDate(data.student.dateOfBirth));
  row('Support needs (RPwD Act 2016)', data.student.disabilityCategories.map(human).join(', ') || '—');
  row('IEP period', `${fmtDate(data.iep.startDate)} to review on ${fmtDate(data.iep.reviewDate)}`);
  row('Status', data.iep.status + (data.iep.approvedAt ? ` (approved ${fmtDate(data.iep.approvedAt)}${data.approvedByName ? ` by ${data.approvedByName}` : ''})` : ''));

  const heading = (t: string) => {
    ensureSpace(doc, 60);
    doc.moveDown(0.8).font(f.bold).fontSize(13).fillColor('#1d4d2b').text(t).fillColor('#111').moveDown(0.3);
  };

  heading('Present levels of performance');
  doc.font(f.regular).fontSize(10.5).text(data.iep.presentLevels || '—', { align: 'left', lineGap: 2 });

  heading('Goals');
  data.iep.goals.forEach((g, i) => {
    ensureSpace(doc, 120);
    doc.font(f.bold).fontSize(11).text(`Goal ${i + 1} · ${human(g.domain)}  `, { continued: true });
    doc.font(f.regular).fontSize(9).fillColor('#666').text(`[${human(g.status)}]`).fillColor('#111');
    doc.font(f.regular).fontSize(10.5).text(g.goalText, { lineGap: 2 }).moveDown(0.2);
    const sub = (label: string, v?: string | null) => {
      if (!v) return;
      doc.font(f.bold).fontSize(9.5).text(`${label}: `, 62, doc.y, { continued: true, width: width - 12 }).font(f.regular).text(v);
      doc.x = 50;
    };
    sub('Baseline', g.baseline);
    sub('Target', g.target);
    sub('Measurement', g.measurement);
    if (g.accommodations.length) sub('Accommodations', g.accommodations.join('; '));
    if (g.interventions.length) sub('Interventions', g.interventions.join('; '));
    doc.moveDown(0.6);
  });

  heading('Agreement');
  doc.font(f.regular).fontSize(10).text(
    'This plan was developed collaboratively with the student’s family. It describes educational supports only and is not a medical or clinical document.',
  );
  ensureSpace(doc, 80);
  doc.moveDown(2);
  const y = doc.y;
  ['Special educator', 'Parent / guardian', 'School head'].forEach((label, i) => {
    const x = 50 + i * (width / 3);
    doc.moveTo(x, y).lineTo(x + width / 3 - 20, y).strokeColor('#999').stroke();
    doc.fontSize(9).fillColor('#555').text(label, x, y + 4, { width: width / 3 - 20 });
  });
  doc.fillColor('#111');
  if (data.iep.aiGenerated) {
    doc.fontSize(8).fillColor('#888').text('Drafted with AbleSprout AI assistance and reviewed by the educator.', 50, bottomOf(doc) - 10, { lineBreak: false });
  }
  doc.end();
}

/* -------------------------------------------------------------- Worksheet -------------------------------------------------------------- */

export interface WorksheetPdfData {
  title: string;
  subject?: string | null;
  level?: string | null;
  studentName?: string;
  adaptations: Adaptation[];
  sections: { heading?: string | null; instructions?: string | null; questions: { text: string; answerType: string; options?: string[] | null }[] }[];
}

export function renderWorksheetPdf(data: WorksheetPdfData, out: Writable) {
  const a = new Set(data.adaptations);
  const large = a.has('large_print');
  const dyslexia = a.has('dyslexia_font');
  const spacing = a.has('extra_spacing') || dyslexia || large;
  const contrast = a.has('high_contrast');

  const base = large ? 18 : 13;
  const headSize = large ? 24 : 17;
  const lineGap = spacing ? base * 0.6 : base * 0.25;
  const ink = contrast ? '#000000' : '#222222';
  // Cream background reduces glare for many dyslexic readers; high contrast keeps pure white.
  const paper = dyslexia && !contrast ? '#FDF8E8' : '#FFFFFF';
  const charSpacing = dyslexia ? 0.6 : 0;
  const stroke = contrast ? 1.6 : 0.8;

  const doc = new PDFDocument({ size: 'A4', margin: large ? 44 : 50, info: { Title: data.title, Author: 'AbleSprout' } });
  doc.pipe(out);
  const hindi = DEVANAGARI.test(JSON.stringify(data.sections) + data.title);
  const f = setupFonts(doc, { dyslexia, hindi });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  const paint = () => {
    if (paper !== '#FFFFFF') doc.save().rect(0, 0, doc.page.width, doc.page.height).fill(paper).restore();
    doc.fillColor(ink);
  };
  paint();
  doc.on('pageAdded', paint);

  const text = (t: string, opts: PDFKit.Mixins.TextOptions = {}, font = f.regular, size = base) =>
    doc.font(font).fontSize(size).fillColor(ink).text(t, { lineGap, characterSpacing: charSpacing, align: 'left', ...opts });

  text(data.title, {}, f.bold, headSize);
  const meta = [data.subject, data.level].filter(Boolean).join(' · ');
  if (meta) text(meta, {}, f.regular, base - 2);
  doc.moveDown(0.4);
  text(`Name: ${data.studentName ?? '____________________'}     Date: ____________`, {}, f.regular, base - 1);
  doc.moveDown(0.6);

  const answerLine = (n = 1) => {
    for (let i = 0; i < n; i++) {
      ensureSpace(doc, base * 2);
      doc.moveDown(0.9);
      doc.moveTo(left + 20, doc.y).lineTo(left + width, doc.y).lineWidth(stroke).strokeColor(contrast ? '#000' : '#9a9a9a').stroke();
    }
    doc.moveDown(0.6);
  };
  const box = (h: number, label?: string) => {
    ensureSpace(doc, h + 16);
    const y = doc.y + 4;
    doc.roundedRect(left + 20, y, width - 20, h, 8).lineWidth(stroke).strokeColor(contrast ? '#000' : '#9a9a9a').stroke();
    if (label) doc.font(f.regular).fontSize(base - 4).fillColor('#777').text(label, left + 30, y + 6, { width: width - 40 });
    doc.fillColor(ink);
    doc.x = left;
    doc.y = y + h + 10;
  };
  const choice = (opts: string[]) => {
    for (const o of opts) {
      ensureSpace(doc, base * 2);
      const y = doc.y + base * 0.55;
      doc.circle(left + 30, y, base * 0.38).lineWidth(stroke).strokeColor(ink).stroke();
      text(o, { indent: 45 }, f.regular, base); // text starts to the right of the bubble
      doc.y = Math.max(doc.y, y + base * 0.5);
      doc.x = left;
    }
    doc.moveDown(0.4);
  };

  const steps = (instr: string) =>
    instr
      .split(/(?<=[.!?।])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

  let qNo = 0;
  for (const section of data.sections) {
    ensureSpace(doc, headSize * 4);
    if (section.heading) text(section.heading, {}, f.bold, base + 3);
    if (section.instructions) {
      if (a.has('chunked_steps')) {
        steps(section.instructions).forEach((s, i) => text(`Step ${i + 1}: ${s}`, { indent: 10 }));
      } else {
        text(section.instructions);
      }
    }
    doc.moveDown(0.5);

    for (const q of section.questions) {
      qNo += 1;
      ensureSpace(doc, base * 5);
      // Visual cue placeholders like "[picture: 3 mangoes]" become boxes the teacher can draw or paste into.
      const cues = [...q.text.matchAll(/\[(?:picture|image|चित्र)\s*:\s*([^\]]+)\]/gi)].map((m) => m[1]);
      const qText = q.text.replace(/\[(?:picture|image|चित्र)\s*:\s*[^\]]+\]/gi, '').trim();
      text(`${qNo}. ${qText}`, {}, f.bold, base);
      if (a.has('visual_supports')) cues.forEach((c) => box(large ? 110 : 80, `Picture: ${c}`));

      switch (q.answerType) {
        case 'multiple_choice':
          choice(q.options ?? []);
          break;
        case 'true_false':
          choice(hindi ? ['सही', 'गलत'] : ['True', 'False']);
          break;
        case 'match': {
          const opts = q.options ?? [];
          opts.forEach((o) => text(`•  ${o}   ________`, { indent: 20 }));
          doc.moveDown(0.5);
          break;
        }
        case 'long_text':
          answerLine(4);
          break;
        case 'number':
          box(base * 2.6);
          break;
        case 'draw':
          box(large ? 200 : 150);
          break;
        default:
          answerLine(1);
      }
      if (spacing) doc.moveDown(0.6);
    }
    doc.moveDown(0.8);
  }

  doc.font(f.regular).fontSize(8).fillColor('#888').text('Made with AbleSprout', left, bottomOf(doc) - 10, { lineBreak: false });
  doc.end();
}
