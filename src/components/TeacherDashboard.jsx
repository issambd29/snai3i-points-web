import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BRANCH_OPTIONS, SPECIALTY_OPTIONS } from '../constants';
import { Snai3iIcon } from './Snai3iIcon';
import { launchCoinCelebration } from '../utils/celebration';
import { AttendanceTracker } from './AttendanceTracker';
import { StoreManagement } from './StoreManagement';
import {
  Star,
  Coins,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Send,
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Calendar,
  ShoppingBag,
} from 'lucide-react';

export const TeacherDashboard = () => {
  const {
    state,
    currentUser,
    addPoints,
    subtractPoints,
    addStudent,
    updateStudent,
    deleteStudent,
    addClassroom,
    shareClassroom,
    unshareClassroom,
    addHomework,
    updateHomework,
    deleteHomework,
    setStudentAttendance,
    bulkMarkAttendance,
    clearDayAttendance,
    sendChatMessage,
  } = useApp();

  const teachersList = state?.teachers || [];
  const classroomsList = state?.classrooms || [];
  const studentsList = state?.students || [];
  const homeworkList = state?.homeworks || state?.homework || [];
  const messagesList = state?.messages || state?.chatMessages || [];

  const currentTeacher = teachersList.find((t) => t.userId === currentUser?.id);

  // Accessible classrooms
  const accessibleClassrooms = classroomsList.filter(
    (c) =>
      c.teacherId === currentTeacher?.id ||
      (c.sharedWithTeacherIds || []).includes(currentTeacher?.id || '')
  );

  const availableTeacherClassrooms =
    accessibleClassrooms.length > 0
      ? accessibleClassrooms
      : classroomsList.length > 0
      ? [classroomsList[0]]
      : [];

  const [selectedClassroomId, setSelectedClassroomId] = useState(
    availableTeacherClassrooms[0]?.id || classroomsList[0]?.id || ''
  );

  const activeClassroom =
    availableTeacherClassrooms.find((c) => c.id === selectedClassroomId) ||
    availableTeacherClassrooms[0] ||
    classroomsList[0];

  // Students enrolled in active classroom
  const classroomStudents = studentsList
    .filter(
      (s) =>
        activeClassroom?.studentIds?.includes(s.id) ||
        s.classroomId === activeClassroom?.id
    )
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  // Per-row point inputs
  const [addAmounts, setAddAmounts] = useState({});
  const [subAmounts, setSubAmounts] = useState({});

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewClassModal, setShowNewClassModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [studentToEdit, setStudentToEdit] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);

  // Forms
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    password: '',
    age: '11',
    classroomId: activeClassroom?.id || availableTeacherClassrooms[0]?.id || classroomsList[0]?.id || '',
  });
  const [editPassword, setEditPassword] = useState('');
  const [newClassForm, setNewClassForm] = useState({
    branch: 'Bordj Kiffan',
    specialty: 'SE1',
    customName: '',
  });
  const [shareEmail, setShareEmail] = useState('');
  const [activeTab, setActiveTab] = useState('points'); // 'points' | 'attendance'
  const [hwTitle, setHwTitle] = useState('');
  const [hwDesc, setHwDesc] = useState('');
  const [hwDue, setHwDue] = useState('');
  const [chatMessageText, setChatMessageText] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Animation & Toasts
  const [flashRowId, setFlashRowId] = useState(null);
  const [flashType, setFlashType] = useState('add');
  const [toast, setToast] = useState(null);

  const triggerToast = (title, desc = '', type = 'normal') => {
    setToast({ title, desc, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerFlash = (studentId, type) => {
    setFlashRowId(studentId);
    setFlashType(type);
    setTimeout(() => setFlashRowId(null), 700);
  };

  const handleAddPts = async (studentId) => {
    const rawVal = addAmounts[studentId] !== undefined ? addAmounts[studentId] : '1';
    const amount = Math.round(parseFloat(rawVal) * 10) / 10 || 1;
    triggerFlash(studentId, 'add');
    const res = await addPoints(studentId, amount);
    if (res && res.success) {
      if (res.newCoins > 0) {
        launchCoinCelebration(res.newCoins);
        triggerToast(`Coin earned! 🪙`, `${res.newCoins} new coin(s) awarded!`, 'coin');
      } else {
        triggerToast(`Points Added`, `+${amount} point(s) successfully awarded`);
      }
    } else if (res && !res.success) {
      triggerToast(`Cannot Award Points`, res.error || 'Failed to award points', 'danger');
    }
  };

  const handleSubPts = async (studentId) => {
    const rawVal = subAmounts[studentId] !== undefined ? subAmounts[studentId] : '1';
    const amount = Math.round(parseFloat(rawVal) * 10) / 10 || 1;
    triggerFlash(studentId, 'sub');
    const res = await subtractPoints(studentId, amount);
    if (res && res.success) {
      triggerToast(`Points Subtracted`, `-${amount} point(s) deducted`);
    } else {
      triggerToast(`Cannot Deduct`, res?.error || 'Minimum point balance reached', 'danger');
    }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!newStudent.name.trim() || !newStudent.email.trim()) return;
    const defaultClassId = activeClassroom?.id || availableTeacherClassrooms[0]?.id || classroomsList[0]?.id || '';
    const targetClassroomId = newStudent.classroomId || defaultClassId;
    const studentName = newStudent.name.trim();

    try {
      const res = await addStudent({
        name: studentName,
        email: newStudent.email.trim().toLowerCase(),
        password: newStudent.password.trim() || 'password123',
        age: newStudent.age,
        classroomId: targetClassroomId,
      });
      if (res && res.success) {
        setShowAddModal(false);
        setNewStudent({
          name: '',
          email: '',
          password: '',
          age: '11',
          classroomId: defaultClassId,
        });
        triggerToast(`Student Added`, `Account created for ${studentName}`);
      } else {
        triggerToast(`Cannot Add Student`, res?.error || 'Failed to add student', 'danger');
      }
    } catch (err) {
      triggerToast(`Cannot Add Student`, err?.message || 'Failed to add student', 'danger');
    }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!studentToEdit) return;
    const fullName = `${studentToEdit.user?.firstName || ''} ${studentToEdit.user?.lastName || ''}`.trim();
    const displayName = studentToEdit.user?.firstName || fullName || 'Student';

    try {
      const res = await updateStudent(studentToEdit.id, {
        name: fullName,
        email: studentToEdit.user?.email,
        password: editPassword.trim() || undefined,
        classroomId: studentToEdit.classroomId || activeClassroom?.id,
        age: studentToEdit.age,
      });
      if (res && res.success) {
        setShowEditModal(false);
        setEditPassword('');
        triggerToast(`Student Updated`, `Saved details for ${displayName}`);
      } else {
        triggerToast(`Update Failed`, res?.error || 'Failed to update student', 'danger');
      }
    } catch (err) {
      triggerToast(`Update Failed`, err?.message || 'Failed to update student', 'danger');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!studentToDelete) return;
    const studentName = studentToDelete.user?.firstName || 'Student';
    try {
      const res = await deleteStudent(studentToDelete.id);
      setShowDeleteModal(false);
      if (res && res.success === false) {
        triggerToast(`Cannot Remove Student`, res.error || 'Failed to delete student', 'danger');
      } else {
        triggerToast(`Student Removed`, `Removed ${studentName} from classroom list`, 'danger');
      }
    } catch (err) {
      triggerToast(`Cannot Remove Student`, err?.message || 'Failed to delete student', 'danger');
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    const autoName = newClassForm.customName.trim() || `${newClassForm.branch} - ${newClassForm.specialty}`;
    try {
      const res = await addClassroom({
        name: autoName,
        branch: newClassForm.branch,
        specialty: newClassForm.specialty,
        teacherId: currentTeacher?.id,
      });
      if (res && res.success) {
        setShowNewClassModal(false);
        setNewClassForm({
          branch: 'Bordj Kiffan',
          specialty: 'SE1',
          customName: '',
        });
        if (res.classroomId) {
          setSelectedClassroomId(res.classroomId);
        }
        triggerToast(`Class Created`, `Created room "${autoName}"`);
      } else {
        triggerToast(`Creation Failed`, res?.error || 'Could not create classroom', 'danger');
      }
    } catch (err) {
      triggerToast(`Creation Failed`, err?.message || 'Could not create classroom', 'danger');
    }
  };

  const handleShareSubmit = async (e) => {
    e.preventDefault();
    if (!shareEmail.trim() || !activeClassroom) return;
    try {
      const res = await shareClassroom(activeClassroom.id, shareEmail.trim().toLowerCase());
      if (res && res.success) {
        setShareEmail('');
        triggerToast(`Access Shared`, `Shared with ${res.teacherName || shareEmail}`);
      } else {
        triggerToast(`Share Failed`, res?.error || 'Teacher not found', 'danger');
      }
    } catch (err) {
      triggerToast(`Share Failed`, err?.message || 'Failed to share classroom', 'danger');
    }
  };

  const handleAddHomework = async (e) => {
    e.preventDefault();
    if (!hwTitle.trim() || !activeClassroom) return;
    try {
      const res = await addHomework({
        classroomId: activeClassroom.id,
        title: hwTitle.trim(),
        description: hwDesc.trim(),
        dueDate: hwDue,
      });
      
      setHwTitle('');
      setHwDesc('');
      setHwDue('');

      if (res && res.success) {
        triggerToast('Homework Posted', `Assignment added to ${activeClassroom?.name || 'class'}.`);
      } else {
        triggerToast('Failed', res?.error || 'Could not assign homework', 'danger');
      }
    } catch (err) {
      triggerToast('Failed', err?.message || 'Could not assign homework', 'danger');
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatMessageText.trim()) return;
    sendChatMessage(activeClassroom.id, chatMessageText);
    setChatMessageText('');
  };

  const classroomHomeworks = homeworkList.filter(
    (h) => h.classroomId === activeClassroom?.id
  );
  const classroomMessages = messagesList.filter(
    (m) => m.classroomId === activeClassroom?.id
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const activeClassroomAttendance = (state.attendance || []).filter(
    (a) => a.classroomId === activeClassroom?.id && a.date === todayStr
  );
  const presentTodayCount = activeClassroomAttendance.filter(
    (a) => a.status === 'present'
  ).length;

  return (
    <div className="main">
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <h1>Class Points Tracker</h1>
          <p>Manage, mark presence, and reward student achievements with points and coins.</p>
        </div>
        <button
          className="add-btn"
          onClick={() => {
            setNewStudent({
              name: '',
              email: '',
              password: '',
              age: '11',
              classroomId: activeClassroom?.id || availableTeacherClassrooms[0]?.id,
            });
            setShowAddModal(true);
          }}
        >
          <Plus className="w-4 h-4" /> Add Student
        </button>
      </div>

      {/* CLASS TOOLS */}
      <div className="class-tools">
        <select
          className="class-select"
          value={selectedClassroomId}
          onChange={(e) => setSelectedClassroomId(e.target.value)}
        >
          {availableTeacherClassrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.teacherId !== currentTeacher?.id ? '(Shared)' : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="share-btn"
          onClick={() => setShowShareModal(true)}
        >
          Share Class
        </button>

        <button
          type="button"
          className="new-class-btn"
          onClick={() => setShowNewClassModal(true)}
        >
          + New Class
        </button>

        <span className="class-count">
          {classroomStudents.length} student{classroomStudents.length === 1 ? '' : 's'} enrolled
        </span>
      </div>

      {/* TABS */}
      <div className="tabs" style={{ marginBottom: '22px' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'points' ? 'active' : ''}`}
          onClick={() => setActiveTab('points')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Star className="w-4 h-4" /> Points & Leaderboard
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <UserCheck className="w-4 h-4" /> Presence & Attendance
          {classroomStudents.length > 0 && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '999px',
                background: activeTab === 'attendance' ? 'rgba(255,255,255,0.25)' : 'rgba(34, 197, 94, 0.15)',
                color: activeTab === 'attendance' ? '#fff' : '#15803d',
                fontWeight: '800',
              }}
            >
              {presentTodayCount}/{classroomStudents.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => setActiveTab('store')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ShoppingBag className="w-4 h-4 text-amber-500" /> Rewards Store
          {(state?.orders || []).filter((o) => o.status === 'pending').length > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: '800',
                padding: '2px 6px',
                borderRadius: '999px',
                background: '#EF4444',
                color: '#FFFFFF',
              }}
            >
              {(state?.orders || []).filter((o) => o.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'store' ? (
        <StoreManagement />
      ) : activeTab === 'attendance' ? (
        <AttendanceTracker
          classroomId={activeClassroom?.id}
          classroomName={activeClassroom?.name || 'This Class'}
          students={classroomStudents}
          attendance={state.attendance || []}
          onSetAttendance={setStudentAttendance}
          onBulkAttendance={bulkMarkAttendance}
          onClearAttendance={clearDayAttendance}
          triggerToast={triggerToast}
        />
      ) : (
        <>
          {/* COLLAB: HOMEWORK SECTION */}
          <div style={{ marginBottom: '22px' }}>
            <details className="collab-card homework-card">
              <summary className="homework-summary">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2>Class Homework</h2>
                  <span className="collab-badge">Classwork</span>
                </div>
              </summary>

              <div className="homework-content">
                <form className="homework-form" onSubmit={handleAddHomework}>
                  <input
                    type="text"
                    placeholder="Title"
                    required
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                  />
                  <textarea
                    placeholder="Instructions (optional)"
                    value={hwDesc}
                    onChange={(e) => setHwDesc(e.target.value)}
                    rows={1}
                  />
                  <input
                    type="date"
                    value={hwDue}
                    onChange={(e) => setHwDue(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="small-action"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Post Homework
                  </button>
                </form>

                <div style={{ marginTop: '16px' }}>
                  {classroomHomeworks.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      No homework assignments posted yet.
                    </p>
                  ) : (
                    classroomHomeworks.map((hw) => {
                      return (
                        <div
                          key={hw.id}
                          className="homework-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '12px 0',
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
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

                          <button
                            type="button"
                            className="icon-btn del"
                            title="Remove homework"
                            onClick={() => {
                              deleteHomework(hw.id);
                              triggerToast('Homework Removed', `Deleted "${hw.title}"`, 'danger');
                            }}
                            style={{ flexShrink: 0 }}
                          >
                            <Trash2 className="w-4 h-4 text-[#ef4444]" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* STUDENT TABLE / LIST */}
          <div className="table-card">
            <div className="table-head">
              <div className="col-center">Rank</div>
              <div>Student</div>
              <div>Points</div>
              <div>Coins</div>
              <div>Add Points</div>
              <div>Subtract Points</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            {classroomStudents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Users className="w-7 h-7 text-[#F2A807]" />
                </div>
                <div className="empty-title">
                  No Students in {activeClassroom?.name || 'This Class'}
                </div>
                <p className="empty-desc">
                  There are currently no students enrolled in this class. Click below to add your first student and start awarding points and tracking coins!
                </p>
                <button
                  type="button"
                  className="empty-action"
                  onClick={() => {
                    setNewStudent({
                      name: '',
                      email: '',
                      age: '11',
                      classroomId: activeClassroom?.id || availableTeacherClassrooms[0]?.id || classroomsList[0]?.id || '',
                    });
                    setShowAddModal(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> Add Student
                </button>
              </div>
            ) : (
              classroomStudents.map((s, index) => {
                const rank = index + 1;
                const rankClass =
                  rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                const isFlashing = flashRowId === s.id;
                const flashClass = isFlashing
                  ? flashType === 'add'
                    ? 'flash-add'
                    : 'flash-sub'
                  : '';

                const todayRecord = activeClassroomAttendance.find((a) => a.studentId === s.id);
                const todayStatus = todayRecord?.status;

                return (
                  <div key={s.id} className={`table-row ${flashClass}`}>
                    {/* RANK */}
                    <div className="rank-cell" data-label="Rank">
                      <div className={`rank-box ${rankClass}`}>{rank}</div>
                    </div>

                    {/* STUDENT NAME & CLASS/AGE */}
                    <div>
                      <span className="player-name">
                        {s.user.firstName} {s.user.lastName}
                      </span>
                      <div className="player-age">
                        Class: {activeClassroom?.name || 'Class A'}
                        {s.age ? ` · Age ${s.age}` : ''}
                      </div>
                    </div>

                    {/* POINTS */}
                    <div className="pts-val" data-label="Points">
                      <Star className="w-4 h-4 fill-[#F2A807] text-[#F2A807]" />
                      <span>{typeof s.points === 'number' ? (Number.isInteger(s.points) ? s.points : s.points.toFixed(1)) : (s.points || 0)}</span>
                    </div>

                    {/* COINS */}
                    <div className="coins-val" data-label="Coins">
                      <Coins className="w-4 h-4 text-[#ca8a04]" />
                      <span>{s.coins}</span>
                    </div>

                    {/* ADD POINTS CELL */}
                    <div className="add-pts-cell" data-label="Add Points">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={addAmounts[s.id] !== undefined ? addAmounts[s.id] : '1'}
                        onChange={(e) =>
                          setAddAmounts({ ...addAmounts, [s.id]: e.target.value })
                        }
                        className="pts-input"
                      />
                      <button
                        className="pts-submit"
                        onClick={() => handleAddPts(s.id)}
                      >
                        + Add
                      </button>
                    </div>

                    {/* SUBTRACT POINTS CELL */}
                    <div className="sub-pts-cell" data-label="Subtract Points">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={subAmounts[s.id] !== undefined ? subAmounts[s.id] : '1'}
                        onChange={(e) =>
                          setSubAmounts({ ...subAmounts, [s.id]: e.target.value })
                        }
                        className="pts-input sub-input"
                      />
                      <button
                        className="pts-subtract"
                        onClick={() => handleSubPts(s.id)}
                      >
                        − Sub
                      </button>
                    </div>

                    {/* ACTIONS */}
                    <div className="actions-cell">
                      <button
                        className="icon-btn"
                        title="Edit student"
                        onClick={() => {
                          setStudentToEdit(s);
                          setShowEditModal(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        className="icon-btn del"
                        title="Delete student"
                        onClick={() => {
                          setStudentToDelete(s);
                          setShowDeleteModal(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* FLOATING CHAT FAB */}
      <button
        className="chat-fab"
        onClick={() => setIsChatOpen(!isChatOpen)}
        title="Open class discussion"
      >
        <Snai3iIcon className="w-8 h-8" fill="#ffffff" />
      </button>

      {/* SLIDE-UP CHAT PANEL */}
      <div className={`chat-panel ${isChatOpen ? 'open' : ''}`}>
        <div className="collab-card">
          <div className="collab-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2>Class chat</h2>
              <span className="collab-badge">Live</span>
            </div>
            <button
              className="chat-close"
              onClick={() => setIsChatOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="chat-list">
            {classroomMessages.length === 0 ? (
              <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '40px' }}>
                No messages yet. Send a note to the class!
              </p>
            ) : (
              classroomMessages.map((msg) => (
                <div key={msg.id} className="chat-message">
                  <strong>{msg.senderName}: </strong>
                  <span>{msg.content}</span>
                </div>
              ))
            )}
          </div>

          <form className="chat-form" onSubmit={handleSendChat}>
            <input
              type="text"
              placeholder="Write a message…"
              value={chatMessageText}
              onChange={(e) => setChatMessageText(e.target.value)}
            />
            <button type="submit" className="small-action">
              Send
            </button>
          </form>
        </div>
      </div>

      {/* TOAST WRAPPER */}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toast.type}`}>
            <div className="toast-title">{toast.title}</div>
            {toast.desc && <div className="toast-desc">{toast.desc}</div>}
          </div>
        </div>
      )}

      {/* ADD STUDENT MODAL */}
      <div className={`modal-overlay ${showAddModal ? 'open' : ''}`}>
        <div className="modal">
          <h2>Add Student</h2>
          <form onSubmit={handleCreateStudent}>
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Omar Tazi"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Student Email (for Sign In)</label>
              <input
                type="email"
                required
                placeholder="e.g. omar@snai3i.com"
                value={newStudent.email}
                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Student Password</label>
              <input
                type="text"
                required
                placeholder="e.g. password123"
                value={newStudent.password}
                onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                The student will use this email & password to sign in.
              </span>
            </div>
            <div className="field">
              <label>Age</label>
              <input
                type="number"
                placeholder="e.g. 11"
                value={newStudent.age}
                onChange={(e) => setNewStudent({ ...newStudent, age: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Class</label>
              {availableTeacherClassrooms.length <= 1 ? (
                <div
                  style={{
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: '#f8fafc',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: 'var(--navy)',
                  }}
                >
                  {availableTeacherClassrooms[0]?.name || activeClassroom?.name || 'My Class'}
                </div>
              ) : (
                <select
                  value={newStudent.classroomId || activeClassroom?.id || availableTeacherClassrooms[0]?.id}
                  onChange={(e) =>
                    setNewStudent({ ...newStudent, classroomId: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '14px',
                    color: 'var(--navy)',
                    outline: 'none',
                    background: '#fff',
                  }}
                >
                  {availableTeacherClassrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.teacherId === currentTeacher?.id ? '(My Class)' : '(Shared)'}
                    </option>
                  ))}
                </select>
              )}
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                Students can only be enrolled in your assigned classroom.
              </span>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Enroll Student
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EDIT STUDENT MODAL */}
      <div className={`modal-overlay ${showEditModal ? 'open' : ''}`}>
        <div className="modal">
          <h2>Edit Student</h2>
          {studentToEdit && (
            <form onSubmit={handleUpdateStudent}>
              <div className="field">
                <label>First Name</label>
                <input
                  type="text"
                  required
                  value={studentToEdit.user?.firstName || ''}
                  onChange={(e) =>
                    setStudentToEdit({
                      ...studentToEdit,
                      user: { ...studentToEdit.user, firstName: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input
                  type="text"
                  value={studentToEdit.user?.lastName || ''}
                  onChange={(e) =>
                    setStudentToEdit({
                      ...studentToEdit,
                      user: { ...studentToEdit.user, lastName: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  value={studentToEdit.user?.email || ''}
                  onChange={(e) =>
                    setStudentToEdit({
                      ...studentToEdit,
                      user: { ...studentToEdit.user, email: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>New Password (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank to keep current password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Age</label>
                <input
                  type="number"
                  value={studentToEdit.age || ''}
                  onChange={(e) =>
                    setStudentToEdit({ ...studentToEdit, age: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Class</label>
                {availableTeacherClassrooms.length <= 1 ? (
                  <div
                    style={{
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: '#f8fafc',
                      fontSize: '14px',
                      fontWeight: '700',
                      color: 'var(--navy)',
                    }}
                  >
                    {availableTeacherClassrooms[0]?.name || activeClassroom?.name || 'My Class'}
                  </div>
                ) : (
                  <select
                    value={studentToEdit.classroomId || activeClassroom?.id || availableTeacherClassrooms[0]?.id}
                    onChange={(e) =>
                      setStudentToEdit({
                        ...studentToEdit,
                        classroomId: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: '14px',
                      color: 'var(--navy)',
                      outline: 'none',
                      background: '#fff',
                    }}
                  >
                    {availableTeacherClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.teacherId === currentTeacher?.id ? '(My Class)' : '(Shared)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditPassword('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-confirm">
                  Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* DELETE MODAL */}
      <div className={`modal-overlay ${showDeleteModal ? 'open' : ''}`}>
        <div className="modal">
          <h2>Remove Student</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '18px' }}>
            Are you sure you want to remove{' '}
            <strong>
              {studentToDelete?.user.firstName} {studentToDelete?.user.lastName}
            </strong>{' '}
            from this classroom?
          </p>
          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm danger"
              onClick={handleDeleteConfirm}
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* NEW CLASS MODAL (WITH 3 DROPDOWNS/INPUTS: BRANCH, SPECIALTY, SESSION TIME) */}
      <div className={`modal-overlay ${showNewClassModal ? 'open' : ''}`}>
        <div className="modal" style={{ maxWidth: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Create New Class</h2>
            <button
              type="button"
              onClick={() => setShowNewClassModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateClass}>
            {/* BRANCH OR SECTION */}
            <div className="field">
              <label>Branch / Section</label>
              <select
                required
                value={newClassForm.branch}
                onChange={(e) => setNewClassForm({ ...newClassForm, branch: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: 'var(--navy)',
                }}
              >
                {BRANCH_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* SPECIALTY */}
            <div className="field">
              <label>Specialty</label>
              <select
                required
                value={newClassForm.specialty}
                onChange={(e) => setNewClassForm({ ...newClassForm, specialty: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: 'var(--navy)',
                }}
              >
                {SPECIALTY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* CLASS NAME */}
            <div className="field">
              <label>Class Name</label>
              <input
                type="text"
                placeholder={`e.g. ${newClassForm.branch} - ${newClassForm.specialty}`}
                value={newClassForm.customName}
                onChange={(e) => setNewClassForm({ ...newClassForm, customName: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowNewClassModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Create Class
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SHARE / MANAGE CLASS ACCESS MODAL */}
      <div className={`modal-overlay ${showShareModal ? 'open' : ''}`}>
        <div className="modal" style={{ maxWidth: '480px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ margin: 0 }}>Class Access & Sharing</h2>
            <button
              type="button"
              onClick={() => {
                setShowShareModal(false);
                setShareEmail('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '18px' }}>
            Manage teacher permissions for <strong>{activeClassroom?.name}</strong>.
          </p>

          {/* SHARE WITH NEW TEACHER FORM */}
          <form onSubmit={handleShareSubmit} style={{ marginBottom: '22px' }}>
            <label style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>
              Grant Access to Teacher
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                required
                placeholder="teacher@snai3i.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '13px',
                }}
              />
              <button
                type="submit"
                className="btn-confirm"
                style={{
                  padding: '10px 18px',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                }}
              >
                <Plus className="w-4 h-4" /> Share
              </button>
            </div>
          </form>

          {/* TEACHERS WITH ACCESS LIST */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '10px' }}>
              Teachers with Access
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {/* PRIMARY OWNER */}
              {(() => {
                const owner = teachersList.find((t) => t.id === activeClassroom?.teacherId);
                const isMe = currentTeacher?.id === activeClassroom?.teacherId;
                const ownerName = owner?.user ? `${owner.user.firstName} ${owner.user.lastName}`.trim() : 'Lead Teacher';
                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'rgba(242,168,7,0.08)',
                      borderRadius: '8px',
                      border: '1px solid rgba(242,168,7,0.25)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>
                        {ownerName} {isMe && <span style={{ fontSize: '11px', color: '#b45309', fontWeight: '600' }}>(You)</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {owner?.user?.email || 'Owner'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#f2a807',
                        color: '#000',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Owner
                    </span>
                  </div>
                );
              })()}

              {/* CO-TEACHERS / SHARED TEACHERS */}
              {(() => {
                const sharedTeacherIds = activeClassroom?.sharedWithTeacherIds || [];
                const sharedTeachers = teachersList.filter((t) => sharedTeacherIds.includes(t.id));

                if (sharedTeachers.length === 0) {
                  return (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '8px 4px' }}>
                      No co-teachers shared yet.
                    </div>
                  );
                }

                const isClassOwner = currentTeacher?.id === activeClassroom?.teacherId;

                return sharedTeachers.map((t) => {
                  const isCurrentTeacher = currentTeacher?.id === t.id;
                  const teacherName = `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || t.user?.email || 'Teacher';

                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#ffffff',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>
                          {teacherName} {isCurrentTeacher && <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>(You)</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {t.user?.email}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(30, 41, 59, 0.08)',
                            color: 'var(--navy)',
                          }}
                        >
                          Co-Teacher
                        </span>

                        {/* REMOVE ACCESS BUTTON */}
                        {(isClassOwner || isCurrentTeacher) && (
                          <button
                            type="button"
                            title="Remove access for this teacher"
                            onClick={() => {
                              unshareClassroom(activeClassroom.id, t.id);
                              triggerToast('Access Removed', `Removed access for ${teacherName}`, 'default');
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#dc2626',
                              background: 'rgba(220, 38, 38, 0.08)',
                              borderRadius: '6px',
                              border: '1px solid rgba(220, 38, 38, 0.2)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                setShowShareModal(false);
                setShareEmail('');
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
