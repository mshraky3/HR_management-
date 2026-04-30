/**
 * PDF Font Utility
 * Shared Amiri Arabic font configuration and PdfPrinter instance for all PDF-generating routes.
 * Falls back to Helvetica when font files are not accessible (e.g., on Vercel).
 */

import PdfPrinter from '@digicole/pdfmake-rtl';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontsDir = path.join(__dirname, '..', 'fonts');
const amiriDir = path.join(fontsDir, 'Amiri');
const amiriRegular = path.join(amiriDir, 'Amiri-Regular.ttf');
const amiriBold = path.join(amiriDir, 'Amiri-Bold.ttf');
const amiriItalic = path.join(amiriDir, 'Amiri-Italic.ttf');
const amiriBoldItalic = path.join(amiriDir, 'Amiri-BoldItalic.ttf');

let hasArabicFont = false;
try {
    hasArabicFont = fs.existsSync(amiriRegular);
} catch {
    log.warn('Font files not accessible, will use fallback fonts');
}

const fontExists = (fontPath) => {
    try {
        return fs.existsSync(fontPath);
    } catch {
        return false;
    }
};

const regular = hasArabicFont ? amiriRegular : null;
const bold = hasArabicFont ? (fontExists(amiriBold) ? amiriBold : amiriRegular) : null;
const italics = hasArabicFont ? (fontExists(amiriItalic) ? amiriItalic : amiriRegular) : null;
const bolditalics = hasArabicFont
    ? (fontExists(amiriBoldItalic) ? amiriBoldItalic : (fontExists(amiriBold) ? amiriBold : amiriRegular))
    : null;

/** Full font map — includes Roboto, Amiri and Nillima all pointing to Amiri (or Helvetica fallback). */
export const fonts = hasArabicFont
    ? {
        Roboto: { normal: regular, bold, italics, bolditalics },
        Amiri: { normal: regular, bold, italics, bolditalics },
        Nillima: { normal: regular, bold, italics, bolditalics },
    }
    : {
        Roboto: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
        Amiri: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
        Nillima: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
    };

/** Pre-built PdfPrinter instance. Import as `printer` or alias: `import { printer as certificatePrinter }`. */
export const printer = new PdfPrinter(fonts);
