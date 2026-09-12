import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Users,
  CheckCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react';

export const AttendanceTracker = ({
  classroomId,
  classroomName,
  students = [],
  attendance = [],
  onSetAttendance,
  onBulkAttendance,
  onClearAttendance,
  triggerToast,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [editingNoteStudentId, setEditingNoteStudentId] = useState(null);
  const [tempNote, setTempNote] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isBulkMarking, setIsBulkMarking] = useState(false);

  // Shift date helper
  const changeDateBy = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Map student attendance for the selected date
  const dayAttendanceMap = useMemo(() => {
    const map = {};
    const normClassId = String(classroomId || '').replace(/^c-/, '');
    (attendance || [])
      .filter((a) => {
        const aClassId = String(a.classroomId || '').replace(/^c-/, '');
        const isMatch = !classroomId || aClassId === normClassId || a.classroomId === classroomId;
        return isMatch && a.date === selectedDate;
      })
      .forEach((a) => {
        const rawSid = String(a.studentId || '').replace(/^s-/, '');
        map[a.studentId] = a;
        if (rawSid) {
          map[rawSid] = a;
          map[`s-${rawSid}`] = a;
        }
      });
    return map;
  }, [attendance, classroomId, selectedDate]);

  // Overall attendance statistics per student (Present vs Absent)
  const studentStatsMap = useMemo(() => {
    const map = {};
    const normClassId = String(classroomId || '').replace(/^c-/, '');
    const classRecords = (attendance || []).filter((a) => {
      const aClassId = String(a.classroomId || '').replace(/^c-/, '');
      return !classroomId || aClassId === normClassId || a.classroomId === classroomId;
    });

    (students || []).forEach((s) => {
      const sRawId = String(s.id || '').replace(/^s-/, '');
      const studentRecords = classRecords.filter((a) => {
        const aRawId = String(a.studentId || '').replace(/^s-/, '');
        return a.studentId === s.id || (aRawId && aRawId === sRawId);
      });
      const totalRecorded = studentRecords.length;
      const presentCount = studentRecords.filter((a) => a.status === 'present' || a.status === 'late').length;
      const pct = totalRecorded > 0 ? Math.round((presentCount / totalRecorded) * 100) : 100;
      const statObj = { totalRecorded, presentCount, pct };
      map[s.id] = statObj;
      if (sRawId) {
        map[sRawId] = statObj;
        map[`s-${sRawId}`] = statObj;
      }
    });

    return map;
  }, [attendance, classroomId, students]);

  // Daily totals: Enrolled, Present, Absent, Unmarked
  const dailyStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;

    (students || []).forEach((s) => {
      const sRawId = String(s.id || '').replace(/^s-/, '');
      const rec = dayAttendanceMap[s.id] || dayAttendanceMap[sRawId] || dayAttendanceMap[`s-${sRawId}`];
      const status = rec?.status;
      if (status === 'present' || status === 'late') {
        present++;
      } else if (status === 'absent' || status === 'excused') {
        absent++;
      } else {
        unmarked++;
      }
    });

    return { present, absent, unmarked };
  }, [students, dayAttendanceMap]);

  // Actions
  const handleSetStatus = (studentId, status) => {
    const sRawId = String(studentId || '').replace(/^s-/, '');
    const rec = dayAttendanceMap[studentId] || dayAttendanceMap[sRawId] || dayAttendanceMap[`s-${sRawId}`];
    const current = rec?.status;
    const currentNote = rec?.note || '';
    // Clicking the current status or explicitly 'unmarked' clears back to unmarked
    const newStatus = (current === status || status === 'unmarked') ? 'unmarked' : status;
    onSetAttendance(classroomId, studentId, selectedDate, newStatus, currentNote);
  };

  const handleSaveNote = (studentId) => {
    const sRawId = String(studentId || '').replace(/^s-/, '');
    const rec = dayAttendanceMap[studentId] || dayAttendanceMap[sRawId] || dayAttendanceMap[`s-${sRawId}`];
    const currentStatus = rec?.status || 'present';
    onSetAttendance(classroomId, studentId, selectedDate, currentStatus, tempNote.trim());
    setEditingNoteStudentId(null);
    setTempNote('');
    if (triggerToast) {
      triggerToast('Note Saved', 'Attendance note updated');
    }
  };

  const handleBulkMarkPresent = async () => {
    if (students.length === 0) return;
    setIsBulkMarking(true);
    const studentIds = students.map((s) => s.id);
    try {
      await onBulkAttendance(classroomId, selectedDate, 'present', studentIds);
      if (triggerToast) {
        triggerToast('All Present', `Marked ${students.length} student(s) present for ${selectedDate}`);
      }
    } catch (err) {
      if (triggerToast) {
        triggerToast('Failed', 'Could not mark attendance in bulk', 'danger');
      }
    } finally {
      setIsBulkMarking(false);
    }
  };

  const handleClearDay = async () => {
    setIsClearing(true);
    try {
      await onClearAttendance(classroomId, selectedDate);
      if (triggerToast) {
        triggerToast('Attendance Cleared', `Reset attendance records for ${selectedDate}`);
      }
    } catch (err) {
      if (triggerToast) {
        triggerToast('Clear Failed', 'Could not clear attendance records', 'danger');
      }
    } finally {
      setIsClearing(false);
    }
  };

  const isToday = selectedDate === todayStr;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* TOP CONTROLS & DATE NAVIGATOR */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '16px 20px',
          boxShadow: '0 1px 4px rgba(31,31,56,0.04)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        {/* DATE SELECTOR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--navy)',
              }}
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '6px 12px',
                background: '#ffffff',
              }}
            >
              <Calendar className="w-4 h-4 text-[#ca8a04]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: 'var(--navy)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => changeDateBy(1)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--navy)',
              }}
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #fef08a',
                background: '#fefce8',
                color: '#ca8a04',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
              }}
            >
              Jump to Today
            </button>
          )}
        </div>

        {/* BULK & CLEAR ACTIONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleBulkMarkPresent}
            disabled={students.length === 0 || isBulkMarking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
              color: '#15803d',
              fontSize: '12px',
              fontWeight: '800',
              cursor: students.length === 0 || isBulkMarking ? 'not-allowed' : 'pointer',
              opacity: students.length === 0 || isBulkMarking ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <CheckCheck className="w-4 h-4" />
            <span>{isBulkMarking ? 'Marking...' : 'Mark All Present'}</span>
          </button>

          <button
            type="button"
            onClick={handleClearDay}
            disabled={isClearing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: '#ffffff',
              color: 'var(--muted)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: isClearing ? 'not-allowed' : 'pointer',
              opacity: isClearing ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            title="Clear all attendance records for this date"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isClearing ? 'animate-spin' : ''}`} />
            <span>{isClearing ? 'Clearing...' : 'Clear Day'}</span>
          </button>
        </div>
      </div>

      {/* METRIC CARDS: ENROLLED, PRESENT, ABSENT, UNMARKED */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Enrolled
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--navy)' }}>
            {students.length}
          </div>
        </div>

        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', marginBottom: '4px' }}>
            Present
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a' }}>
            {dailyStats.present}
          </div>
        </div>

        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', marginBottom: '4px' }}>
            Absent
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#ef4444' }}>
            {dailyStats.absent}
          </div>
        </div>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Unmarked
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--muted)' }}>
            {dailyStats.unmarked}
          </div>
        </div>
      </div>

      {/* ROSTER TABLE */}
      <div className="table-card">
        <div
          className="table-head"
          style={{ gridTemplateColumns: '2fr 100px 2.4fr 1.4fr' }}
        >
          <div>Student Name</div>
          <div>All-Time</div>
          <div>Attendance Status ({selectedDate})</div>
          <div>Note</div>
        </div>

        {students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Users className="w-7 h-7 text-[#F2A807]" />
            </div>
            <div className="empty-title">No Students in {classroomName}</div>
            <p className="empty-desc">
              Enroll students in this classroom from the Points & Leaderboard tab to record daily presence and absences.
            </p>
          </div>
        ) : (
          students.map((student) => {
            const sRawId = String(student.id || '').replace(/^s-/, '');
            const rec = dayAttendanceMap[student.id] || dayAttendanceMap[sRawId] || dayAttendanceMap[`s-${sRawId}`];
            const rawStatus = rec?.status;
            // Treat 'late' as present and 'excused' as absent if legacy data exists
            const currentStatus = (rawStatus === 'present' || rawStatus === 'late')
              ? 'present'
              : (rawStatus === 'absent' || rawStatus === 'excused')
              ? 'absent'
              : 'unmarked';

            const isPresent = currentStatus === 'present';
            const isAbsent = currentStatus === 'absent';
            const isMarked = isPresent || isAbsent;

            const stats = studentStatsMap[student.id] || { pct: 100, presentCount: 0, totalRecorded: 0 };
            const isEditingNote = editingNoteStudentId === student.id;

            return (
              <div
                key={student.id}
                className="table-row"
                style={{
                  gridTemplateColumns: '2fr 100px 2.4fr 1.4fr',
                  alignItems: 'center',
                }}
              >
                {/* STUDENT NAME */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(242, 168, 7, 0.12)',
                      color: '#ca8a04',
                      fontWeight: '800',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {student.user?.firstName?.[0] || 'S'}
                  </div>
                  <div>
                    <div className="player-name">
                      {student.user?.firstName} {student.user?.lastName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {student.user?.email}
                    </div>
                  </div>
                </div>

                {/* OVERALL RATE */}
                <div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: '800',
                      background:
                        stats.pct >= 85
                          ? '#f0fdf4'
                          : stats.pct >= 70
                          ? '#fefce8'
                          : '#fef2f2',
                      color:
                        stats.pct >= 85
                          ? '#15803d'
                          : stats.pct >= 70
                          ? '#b45309'
                          : '#dc2626',
                    }}
                  >
                    <UserCheck className="w-3 h-3" />
                    {stats.pct}%
                  </span>
                </div>

                {/* STATUS TOGGLES: JUST PRESENT & ABSENT */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* PRESENT */}
                  <button
                    type="button"
                    onClick={() => handleSetStatus(student.id, 'present')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      border: isPresent ? '1px solid #16a34a' : '1px solid var(--border)',
                      background: isPresent ? '#16a34a' : '#ffffff',
                      color: isPresent ? '#ffffff' : 'var(--navy)',
                      boxShadow: isPresent ? '0 2px 6px rgba(22, 163, 74, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                    title={isPresent ? 'Click to unmark' : 'Mark student Present'}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Present</span>
                  </button>

                  {/* ABSENT */}
                  <button
                    type="button"
                    onClick={() => handleSetStatus(student.id, 'absent')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      border: isAbsent ? '1px solid #ef4444' : '1px solid var(--border)',
                      background: isAbsent ? '#ef4444' : '#ffffff',
                      color: isAbsent ? '#ffffff' : 'var(--navy)',
                      boxShadow: isAbsent ? '0 2px 6px rgba(239, 68, 68, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                    title={isAbsent ? 'Click to unmark' : 'Mark student Absent'}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Absent</span>
                  </button>

                  {/* QUICK CLEAR / UNMARK BUTTON */}
                  {isMarked && (
                    <button
                      type="button"
                      onClick={() => handleSetStatus(student.id, 'unmarked')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: 'var(--muted)',
                        background: '#f8fafc',
                        border: '1px dashed var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title="Clear attendance status for this student"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {/* NOTE / REASON */}
                <div>
                  {isEditingNote ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="text"
                        value={tempNote}
                        onChange={(e) => setTempNote(e.target.value)}
                        placeholder="e.g. Doctor note, excused"
                        autoFocus
                        style={{
                          flex: 1,
                          fontSize: '12px',
                          padding: '5px 8px',
                          border: '1px solid var(--primary)',
                          borderRadius: '6px',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveNote(student.id)}
                        style={{
                          padding: '5px 9px',
                          borderRadius: '6px',
                          background: 'var(--primary)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: '800',
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNoteStudentId(null)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          color: 'var(--muted)',
                          border: 'none',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : rec?.note ? (
                    <div
                      onClick={() => {
                        setTempNote(rec.note);
                        setEditingNoteStudentId(student.id);
                      }}
                      style={{
                        fontSize: '12px',
                        color: 'var(--navy)',
                        background: '#fafafc',
                        border: '1px dashed var(--border)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title="Click to edit note"
                    >
                      {rec.note}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTempNote('');
                        setEditingNoteStudentId(student.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        padding: '4px 0',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      + Add note
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
