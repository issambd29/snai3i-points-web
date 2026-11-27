import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportStudentsToExcel } from '../utils/exportExcel';
import { FileSpreadsheet } from 'lucide-react';

/** "Export Excel" button: downloads the given students (name, email, points) as an .xlsx file. */
export const ExportStudentsButton = ({ students, label = '' }) => {
  const { triggerToast } = useApp();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    if (!students.length) {
      triggerToast('Nothing to export', 'There are no students in this list.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const { count, fileName } = await exportStudentsToExcel(students, label);
      triggerToast('Excel file ready', `${count} student${count === 1 ? '' : 's'} exported to ${fileName}`);
    } catch {
      triggerToast('Export failed', 'Could not create the Excel file. Please try again.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="share-btn"
      onClick={handleClick}
      disabled={busy}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title="Download name, email and points as an Excel sheet"
    >
      <FileSpreadsheet className="w-4 h-4" style={{ color: '#16a34a' }} />
      {busy ? 'Exporting…' : 'Export Excel'}
    </button>
  );
};

export default ExportStudentsButton;
