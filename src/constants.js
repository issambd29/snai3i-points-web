// Dropdowns list their choices alphabetically.
const BRANCHES_RAW = [
  { id: 'Bordj Kiffan', label: 'Bordj Kiffan' },
  { id: 'Rouissou', label: 'Rouissou' },
  { id: 'Oran', label: 'Oran' },
  { id: 'Online', label: 'Online' },
];

const SPECIALTIES_RAW = [
  { id: 'SE1', label: 'SE1' },
  { id: 'SE2', label: 'SE2' },
  { id: 'SE3', label: 'SE3' },
  { id: 'MECA1', label: 'MECA1' },
  { id: 'MECA2', label: 'MECA2' },
  { id: 'MECA3', label: 'MECA3' },
  { id: 'Tronc Commun', label: 'Tronc Commun' },
  { id: 'Business', label: 'Business' },
];


const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
export const BRANCH_OPTIONS = [...BRANCHES_RAW].sort(byLabel);
export const SPECIALTY_OPTIONS = [...SPECIALTIES_RAW].sort(byLabel);
