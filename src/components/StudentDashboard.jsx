import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Snai3iIcon } from './Snai3iIcon';
import { launchCoinCelebration } from '../utils/celebration';
import { Star, Coins, Trophy, BookOpen, UserCheck, ShoppingBag, LayoutDashboard } from 'lucide-react';
import { StudentStore } from './StudentStore';

export const StudentDashboard = () => {
  const { state, currentUser, sendChatMessage } = useApp();

  const studentsList = state?.students || [];
  const classroomsList = state?.classrooms || [];
  const homeworkList = state?.homeworks || state?.homework || [];
  const messagesList = state?.messages || state?.chatMessages || [];

  // Find active student
  const student =
    studentsList.find((s) => s.userId === currentUser?.id) || studentsList[0];

  // Active classroom
  const classroom =
    classroomsList.find((c) => c.studentIds?.includes(student?.id || '')) ||
    classroomsList.find((c) => c.id === student?.classroomId) ||
    classroomsList[0];

  const classroomStudents = studentsList
    .filter((s) => classroom?.studentIds?.includes(s.id) || s.classroomId === classroom?.id)
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  const totalStudents = classroomStudents.length || 1;
  const currentRank =
    classroomStudents.findIndex((s) => s.id === student?.id) !== -1
      ? classroomStudents.findIndex((s) => s.id === student?.id) + 1
      : 1;

  const points = student?.points || 0;
  const coins = student?.coins || 0;

  const homeworks = homeworkList.filter((h) => h.classroomId === classroom?.id);
  const classroomMessages = messagesList.filter(
    (m) => m.classroomId === classroom?.id
  );

  // Attendance metrics (Present vs Absent)
  const todayStr = new Date().toISOString().split('T')[0];
  const allStudentAtt = (state?.attendance || []).filter((a) => a.studentId === student?.id);
  const totalAttSessions = allStudentAtt.length;
  const presentSessions = allStudentAtt.filter((a) => a.status === 'present').length;
  const attRate = totalAttSessions > 0 ? Math.round((presentSessions / totalAttSessions) * 100) : 100;
  const todayAtt = allStudentAtt.find((a) => a.date === todayStr);

  // Next coin progress calculations
  const pointsInBlock = Math.round((points % 10) * 10) / 10;
  const pointsToNextCoin =
    pointsInBlock > 0
      ? Math.round((10 - pointsInBlock) * 10) / 10
      : 10;
  const progressPct = Math.min(100, Math.round((pointsInBlock / 10) * 100));

  const displayPoints = typeof points === 'number' ? (Number.isInteger(points) ? points : points.toFixed(1)) : points;
  const displayPointsInBlock = Number.isInteger(pointsInBlock) ? pointsInBlock : pointsInBlock.toFixed(1);
  const displayPointsToNext = Number.isInteger(pointsToNextCoin) ? pointsToNextCoin : pointsToNextCoin.toFixed(1);

  // States
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'store'
  const [toast, setToast] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);

  const isHydratedRef = useRef(false);
  const prevCoinsRef = useRef(coins);

  useEffect(() => {
    // Prevent triggering false celebration during initial mount / student hydration
    if (!isHydratedRef.current) {
      if (student) {
        isHydratedRef.current = true;
        prevCoinsRef.current = coins;
      }
      return;
    }

    // Only celebrate when coins genuinely increase (earned through points)
    if (typeof prevCoinsRef.current === 'number' && coins > prevCoinsRef.current) {
      const diff = coins - prevCoinsRef.current;
      launchCoinCelebration(diff);
      triggerToast('Coin earned! 🪙', `${diff} new coin(s) awarded!`, 'coin');
    }
    prevCoinsRef.current = coins;
  }, [coins, student]);

  const triggerToast = (title, desc = '', type = 'normal') => {
    setToast({ title, desc, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleInlineChatSend = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (typeof sendChatMessage === 'function') {
      sendChatMessage(classroom?.id || 'c-1', chatInput);
    }
    setChatInput('');
  };

  return (
    <div className="main student-main">
      {/* TOP HEADER & VIEW SWITCHER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 className="greeting" style={{ marginBottom: '2px' }}>
            Hello, <span>{currentUser?.firstName || student?.user?.firstName || 'Student'}</span>
          </h1>
          <p className="subtext" style={{ margin: 0 }}>
            Here's your progress in {classroom?.name || 'your class'}
          </p>
        </div>

        {/* NAVIGATION TABS */}
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`tab-btn ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview & Classwork
          </button>

          <button
            type="button"
            className={`tab-btn ${activeView === 'store' ? 'active' : ''}`}
            onClick={() => setActiveView('store')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ShoppingBag className="w-4 h-4" />
            Rewards Store
            <span
              style={{
                fontSize: '11px',
                fontWeight: '800',
                padding: '2px 7px',
                borderRadius: '999px',
                background: activeView === 'store' ? '#ffffff' : 'rgba(242,168,7,0.18)',
                color: activeView === 'store' ? '#F2A807' : '#92400e',
              }}
            >
              {coins} coins
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* REWARDS STORE VIEW                                        */}
      {/* ========================================================= */}
      {activeView === 'store' && <StudentStore />}

      {/* ========================================================= */}
      {/* OVERVIEW VIEW                                             */}
      {/* ========================================================= */}
      {activeView === 'overview' && (
        <>
          {/* STATS GRID */}
          <div className="stats-grid">
        {/* TOTAL POINTS */}
        <div className="stat-card points">
          <div className="stat-icon">
            <Star className="w-5 h-5 fill-[#F2A807] text-[#F2A807]" />
          </div>
          <div className="stat-label">Total Points</div>
          <div className="stat-value">{displayPoints}</div>
          <div className="stat-hint">Keep earning to unlock coins!</div>
        </div>

        {/* COINS EARNED */}
        <div
          className="stat-card coins"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveView('store')}
          title="Click to browse Rewards Store"
        >
          <div className="stat-icon">
            <Coins className="w-5 h-5 text-[#ca8a04]" />
          </div>
          <div className="stat-label">Coins Earned</div>
          <div className="stat-value">{coins}</div>
          <div className="stat-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Every 10 points = 1 coin</span>
            <span style={{ color: '#ca8a04', fontWeight: '800' }}>Store &rarr;</span>
          </div>
        </div>

        {/* CLASS RANK */}
        <div className="stat-card rank">
          <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
            <Trophy className="w-5 h-5 text-[#6366f1]" />
          </div>
          <div className="stat-label">Class Rank</div>
          <div className="stat-value" style={{ color: '#4f46e5' }}>#{currentRank}</div>
          <div className="stat-hint">Out of {totalStudents} students</div>
        </div>

        {/* ATTENDANCE / PRESENCE */}
        <div className="stat-card presence">
          <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.12)' }}>
            <UserCheck className="w-5 h-5 text-[#15803d]" />
          </div>
          <div className="stat-label">Presence</div>
          <div className="stat-value" style={{ color: '#15803d' }}>
            {totalAttSessions > 0 ? `${attRate}%` : '100%'}
          </div>
          <div className="stat-hint">
            {todayAtt
              ? `Today: ${todayAtt.status.toUpperCase()}`
              : `${presentSessions}/${totalAttSessions || 1} days recorded`}
          </div>
        </div>
      </div>

      {/* PROGRESS CARD */}
      <div className="progress-card">
        <div className="progress-header">
          <span className="progress-title">Progress to next coin</span>
          <span className="progress-target">
            {displayPointsToNext} pt{displayPointsToNext === '1' ? '' : 's'} away
          </span>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${progressPct}%` }}></div>
        </div>
        <div className="progress-footer">
          <span>{displayPointsInBlock} / 10 pts</span>
          <span>Next coin at {Math.floor(points / 10) * 10 + 10} pts</span>
        </div>
      </div>

      {/* HOMEWORK SECTION (Floating side ball for chat) */}
      <div className="collab-grid" style={{ gridTemplateColumns: '1fr', marginTop: '24px' }}>
        <div className="collab-card">
          <div className="collab-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen className="w-4 h-4 text-[#F2A807]" />
              <h2>Homework & Assignments</h2>
            </div>
            <span className="collab-badge">Classwork</span>
          </div>
          <div id="hw-list" style={{ minHeight: '120px' }}>
            {homeworks.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)', margin: '0 0 4px' }}>
                  No Homework Assigned Yet
                </p>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  Enjoy your free time or check back later!
                </p>
              </div>
            ) : (
              homeworks.map((hw) => {
                return (
                  <div key={hw.id} className="homework-item" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{hw.title}</strong>
                      {hw.dueDate && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#ca8a04',
                            fontWeight: '700',
                            background: '#fefce8',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid #fef08a',
                          }}
                        >
                          Due: {hw.dueDate}
                        </span>
                      )}
                    </div>
                    {hw.description && (
                      <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>
                        {hw.description}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* INFO CARD */}
      <div className="info-card" style={{ marginTop: '24px' }}>
        <h3>Your Details</h3>
        <div className="info-row">
          <span className="info-label">Full Name</span>
          <span className="info-value">
            {currentUser?.firstName || student?.user?.firstName} {currentUser?.lastName || student?.user?.lastName}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Class</span>
          <span className="info-value">{classroom?.name || 'Classroom'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Age</span>
          <span className="info-value">{student?.age ? `${student.age} years old` : '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Role</span>
          <span className="collab-badge">Student</span>
        </div>
      </div>

      {/* FLOATING CHAT SIDE BALL (FAB) */}
      <button
        className="chat-fab"
        onClick={() => setIsChatPanelOpen(!isChatPanelOpen)}
        title="Open class discussion"
        aria-label="Open class discussion"
      >
        <Snai3iIcon className="w-8 h-8" fill="#ffffff" />
      </button>

      {/* SLIDE-UP / SIDE CHAT PANEL */}
      <div className={`chat-panel ${isChatPanelOpen ? 'open' : ''}`}>
        <div className="collab-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="collab-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2>Class chat</h2>
              <span className="collab-badge">Live</span>
            </div>
            <button
              className="chat-close"
              onClick={() => setIsChatPanelOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="chat-list" style={{ flex: 1, overflowY: 'auto' }}>
            {classroomMessages.length === 0 ? (
              <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '40px' }}>
                No messages yet. Send a note to the class!
              </p>
            ) : (
              classroomMessages.map((msg) => (
                <div key={msg.id} className="chat-message">
                  <strong>{msg.senderName}: </strong>
                  <span>{msg.content || msg.body}</span>
                </div>
              ))
            )}
          </div>
          <form className="chat-form" onSubmit={handleInlineChatSend}>
            <input
              type="text"
              placeholder="Write a message…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="small-action">
              Send
            </button>
          </form>
        </div>
      </div>
      </>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type}`}>
            <div className="toast-title">{toast.title}</div>
            {toast.desc && <div className="toast-desc">{toast.desc}</div>}
          </div>
        </div>
      )}
    </div>
  );
};
