/** Alphabetical helpers: every dropdown in the app lists its choices A–Z (Latin and Arabic, "G2" before "G10"). */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export const compareText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

export const sortByText = (items, getText) => [...items].sort((a, b) => compareText(getText(a), getText(b)));

export const sortClassrooms = (classrooms) => sortByText(classrooms, (c) => c.name);

export const sortTeachers = (teachers) =>
  sortByText(teachers, (t) => `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || t.user?.email || '');
