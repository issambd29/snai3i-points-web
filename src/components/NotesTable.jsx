import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, StickyNote, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { todayString } from '../utils/date';

/**
 * Notes table, shared by the admin, branch-manager and teacher dashboards.
 *
 * Every note a teacher wrote for a student (on any session, present or absent) is listed with its date,
 * not only the latest one. A month strip shows how many notes each month has, and can be used to move
 * from month to month. Click a student's name to see all of that student's notes.
 *
 * It only shows what it is given: the server already limits `students`, `classrooms` and `attendance`
 * to what the signed-in user may see (admin = all, manager = own branch, teacher = own + shared classes).
 */

const PAGE = 100;

const STATUS_LABEL = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };

const nameOf = (s) => `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || 'Student';

const monthLabel = (key, style = 'long') => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, year: 'numeric' });
};

const dayLabel = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export const NotesTable = ({
  students = [],
  classrooms = [],
  attendance = [],
  showBranchFilter = false,
  initialClassroomId = 'ALL',
}) => {
  const [branch, setBranch] = useState('ALL');
  const [classroomId, setClassroomId] = useState(initialClassroomId);
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState(null); // "all notes of this student"
  const [month, setMonth] = useState(null); // null = the latest month that has notes; 'ALL' = every month
  const [shown, setShown] = useState(PAGE);
  const stripRef = useRef(null);

  const branches = useMemo(
    () => [...new Set(classrooms.map((c) => c.branch).filter(Boolean))].sort(),
    [classrooms]
  );
  const visibleClassrooms = classrooms.filter((c) => branch === 'ALL' || c.branch === branch);
  const activeClassroomId =
    classroomId === 'ALL' || visibleClassrooms.some((c) => c.id === classroomId) ? classroomId : 'ALL';

  // every note in scope (all months), newest first
  const notes = useMemo(() => {
    const today = todayString();
    const scope = visibleClassrooms.filter((c) => activeClassroomId === 'ALL' || c.id === activeClassroomId);
    const classById = new Map(scope.map((c) => [c.id, c]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const q = search.trim().toLowerCase();

    return attendance
      .filter((a) => a.note && a.note.trim() && a.date <= today && classById.has(a.classroomId) && studentById.has(a.studentId))
      .filter((a) => status === 'ALL' || a.status === status)
      .map((a) => ({ ...a, student: studentById.get(a.studentId), classroom: classById.get(a.classroomId) }))
      .filter((a) => !studentId || a.studentId === studentId)
      .filter((a) => {
        if (!q) return true;
        return (
          nameOf(a.student).toLowerCase().includes(q) ||
          (a.student.user?.email || '').toLowerCase().includes(q) ||
          a.note.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : nameOf(a.student).localeCompare(nameOf(b.student))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classrooms, attendance, branch, activeClassroomId, status, search, studentId]);

  // notes per month, oldest -> newest (for the strip)
  const months = useMemo(() => {
    const counts = new Map();
    notes.forEach((n) => counts.set(n.date.slice(0, 7), (counts.get(n.date.slice(0, 7)) || 0) + 1));
    return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [notes]);

  const monthKeys = months.map(([k]) => k);
  const latest = monthKeys[monthKeys.length - 1] || null;
  const activeMonth = month === 'ALL' ? 'ALL' : month && monthKeys.includes(month) ? month : latest;
  const rows = activeMonth === 'ALL' || !activeMonth ? notes : notes.filter((n) => n.date.startsWith(activeMonth));
  const at = activeMonth && activeMonth !== 'ALL' ? monthKeys.indexOf(activeMonth) : -1;
  const studentFilter = studentId ? students.find((s) => s.id === studentId) : null;

  // keep the selected month visible in the strip (matters on a phone)
  useEffect(() => {
    const el = stripRef.current?.querySelector('.nt-month.active');
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [activeMonth, months.length]);

  const pick = (key) => {
    setMonth(key);
    setShown(PAGE);
  };
  const step = (dir) => {
    const next = monthKeys[at + dir];
    if (next) pick(next);
  };

  const selectStyle = { minWidth: 150 };

  return (
    <div>
      {/* FILTERS */}
      <div className="class-tools">
        {showBranchFilter && branches.length > 1 && (
          <select
            className="class-select"
            style={selectStyle}
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              pick(null);
            }}
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
          onChange={(e) => {
            setClassroomId(e.target.value);
            pick(null);
          }}
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
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            pick(null);
          }}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          {Object.entries(STATUS_LABEL).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
          <input
            type="text"
            placeholder="Search students or notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE);
            }}
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
      </div>

      {studentFilter && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="nt-filter-chip" onClick={() => { setStudentId(null); pick(null); }}>
            All notes of <b>{nameOf(studentFilter)}</b>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MONTH STRIP */}
      {months.length > 0 && (
        <div className="nt-months" role="tablist" aria-label="Month">
          <button
            type="button"
            className="nt-arrow"
            onClick={() => step(-1)}
            disabled={at <= 0}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="nt-strip" ref={stripRef}>
            <button
              type="button"
              role="tab"
              aria-selected={activeMonth === 'ALL'}
              className={`nt-month ${activeMonth === 'ALL' ? 'active' : ''}`}
              onClick={() => pick('ALL')}
            >
              All months <span>{notes.length}</span>
            </button>
            {months.map(([key, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeMonth === key}
                className={`nt-month ${activeMonth === key ? 'active' : ''}`}
                onClick={() => pick(key)}
              >
                {monthLabel(key, 'short')} <span>{count}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="nt-arrow"
            onClick={() => step(1)}
            disabled={at === -1 || at >= monthKeys.length - 1}
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADING */}
      {months.length > 0 && (
        <div className="nt-heading">
          <h3>{activeMonth === 'ALL' ? 'All months' : monthLabel(activeMonth)}</h3>
          <span>
            {rows.length} note{rows.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* TABLE */}
      <div className="table-card">
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <StickyNote className="w-7 h-7 text-[#F2A807]" />
            </div>
            <div className="empty-title">No notes found</div>
            <p className="empty-desc">
              {search || studentId || status !== 'ALL'
                ? 'No notes match these filters.'
                : 'Notes you add in Presence & Attendance (for present or absent students) will be listed here.'}
            </p>
          </div>
        ) : (
          <>
            <div className={`nt-row nt-head ${showBranchFilter ? 'nt-wide' : ''}`}>
              <div>Date</div>
              <div>Student</div>
              <div className="lb-hide-sm">Class</div>
              {showBranchFilter && <div className="lb-hide-sm">Branch</div>}
              <div>Status</div>
              <div>Note</div>
              <div className="lb-hide-sm">Written by</div>
            </div>

            {rows.slice(0, shown).map((n) => (
              <div key={n.id || `${n.classroomId}-${n.studentId}-${n.date}`} className={`nt-row ${showBranchFilter ? 'nt-wide' : ''}`}>
                <div className="nt-date">{dayLabel(n.date)}</div>
                <div style={{ minWidth: 0 }}>
                  <button
                    type="button"
                    className="nt-student"
                    title="Show all notes of this student"
                    onClick={() => {
                      setStudentId(n.studentId);
                      pick('ALL');
                    }}
                  >
                    {nameOf(n.student)}
                  </button>
                  <div className="lb-sub lb-show-sm">{n.classroom.name}</div>
                </div>
                <div className="lb-hide-sm lb-sub">{n.classroom.name}</div>
                {showBranchFilter && <div className="lb-hide-sm lb-sub">{n.classroom.branch || '—'}</div>}
                <div>
                  <span className={`ab-pill ab-pill-${n.status}`}>{STATUS_LABEL[n.status] || n.status}</span>
                </div>
                <div className="nt-note">{n.note}</div>
                <div className="lb-hide-sm lb-sub">{n.markedBy || '—'}</div>
              </div>
            ))}

            {rows.length > shown && (
              <div style={{ padding: 14, textAlign: 'center' }}>
                <button type="button" className="share-btn" onClick={() => setShown(shown + PAGE)}>
                  Show more ({rows.length - shown} left)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotesTable;
