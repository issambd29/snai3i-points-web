/** Sorting helpers for student lists. Both work for Latin and Arabic names. */
const fullName = (s) => `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || '';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const byName = (a, b) =>
  collator.compare(fullName(a), fullName(b)) || collator.compare(a.user?.email || '', b.user?.email || '');

/** A–Z by student name. */
export const sortStudentsByName = (students) => [...students].sort(byName);

/**
 * Grouped by classroom name, then A–Z by student name inside each class.
 * "numeric" ordering puts "G2" before "G10". A student in several classes is listed once,
 * under the first class by name; students without a class come last.
 */
export const sortStudentsByClass = (students, classrooms = []) => {
  const classOf = new Map();
  classrooms.forEach((c) => {
    (c.studentIds || []).forEach((id) => {
      const known = classOf.get(id);
      if (known === undefined || collator.compare(c.name, known) < 0) classOf.set(id, c.name);
    });
  });
  const keyOf = (s) => classOf.get(s.id) ?? classrooms.find((c) => c.id === s.classroomId)?.name ?? null;

  return [...students].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === null && kb !== null) return 1;
    if (ka !== null && kb === null) return -1;
    return (ka === null ? 0 : collator.compare(ka, kb)) || byName(a, b);
  });
};
