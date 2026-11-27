import React, { useMemo, useState } from 'react';
import { Search, UserX, ChevronDown, ChevronRight, CalendarX, Users, Percent, ClipboardList, StickyNote } from 'lucide-react';
import { shiftDateString, todayString } from '../utils/date';

/**
 * Absence table, shared by the admin, branch-manager and teacher dashboards.
 *
 * It only shows what it is given: the server already limits `students`, `classrooms` and
 * `attendance` to what the signed-in user may see (admin = all, manager = own branch,
 * teacher = own + shared classes).
 *
 * "Absence" = an attendance record marked absent or excused. Present and late count as present.
 * Teachers can write a note for any student and session (present or absent): every note is listed here.
 */

const STATUS_LABEL = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };

const nameOf = (s) => `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || 'Student';

const PERIODS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All recorded', days: null },
];

const fmtDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const absenceColor = (n) => (n === 0 ? 'var(--muted)' : n < 3 ? '#b45309' : '#dc2626');
const absenceBg = (n) => (n === 0 ? '#f3f4f6' : n < 3 ? 'rgba(242,168,7,0.14)' : 'rgba(239,68,68,0.12)');
const rateColor = (r) => (r === null ? 'var(--muted)' : r >= 90 ? '#15803d' : r >= 75 ? '#b45309' : '#dc2626');

export const AbsenceReport = ({
  students = [],
  classrooms = [],
  attendance = [],
  showBranchFilter = false,
  initialClassroomId = 'ALL',
}) => {
  const [branch, setBranch] = useState('ALL');
  const [classroomId, setClassroomId] = useState(initialClassroomId);
  const [period, setPeriod] = useState('30');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('absences'); // 'absences' | 'rate' | 'name'
  const [showAll, setShowAll] = useState(false); // include students with no absences
  const [openId, setOpenId] = useState(null);

  const branches = useMemo(
    () => [...new Set(classrooms.map((c) => c.branch).filter(Boolean))].sort(),
    [classrooms]
  );
  const visibleClassrooms = classrooms.filter((c) => branch === 'ALL' || c.branch === branch);
  const activeClassroomId =
    classroomId === 'ALL' || visibleClassrooms.some((c) => c.id === classroomId) ? classroomId : 'ALL';

  const { rows, totals } = useMemo(() => {
    const today = todayString();
    const days = PERIODS.find((p) => p.id === period)?.days;
    const from = days ? shiftDateString(today, -(days - 1)) : null;

    // classes in scope
    const scope = visibleClassrooms.filter((c) => activeClassroomId === 'ALL' || c.id === activeClassroomId);
    const scopeIds = new Set(scope.map((c) => c.id));

    // student id -> { classes, absent[], present }
    const byStudent = new Map();
    scope.forEach((c) => {
      (c.studentIds || []).forEach((sid) => {
        if (!byStudent.has(sid)) byStudent.set(sid, { classes: [], absent: [], present: 0, notes: [] });
        byStudent.get(sid).classes.push(c);
      });
    });

    attendance.forEach((a) => {
      if (!scopeIds.has(a.classroomId)) return;
      if (from && a.date < from) return;
      if (a.date > today) return;
      const entry = byStudent.get(a.studentId);
      if (!entry) return;
      if (a.status === 'absent' || a.status === 'excused') entry.absent.push(a);
      else if (a.status === 'present' || a.status === 'late') entry.present += 1;
      if (a.note && a.note.trim()) entry.notes.push(a);
    });

    const studentById = new Map(students.map((s) => [s.id, s]));
    const list = [];
    let totalAbsences = 0;
    let totalPresent = 0;
    let withAbsences = 0;

    byStudent.forEach((entry, sid) => {
      const student = studentById.get(sid);
      if (!student) return;
      const absences = entry.absent.length;
      const recorded = absences + entry.present;
      totalAbsences += absences;
      totalPresent += entry.present;
      if (absences > 0) withAbsences += 1;
      const dates = [...entry.absent].sort((x, y) => (x.date < y.date ? 1 : -1)); // newest first
      const notes = [...entry.notes].sort((x, y) => (x.date < y.date ? 1 : -1));
      list.push({
        notes,
        student,
        classes: entry.classes,
        absences,
        present: entry.present,
        recorded,
        rate: recorded ? Math.round((entry.present / recorded) * 100) : null,
        last: dates[0]?.date || null,
        dates,
      });
    });

    const recordedTotal = totalAbsences + totalPresent;
    return {
      rows: list,
      totals: {
        absences: totalAbsences,
        withAbsences,
        recorded: recordedTotal,
        rate: recordedTotal ? Math.round((totalPresent / recordedTotal) * 100) : null,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classrooms, attendance, branch, activeClassroomId, period]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!showAll && r.absences === 0 && r.notes.length === 0) return false;
      if (!q) return true;
      return (
        nameOf(r.student).toLowerCase().includes(q) ||
        (r.student.user?.email || '').toLowerCase().includes(q) ||
        r.notes.some((n) => n.note.toLowerCase().includes(q))
      );
    });
    const byName = (a, b) => nameOf(a.student).localeCompare(nameOf(b.student));
    return filtered.sort((a, b) => {
      if (sortBy === 'name') return byName(a, b);
      if (sortBy === 'rate') {
        if (a.rate === null && b.rate === null) return byName(a, b);
        if (a.rate === null) return 1;
        if (b.rate === null) return -1;
        return a.rate - b.rate || byName(a, b);
      }
      return b.absences - a.absences || byName(a, b);
    });
  }, [rows, search, showAll, sortBy]);

  const selectStyle = { minWidth: 150 };
  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase();

  return (
    <div>
      {/* FILTERS */}
      <div className="class-tools">
        {showBranchFilter && branches.length > 1 && (
          <select
            className="class-select"
            style={selectStyle}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Filter by branch"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}

        <select
          className="class-select"
          style={selectStyle}
          value={activeClassroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          aria-label="Filter by class"
        >
          <option value="ALL">All Classes</option>
          {visibleClassrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="class-select"
          style={selectStyle}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label="Period"
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          className="class-select"
          style={selectStyle}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort by"
        >
          <option value="absences">Most absences first</option>
          <option value="rate">Lowest attendance first</option>
          <option value="name">Name (A–Z)</option>
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 300 }}>
          <input
            type="text"
            placeholder="Search students or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'Montserrat, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
            }}
          />
          <Search
            className="w-4 h-4"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Include students with no absences or notes
        </label>
      </div>

      {/* SUMMARY */}
      <div className="ab-stats">
        <div className="lb-stat">
          <CalendarX className="w-4 h-4" />
          <div>
            <b>{totals.absences}</b>
            <span>Total absences</span>
          </div>
        </div>
        <div className="lb-stat">
          <UserX className="w-4 h-4" />
          <div>
            <b>{totals.withAbsences}</b>
            <span>Students absent</span>
          </div>
        </div>
        <div className="lb-stat">
          <Percent className="w-4 h-4" />
          <div>
            <b>{totals.rate === null ? '—' : `${totals.rate}%`}</b>
            <span>Attendance rate</span>
          </div>
        </div>
        <div className="lb-stat">
          <ClipboardList className="w-4 h-4" />
          <div>
            <b>{totals.recorded}</b>
            <span>Records marked</span>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-card">
        {visibleRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Users className="w-7 h-7 text-[#F2A807]" />
            </div>
            <div className="empty-title">
              {totals.recorded === 0 ? 'No attendance recorded' : 'No absences found'}
            </div>
            <p className="empty-desc">
              {search
                ? `No students matching "${search}".`
                : totals.recorded === 0
                  ? `Nothing has been marked for ${periodLabel}. Attendance is taken in the Attendance tab of each class.`
                  : `Nobody was marked absent for ${periodLabel}.`}
            </p>
          </div>
        ) : (
          <>
            <div className={`ab-row ab-head ${showBranchFilter ? 'ab-wide' : ''}`}>
              <div />
              <div>Student</div>
              <div className="lb-hide-sm">Class</div>
              {showBranchFilter && <div className="lb-hide-sm">Branch</div>}
              <div className="lb-num">Absences</div>
              <div className="lb-num">Attendance</div>
              <div className="lb-hide-sm">Last absence</div>
              <div className="lb-hide-sm">Latest note</div>
            </div>

            {visibleRows.map((r) => {
              const open = openId === r.student.id;
              const classNames = r.classes.map((c) => c.name).join(', ') || '—';
              const branchNames = [...new Set(r.classes.map((c) => c.branch).filter(Boolean))].join(', ') || '—';
              return (
                <div key={r.student.id} className="ab-item">
                  <button
                    type="button"
                    className={`ab-row ab-btn ${showBranchFilter ? 'ab-wide' : ''}`}
                    onClick={() => setOpenId(open ? null : r.student.id)}
                    aria-expanded={open}
                    disabled={r.absences === 0 && r.notes.length === 0}
                    title={r.absences || r.notes.length ? 'Show absence dates and notes' : 'No absences or notes'}
                  >
                    <div className="col-center" style={{ color: 'var(--muted)' }}>
                      {r.absences > 0 || r.notes.length > 0 ? (
                        open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="lb-name">{nameOf(r.student)}</div>
                      <div className="lb-sub lb-show-sm">{classNames}</div>
                    </div>
                    <div className="lb-hide-sm lb-sub">{classNames}</div>
                    {showBranchFilter && <div className="lb-hide-sm lb-sub">{branchNames}</div>}
                    <div className="lb-num">
                      <span
                        style={{
                          minWidth: 30,
                          textAlign: 'center',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontWeight: 800,
                          fontSize: 13,
                          color: absenceColor(r.absences),
                          background: absenceBg(r.absences),
                        }}
                      >
                        {r.absences}
                      </span>
                    </div>
                    <div className="lb-num" style={{ fontWeight: 800, color: rateColor(r.rate) }}>
                      {r.rate === null ? '—' : `${r.rate}%`}
                    </div>
                    <div className="lb-hide-sm lb-sub">{r.last ? fmtDay(r.last) : '—'}</div>
                    <div className="lb-hide-sm ab-latest" title={r.notes[0] ? `${fmtDay(r.notes[0].date)}: ${r.notes[0].note}` : undefined}>
                      {r.notes[0] ? (
                        <>
                          <StickyNote className="w-3.5 h-3.5" style={{ flexShrink: 0, color: '#B45309' }} />
                          <span>{r.notes[0].note}</span>
                          {r.notes.length > 1 && <em>+{r.notes.length - 1}</em>}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </div>
                  </button>

                  {open && (r.dates.length > 0 || r.notes.length > 0) && (
                    <div className="ab-detail">
                      {r.dates.length > 0 && (
                        <div>
                          <div className="ab-label">Absences</div>
                          <div className="ab-dates">
                            {r.dates.map((a) => (
                              <span key={a.id || `${a.classroomId}-${a.date}`} className="ab-chip">
                                {fmtDay(a.date)}
                                {a.status === 'excused' && <em> · excused</em>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.notes.length > 0 && (
                        <div>
                          <div className="ab-label">Notes from the sessions</div>
                          <ul className="ab-notes">
                            {r.notes.map((a) => (
                              <li key={a.id || `${a.classroomId}-${a.date}-n`}>
                                <span className="ab-note-date">{fmtDay(a.date)}</span>
                                <span className={`ab-pill ab-pill-${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
                                <span className="ab-note-text">{a.note}</span>
                                {a.markedBy && <span className="ab-note-by">— {a.markedBy}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default AbsenceReport;
