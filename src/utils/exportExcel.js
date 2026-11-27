import writeExcelFile from 'write-excel-file/universal';
import { todayString } from './date';

/* ------------------------------------------------------------------------------------------
 * Styled Excel file: the student export.
 * Brand colours: amber #F2A807, navy #1F1F38.
 * ---------------------------------------------------------------------------------------- */

const NAVY = '#1F1F38';
const AMBER = '#F2A807';
const AMBER_DARK = '#B45309';
const AMBER_SOFT = '#FFF3D1';
const BAND = '#FFFBF0';
const LINE = '#EADFC4';
const GREY = '#4B5563';

const fullName = (s) => `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || 'Student';

// "Bordj Kiffan - SE1" -> "Bordj-Kiffan-SE1"  (safe to use in a file name)
const slug = (text) =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ---- cell builders -------------------------------------------------------------------------

const title = (text, columns) => [
  { value: text, align: 'left', columnSpan: columns, fontSize: 16, fontWeight: 'bold', textColor: NAVY, backgroundColor: AMBER, alignVertical: 'center', indent: 1, height: 34 },
  ...Array(columns - 1).fill(null),
];

const subtitle = (text, columns) => [
  { value: text, align: 'left', columnSpan: columns, fontSize: 10, fontStyle: 'italic', textColor: GREY, backgroundColor: AMBER_SOFT, alignVertical: 'center', indent: 1, height: 20 },
  ...Array(columns - 1).fill(null),
];

const headerRow = (labels, centered = []) =>
  labels.map((value, i) => ({
    value,
    fontWeight: 'bold',
    textColor: '#FFFFFF',
    backgroundColor: NAVY,
    align: centered.includes(i) ? 'center' : 'left',
    alignVertical: 'center',
    indent: centered.includes(i) ? 0 : 1,
    height: 24,
  }));

const body = (i) => ({
  align: 'left',
  height: 22,
  backgroundColor: i % 2 === 0 ? '#FFFFFF' : BAND,
  alignVertical: 'center',
  bottomBorderColor: LINE,
  bottomBorderStyle: 'thin',
});

// ---- 1) students export ---------------------------------------------------------------------

/**
 * Download the given students as a styled .xlsx: Name, Email, Points.
 * Rows keep the order they are passed in (the app's student list is already A–Z).
 *  */
export const exportStudentsToExcel = async (students, label = '') => {
  const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const sub = [label === 'all' ? 'All classes' : label, `${students.length} student${students.length === 1 ? '' : 's'}`, when].filter(Boolean).join('  ·  ');

  const rows = students.map((s, i) => [
    { value: fullName(s), type: String, fontWeight: 'bold', textColor: NAVY, indent: 1, ...body(i) },
    { value: s.user?.email || '', type: String, textColor: GREY, indent: 1, ...body(i) },
    {
      value: Number(s.points) || 0,
      type: Number,
      ...body(i),
      fontWeight: 'bold',
      textColor: AMBER_DARK,
      align: 'center',
      backgroundColor: '#FEF3C7',
    },
  ]);

  const blob = await writeExcelFile(
    [title('Snai3i Points  —  Students', 3), subtitle(sub, 3), headerRow(['Name', 'Email', 'Points'], [2]), ...rows],
    {
      sheet: 'Students',
      columns: [{ width: 32 }, { width: 38 }, { width: 12 }],
      stickyRowsCount: 3,
      showGridLines: false,
    }
  ).toBlob();

  const fileName = `students${label ? `-${slug(label)}` : ''}-${todayString()}.xlsx`;
  saveBlob(blob, fileName);
  return { count: students.length, fileName };
};
