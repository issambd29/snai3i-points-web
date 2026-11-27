import React, { useMemo, useState } from 'react';
import { Trophy, Search, Users, Star, Coins, Crown, Medal } from 'lucide-react';

/**
 * Leaderboard + ranked student list.
 *
 * Shared by the admin, branch-manager and teacher dashboards. It only shows what it is given:
 * the server already limits `students` / `classrooms` to what the signed-in user may see
 * (admin = everything, manager = own branch, teacher = own + shared classes).
 *
 * Props
 *  - students   : state.students
 *  - classrooms : classrooms the viewer may see
 *  - showBranchFilter : true for admins (lets them narrow to one branch)
 *  - initialClassroomId : optional class to pre-select (e.g. a teacher's active class)
 */

const nameOf = (s) => `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || 'Student';
const initialOf = (s) => (s.user?.firstName?.[0] || s.user?.email?.[0] || '?').toUpperCase();
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const PODIUM = {
  1: { bg: 'linear-gradient(160deg,#FFE08A,#F2A807)', ring: '#F2A807', label: '1st', height: 132 },
  2: { bg: 'linear-gradient(160deg,#F3F4F6,#CBD5E1)', ring: '#94A3B8', label: '2nd', height: 104 },
  3: { bg: 'linear-gradient(160deg,#FDE0C8,#E2995A)', ring: '#C77B3B', label: '3rd', height: 84 },
};

const Avatar = ({ student, size = 40, ring }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#1F1F38',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: size * 0.4,
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 3px ${ring}` : 'none',
    }}
  >
    {initialOf(student)}
  </div>
);

export const Leaderboard = ({
  students = [],
  classrooms = [],
  showBranchFilter = false,
  initialClassroomId = 'ALL',
}) => {
  const [branch, setBranch] = useState('ALL');
  const [classroomId, setClassroomId] = useState(initialClassroomId);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('points'); // 'points' | 'coins'

  // student id -> classes they belong to
  const classesByStudent = useMemo(() => {
    const map = {};
    classrooms.forEach((c) => {
      (c.studentIds || []).forEach((sid) => {
        (map[sid] = map[sid] || []).push(c);
      });
    });
    return map;
  }, [classrooms]);

  const classesOf = (s) => {
    const list = classesByStudent[s.id] || [];
    if (list.length) return list;
    const home = classrooms.find((c) => c.id === s.classroomId);
    return home ? [home] : [];
  };

  const branches = useMemo(
    () => [...new Set(classrooms.map((c) => c.branch).filter(Boolean))].sort(),
    [classrooms]
  );

  const visibleClassrooms = classrooms.filter((c) => branch === 'ALL' || c.branch === branch);

  // keep the class filter valid when the branch changes
  const activeClassroomId =
    classroomId === 'ALL' || visibleClassrooms.some((c) => c.id === classroomId) ? classroomId : 'ALL';

  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();

    const pool = students.filter((s) => {
      const classes = classesOf(s);
      if (branch !== 'ALL' && !classes.some((c) => c.branch === branch)) return false;
      if (activeClassroomId !== 'ALL' && !classes.some((c) => c.id === activeClassroomId)) return false;
      return true;
    });

    const value = (s) => Number(sortBy === 'coins' ? s.coins : s.points) || 0;
    const sorted = [...pool].sort(
      (a, b) => value(b) - value(a) || nameOf(a).localeCompare(nameOf(b))
    );

    // competition ranking: tied scores share a rank (1, 2, 2, 4 ...)
    let lastValue = null;
    let lastRank = 0;
    const withRank = sorted.map((s, i) => {
      const v = value(s);
      if (v !== lastValue) {
        lastRank = i + 1;
        lastValue = v;
      }
      return { student: s, rank: lastRank, value: v };
    });

    // the search only filters the list; ranks stay the real ones
    return q
      ? withRank.filter(
          ({ student: s }) =>
            nameOf(s).toLowerCase().includes(q) || (s.user?.email || '').toLowerCase().includes(q)
        )
      : withRank;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classrooms, branch, activeClassroomId, search, sortBy]);

  const totalPoints = ranked.reduce((sum, r) => sum + (Number(r.student.points) || 0), 0);
  const average = ranked.length ? totalPoints / ranked.length : 0;
  const top3 = !search.trim() ? ranked.filter((r) => r.rank <= 3).slice(0, 3) : [];
  const unitLabel = sortBy === 'coins' ? 'coins' : 'pts';

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
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Rank by"
        >
          <option value="points">Rank by Points</option>
          <option value="coins">Rank by Coins</option>
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 300 }}>
          <input
            type="text"
            placeholder="Search students..."
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
      </div>

      {/* SUMMARY */}
      <div className="lb-stats">
        <div className="lb-stat">
          <Users className="w-4 h-4" />
          <div>
            <b>{ranked.length}</b>
            <span>Students</span>
          </div>
        </div>
        <div className="lb-stat">
          <Star className="w-4 h-4" />
          <div>
            <b>{fmt(totalPoints)}</b>
            <span>Total points</span>
          </div>
        </div>
        <div className="lb-stat">
          <Trophy className="w-4 h-4" />
          <div>
            <b>{fmt(Math.round(average * 10) / 10)}</b>
            <span>Average points</span>
          </div>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="table-card">
          <div className="empty-state">
            <div className="empty-icon">
              <Trophy className="w-7 h-7 text-[#F2A807]" />
            </div>
            <div className="empty-title">No Students Found</div>
            <p className="empty-desc">
              {search ? `No students matching "${search}".` : 'There are no students to rank here yet.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* PODIUM */}
          {top3.length > 0 && (
            <div className="lb-podium" aria-label="Top three students">
              {[2, 1, 3].map((place) => {
                const entries = top3.filter((r) => r.rank === place);
                const entry = entries[0];
                if (!entry) return <div key={place} className="lb-podium-slot" />;
                const p = PODIUM[place];
                return (
                  <div key={place} className="lb-podium-slot">
                    {place === 1 ? (
                      <Crown className="w-6 h-6" style={{ color: '#F2A807' }} />
                    ) : (
                      <Medal className="w-5 h-5" style={{ color: p.ring }} />
                    )}
                    <Avatar student={entry.student} size={place === 1 ? 58 : 48} ring={p.ring} />
                    <div className="lb-podium-name" title={nameOf(entry.student)}>
                      {nameOf(entry.student)}
                    </div>
                    <div className="lb-podium-score">
                      {fmt(entry.value)} <small>{unitLabel}</small>
                    </div>
                    <div className="lb-podium-block" style={{ background: p.bg, height: p.height }}>
                      {p.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FULL RANKED LIST */}
          <div className="table-card">
            <div className={`lb-row lb-head ${showBranchFilter ? 'lb-wide' : ''}`}>
              <div className="col-center">Rank</div>
              <div>Student</div>
              <div className="lb-hide-sm">Class</div>
              {showBranchFilter && <div className="lb-hide-sm">Branch</div>}
              <div className="lb-num">Points</div>
              <div className="lb-num">Coins</div>
            </div>

            {ranked.map(({ student: s, rank }) => {
              const classes = classesOf(s);
              return (
                <div key={s.id} className={`lb-row ${showBranchFilter ? 'lb-wide' : ''} ${rank <= 3 ? 'lb-top' : ''}`}>
                  <div className="col-center">
                    <span className={`lb-rank lb-rank-${rank <= 3 ? rank : 'n'}`}>{rank}</span>
                  </div>
                  <div className="lb-student">
                    <Avatar student={s} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div className="lb-name">{nameOf(s)}</div>
                      <div className="lb-sub lb-show-sm">{classes.map((c) => c.name).join(', ') || '—'}</div>
                    </div>
                  </div>
                  <div className="lb-hide-sm lb-sub">{classes.map((c) => c.name).join(', ') || '—'}</div>
                  {showBranchFilter && (
                    <div className="lb-hide-sm lb-sub">
                      {[...new Set(classes.map((c) => c.branch).filter(Boolean))].join(', ') || '—'}
                    </div>
                  )}
                  <div className="lb-num lb-points">
                    <Star className="w-3.5 h-3.5" style={{ color: '#F2A807' }} /> {fmt(Number(s.points) || 0)}
                  </div>
                  <div className="lb-num lb-coins">
                    <Coins className="w-3.5 h-3.5" style={{ color: '#d99206' }} /> {s.coins || 0}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Leaderboard;
