import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BRANCH_OPTIONS, SPECIALTY_OPTIONS } from '../constants';
import { launchCoinCelebration } from '../utils/celebration';
import { StoreManagement } from './StoreManagement';
import {
  Users,
  GraduationCap,
  School,
  Star,
  Coins,
  Search,
  Plus,
  Trash2,
  X,
  Pencil,
  BookOpen,
  ShoppingBag,
} from 'lucide-react';

export const AdminDashboard = () => {
  const {
    state,
    addPoints,
    subtractPoints,
    addStudent,
    updateStudent,
    deleteStudent,
    addTeacher,
    updateTeacher,
    deleteTeacher,
    addClassroom,
    updateClassroom,
    deleteClassroom,
    unshareClassroom,
    addHomework,
    deleteHomework,
  } = useApp();

  const [activeTab, setActiveTab] = useState('students');
  const [searchTerm, setSearchTerm] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('ALL');

  // Per-row point inputs
  const [addAmounts, setAddAmounts] = useState({});
  const [subAmounts, setSubAmounts] = useState({});

  // Modals state
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);

  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showEditTeacherModal, setShowEditTeacherModal] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState(null);
  const [teacherToDelete, setTeacherToDelete] = useState(null);

  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showEditClassModal, setShowEditClassModal] = useState(false);
  const [classroomToEdit, setClassroomToEdit] = useState(null);
  const [classroomToDelete, setClassroomToDelete] = useState(null);

  const [showAddHomeworkModal, setShowAddHomeworkModal] = useState(false);

  // Forms
  const [studentForm, setStudentForm] = useState({
    name: '',
    email: '',
    password: '',
    age: '11',
    classroomId: '',
  });

  const [editStudentForm, setEditStudentForm] = useState({
    name: '',
    email: '',
    password: '',
    age: '11',
    classroomId: '',
  });

  const [teacherForm, setTeacherForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    classroomName: '',
  });

  const [editTeacherForm, setEditTeacherForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    classroomName: '',
  });

  const [classForm, setClassForm] = useState({
    branch: 'Bordj Kiffan',
    specialty: 'SE1',
    customName: '',
    teacherId: '',
  });

  const [editClassForm, setEditClassForm] = useState({
    name: '',
    branch: 'Bordj Kiffan',
    specialty: 'SE1',
    teacherId: '',
  });

  const [homeworkForm, setHomeworkForm] = useState({
    classroomId: '',
    title: '',
    description: '',
    dueDate: '',
  });

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

  const studentsList = state?.students || [];
  const teachersList = state?.teachers || [];
  const classroomsList = state?.classrooms || [];
  const homeworksList = state?.homeworks || state?.homework || [];

  // Points handler with exact same behavior & animations as teacher page
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
      triggerToast(`Operation Failed`, res?.error || 'Cannot subtract points', 'danger');
    }
  };

  // Student CRUD
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!studentForm.name.trim()) return;
    const targetClassroomId = studentForm.classroomId || classroomsList[0]?.id || '';
    const studentName = studentForm.name.trim();

    try {
      const res = await addStudent({
        name: studentName,
        email: studentForm.email.trim().toLowerCase(),
        password: studentForm.password.trim() || 'password123',
        age: parseInt(studentForm.age, 10) || 11,
        classroomId: targetClassroomId,
      });
      if (res && res.success) {
        setShowAddStudentModal(false);
        setStudentForm({
          name: '',
          email: '',
          password: '',
          age: '11',
          classroomId: classroomsList[0]?.id || '',
        });
        triggerToast(`Student Added`, `"${studentName}" registered successfully`);
      } else {
        triggerToast(`Action Failed`, res?.error || 'Could not add student', 'danger');
      }
    } catch (err) {
      triggerToast(`Action Failed`, err?.message || 'Could not add student', 'danger');
    }
  };

  const handleSaveEditStudent = async (e) => {
    e.preventDefault();
    if (!studentToEdit) return;
    const studentName = editStudentForm.name.trim();

    try {
      const res = await updateStudent(studentToEdit.id, {
        name: studentName,
        email: editStudentForm.email.trim(),
        password: editStudentForm.password ? editStudentForm.password.trim() : undefined,
        age: parseInt(editStudentForm.age, 10) || 11,
        classroomId: editStudentForm.classroomId || classroomsList[0]?.id,
      });
      if (res && res.success) {
        setShowEditStudentModal(false);
        setStudentToEdit(null);
        triggerToast(`Student Updated`, `Saved changes for "${studentName}"`);
      } else {
        triggerToast(`Update Failed`, res?.error || 'Could not update student', 'danger');
      }
    } catch (err) {
      triggerToast(`Update Failed`, err?.message || 'Could not update student', 'danger');
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    const sName = studentToDelete.user?.firstName || 'Student';
    try {
      const res = await deleteStudent(studentToDelete.id);
      setShowDeleteModal(false);
      setStudentToDelete(null);
      if (res && res.success === false) {
        triggerToast(`Delete Failed`, res.error || 'Could not delete student', 'danger');
      } else {
        triggerToast(`Student Removed`, `Removed account for ${sName}`, 'danger');
      }
    } catch (err) {
      triggerToast(`Delete Failed`, err?.message || 'Could not delete student', 'danger');
    }
  };

  // Teacher CRUD
  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    if (!teacherForm.firstName.trim()) return;
    try {
      const res = await addTeacher({
        firstName: teacherForm.firstName.trim(),
        lastName: teacherForm.lastName.trim(),
        email: teacherForm.email.trim().toLowerCase(),
        password: teacherForm.password.trim() || 'teacher123',
        classroomName: teacherForm.classroomName.trim() || 'General Class',
      });
      if (res && res.success) {
        setShowAddTeacherModal(false);
        setTeacherForm({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          classroomName: '',
        });
        triggerToast(`Teacher Added`, `Added ${teacherForm.firstName} ${teacherForm.lastName}`);
      } else {
        triggerToast(`Action Failed`, res?.error || 'Could not add teacher', 'danger');
      }
    } catch (err) {
      triggerToast(`Action Failed`, err?.message || 'Could not add teacher', 'danger');
    }
  };

  const handleSaveEditTeacher = async (e) => {
    e.preventDefault();
    if (!teacherToEdit) return;
    try {
      const res = await updateTeacher(teacherToEdit.id, {
        firstName: editTeacherForm.firstName.trim(),
        lastName: editTeacherForm.lastName.trim(),
        email: editTeacherForm.email.trim().toLowerCase(),
        password: editTeacherForm.password ? editTeacherForm.password.trim() : undefined,
        classroomName: editTeacherForm.classroomName.trim(),
      });
      if (res && res.success) {
        setShowEditTeacherModal(false);
        setTeacherToEdit(null);
        triggerToast(`Teacher Updated`, `Saved profile changes`);
      } else {
        triggerToast(`Update Failed`, res?.error || 'Could not update teacher', 'danger');
      }
    } catch (err) {
      triggerToast(`Update Failed`, err?.message || 'Could not update teacher', 'danger');
    }
  };

  const handleConfirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    try {
      const res = await deleteTeacher(teacherToDelete.id);
      setShowDeleteTeacherModal(false);
      setTeacherToDelete(null);
      if (res && res.success === false) {
        triggerToast(`Delete Failed`, res.error || 'Could not delete teacher', 'danger');
      } else {
        triggerToast(`Teacher Deleted`, `Account removed`, 'danger');
      }
    } catch (err) {
      triggerToast(`Delete Failed`, err?.message || 'Could not delete teacher', 'danger');
    }
  };

  // Classroom CRUD
  const handleCreateClass = async (e) => {
    e.preventDefault();
    const autoName = classForm.customName.trim() || `${classForm.branch} - ${classForm.specialty}`;
    try {
      const res = await addClassroom({
        name: autoName,
        branch: classForm.branch,
        specialty: classForm.specialty,
        teacherId: classForm.teacherId || teachersList[0]?.id,
      });
      if (res && res.success) {
        setShowAddClassModal(false);
        setClassForm({
          branch: 'Bordj Kiffan',
          specialty: 'SE1',
          customName: '',
          teacherId: '',
        });
        triggerToast(`Class Created`, `Created "${autoName}"`);
      } else {
        triggerToast(`Creation Failed`, res?.error || 'Could not create classroom', 'danger');
      }
    } catch (err) {
      triggerToast(`Creation Failed`, err?.message || 'Could not create classroom', 'danger');
    }
  };

  const handleSaveEditClass = async (e) => {
    e.preventDefault();
    if (!classroomToEdit) return;
    try {
      const res = await updateClassroom(classroomToEdit.id, {
        name: editClassForm.name.trim(),
        branch: editClassForm.branch,
        specialty: editClassForm.specialty,
        teacherId: editClassForm.teacherId,
      });
      if (res && res.success) {
        setShowEditClassModal(false);
        setClassroomToEdit(null);
        triggerToast(`Class Updated`, `Saved classroom updates`);
      } else {
        triggerToast(`Update Failed`, res?.error || 'Could not update classroom', 'danger');
      }
    } catch (err) {
      triggerToast(`Update Failed`, err?.message || 'Could not update classroom', 'danger');
    }
  };

  const handleConfirmDeleteClass = async () => {
    if (!classroomToDelete) return;
    try {
      const res = await deleteClassroom(classroomToDelete.id);
      setShowDeleteClassModal(false);
      setClassroomToDelete(null);
      if (res && res.success === false) {
        triggerToast(`Delete Failed`, res.error || 'Could not delete classroom', 'danger');
      } else {
        triggerToast(`Class Deleted`, `Classroom removed`, 'danger');
      }
    } catch (err) {
      triggerToast(`Delete Failed`, err?.message || 'Could not delete classroom', 'danger');
    }
  };

  // Homework CRUD
  const handlePostHomework = async (e) => {
    e.preventDefault();
    if (!homeworkForm.title.trim()) return;
    const targetClassroomId = homeworkForm.classroomId || classroomsList[0]?.id;
    if (!targetClassroomId) {
      triggerToast(`Error`, `Please create a classroom first`, 'danger');
      return;
    }
    try {
      const res = await addHomework({
        classroomId: targetClassroomId,
        title: homeworkForm.title.trim(),
        description: homeworkForm.description.trim(),
        dueDate: homeworkForm.dueDate,
      });
      if (res && res.success) {
        setHomeworkForm({
          classroomId: '',
          title: '',
          description: '',
          dueDate: '',
        });
        setShowAddHomeworkModal(false);
        triggerToast(`Homework Posted`, `Assignment published.`);
      } else {
        triggerToast(`Failed`, res?.error || 'Could not post homework', 'danger');
      }
    } catch (err) {
      triggerToast(`Failed`, err?.message || 'Could not post homework', 'danger');
    }
  };

  // Filtered Students
  const filteredStudents = studentsList
    .filter((s) => {
      const matchSearch =
        s.user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.user.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.user.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchClass =
        classroomFilter === 'ALL'
          ? true
          : s.classroomId === classroomFilter ||
            classroomsList.find((c) => c.id === classroomFilter)?.studentIds?.includes(s.id);

      return matchSearch && matchClass;
    })
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  return (
    <div className="main">
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Full control over students, points, teachers, and classrooms.</p>
        </div>

        <div>
          {activeTab === 'students' && (
            <button
              className="add-btn"
              onClick={() => {
                setStudentForm({
                  name: '',
                  email: '',
                  password: '',
                  age: '11',
                  classroomId: classroomFilter !== 'ALL' ? classroomFilter : classroomsList[0]?.id || '',
                });
                setShowAddStudentModal(true);
              }}
            >
              <Plus className="w-4 h-4" /> Add Student
            </button>
          )}

          {activeTab === 'teachers' && (
            <button
              className="add-btn"
              onClick={() => {
                setTeacherForm({
                  firstName: '',
                  lastName: '',
                  email: '',
                  password: '',
                  classroomName: '',
                });
                setShowAddTeacherModal(true);
              }}
            >
              <Plus className="w-4 h-4" /> Add Teacher
            </button>
          )}

          {activeTab === 'classrooms' && (
            <button
              className="add-btn"
              onClick={() => {
                setClassForm({
                  branch: 'Bordj Kiffan',
                  specialty: 'SE1',
                  customName: '',
                  teacherId: teachersList[0]?.id || '',
                });
                setShowAddClassModal(true);
              }}
            >
              <Plus className="w-4 h-4" /> New Class
            </button>
          )}

          {activeTab === 'homework' && (
            <button
              className="add-btn"
              onClick={() => {
                setHomeworkForm({
                  classroomId: classroomsList[0]?.id || '',
                  title: '',
                  description: '',
                  dueDate: '',
                });
                setShowAddHomeworkModal(true);
              }}
            >
              <Plus className="w-4 h-4" /> Post Homework
            </button>
          )}
        </div>
      </div>

      {/* COMPACT NAVIGATION TABS */}
      <div className="tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          Students
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'teachers' ? 'active' : ''}`}
          onClick={() => setActiveTab('teachers')}
        >
          Teachers
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'classrooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('classrooms')}
        >
          Classrooms
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'homework' ? 'active' : ''}`}
          onClick={() => setActiveTab('homework')}
        >
          Homework
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => setActiveTab('store')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ShoppingBag className="w-4 h-4 text-amber-500" />
          Rewards Store
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

      {/* ========================================================================= */}
      {/* TAB 1: STUDENTS (EXACT SAME POINT CONTROLS & DESIGN AS TEACHER PAGE) */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div>
          {/* FILTER & SEARCH TOOLS */}
          <div className="class-tools">
            <select
              className="class-select"
              value={classroomFilter}
              onChange={(e) => setClassroomFilter(e.target.value)}
            >
              <option value="ALL">All Classrooms ({studentsList.length} Students)</option>
              {classroomsList.map((c) => {
                const count = studentsList.filter(
                  (s) => s.classroomId === c.id || c.studentIds?.includes(s.id)
                ).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count})
                  </option>
                );
              })}
            </select>

            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '13px',
                  fontWeight: '600',
                  outline: 'none',
                }}
              />
              <Search
                className="w-4 h-4"
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              />
            </div>

            <span className="class-count">
              Showing {filteredStudents.length} of {studentsList.length} students
            </span>
          </div>

          {/* STUDENT TABLE */}
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

            {filteredStudents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Users className="w-7 h-7 text-[#F2A807]" />
                </div>
                <div className="empty-title">No Students Found</div>
                <p className="empty-desc">
                  {searchTerm
                    ? `No students matching "${searchTerm}".`
                    : 'There are no students registered yet.'}
                </p>
                <button
                  type="button"
                  className="empty-action"
                  onClick={() => {
                    setStudentForm({
                      name: '',
                      email: '',
                      password: '',
                      age: '11',
                      classroomId: classroomFilter !== 'ALL' ? classroomFilter : classroomsList[0]?.id || '',
                    });
                    setShowAddStudentModal(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> Add Student
                </button>
              </div>
            ) : (
              filteredStudents.map((s, index) => {
                const rank = index + 1;
                const rankClass =
                  rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                const isFlashing = flashRowId === s.id;
                const flashClass = isFlashing
                  ? flashType === 'add'
                    ? 'flash-add'
                    : 'flash-sub'
                  : '';

                const studentClass =
                  classroomsList.find(
                    (c) => c.id === s.classroomId || c.studentIds?.includes(s.id)
                  )?.name || 'Unassigned';

                return (
                  <div key={s.id} className={`table-row ${flashClass}`}>
                    {/* RANK */}
                    <div className="rank-cell" data-label="Rank">
                      <div className={`rank-box ${rankClass}`}>{rank}</div>
                    </div>

                    {/* STUDENT NAME & CLASSROOM */}
                    <div>
                      <div className="player-name">
                        {s.user.firstName} {s.user.lastName}
                      </div>
                      <div className="player-age">
                        Class: {studentClass}
                        {s.age ? ` · Age ${s.age}` : ''}
                      </div>
                    </div>

                    {/* POINTS */}
                    <div className="pts-val" data-label="Points">
                      <Star className="w-4 h-4 fill-[#F2A807] text-[#F2A807]" />
                      <span>
                        {typeof s.points === 'number'
                          ? Number.isInteger(s.points)
                            ? s.points
                            : s.points.toFixed(1)
                          : s.points || 0}
                      </span>
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
                          setEditStudentForm({
                            name: `${s.user.firstName} ${s.user.lastName || ''}`.trim(),
                            email: s.user.email,
                            password: '',
                            age: String(s.age || 11),
                            classroomId: s.classroomId || '',
                          });
                          setShowEditStudentModal(true);
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEACHERS */}
      {/* ========================================================================= */}
      {activeTab === 'teachers' && (
        <div className="table-card">
          <div
            className="table-head"
            style={{ gridTemplateColumns: '1.5fr 1.5fr 1.5fr 100px' }}
          >
            <div>Teacher Name</div>
            <div>Email Address</div>
            <div>Assigned Classrooms</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {teachersList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <GraduationCap className="w-7 h-7 text-[#F2A807]" />
              </div>
              <div className="empty-title">No Teachers Found</div>
              <p className="empty-desc">Create your first faculty teacher account.</p>
              <button
                type="button"
                className="empty-action"
                onClick={() => setShowAddTeacherModal(true)}
              >
                <Plus className="w-4 h-4" /> Add Teacher
              </button>
            </div>
          ) : (
            teachersList.map((t) => {
              const teacherClasses = classroomsList.filter(
                (c) => c.teacherId === t.id || c.sharedWithTeacherIds?.includes(t.id)
              );

              return (
                <div
                  key={t.id}
                  className="table-row"
                  style={{ gridTemplateColumns: '1.5fr 1.5fr 1.5fr 100px' }}
                >
                  <div>
                    <div className="player-name">
                      {t.user?.firstName} {t.user?.lastName}
                    </div>
                    <div className="player-age">Faculty Member</div>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: '600' }}>
                    {t.user?.email}
                  </div>

                  <div>
                    {teacherClasses.length === 0 ? (
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        No classes assigned
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {teacherClasses.map((c) => (
                          <span
                            key={c.id}
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              background: '#f3f4f6',
                              color: 'var(--navy)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="actions-cell">
                    <button
                      className="icon-btn"
                      title="Edit teacher"
                      onClick={() => {
                        setTeacherToEdit(t);
                        setEditTeacherForm({
                          firstName: t.user?.firstName || '',
                          lastName: t.user?.lastName || '',
                          email: t.user?.email || '',
                          password: '',
                          classroomName: teacherClasses[0]?.name || '',
                        });
                        setShowEditTeacherModal(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      className="icon-btn del"
                      title="Delete teacher"
                      onClick={() => {
                        setTeacherToDelete(t);
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
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CLASSROOMS */}
      {/* ========================================================================= */}
      {activeTab === 'classrooms' && (
        <div className="table-card">
          <div
            className="table-head"
            style={{ gridTemplateColumns: '1.6fr 1.1fr 1.1fr 1.2fr 90px 100px' }}
          >
            <div>Classroom</div>
            <div>Branch / Section</div>
            <div>Specialty</div>
            <div>Teacher</div>
            <div>Students</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {classroomsList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <School className="w-7 h-7 text-[#F2A807]" />
              </div>
              <div className="empty-title">No Classrooms Available</div>
              <p className="empty-desc">Create your first class to start organizing students.</p>
              <button
                type="button"
                className="empty-action"
                onClick={() => setShowAddClassModal(true)}
              >
                <Plus className="w-4 h-4" /> New Class
              </button>
            </div>
          ) : (
            classroomsList.map((c) => {
              const enrolledCount = studentsList.filter(
                (s) => s.classroomId === c.id || c.studentIds?.includes(s.id)
              ).length;
              const teacherName =
                teachersList.find((t) => t.id === c.teacherId)?.user?.firstName ||
                c.teacher?.user?.firstName ||
                'Unassigned';

              return (
                <div
                  key={c.id}
                  className="table-row"
                  style={{ gridTemplateColumns: '1.6fr 1.1fr 1.1fr 1.2fr 90px 100px' }}
                >
                  <div>
                    <div className="player-name">{c.name}</div>
                    <div className="player-age">Room ID: {c.id}</div>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--navy)' }}>
                    {c.branch || 'Bordj Kiffan'}
                  </div>

                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        fontWeight: '800',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(242,168,7,0.12)',
                        color: '#a16207',
                      }}
                    >
                      {c.specialty || 'SE1'}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--navy)' }}>
                    {teacherName}
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--muted)' }}>
                    {enrolledCount} enrolled
                  </div>

                  <div className="actions-cell">
                    <button
                      className="icon-btn"
                      title="Edit classroom"
                      onClick={() => {
                        setClassroomToEdit(c);
                        setEditClassForm({
                          name: c.name,
                          branch: c.branch || 'Bordj Kiffan',
                          specialty: c.specialty || 'SE1',
                          teacherId: c.teacherId || '',
                        });
                        setShowEditClassModal(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      className="icon-btn del"
                      title="Delete classroom"
                      onClick={() => setClassroomToDelete(c)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HOMEWORK (CLEAN & SIMPLE WITHOUT NOTIFICATIONS) */}
      {/* ========================================================================= */}
      {activeTab === 'homework' && (
        <div className="table-card">
          <div
            className="table-head"
            style={{ gridTemplateColumns: '1.5fr 1.2fr 1.8fr 110px 80px' }}
          >
            <div>Assignment Title</div>
            <div>Classroom</div>
            <div>Description</div>
            <div>Due Date</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {homeworksList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <BookOpen className="w-7 h-7 text-[#F2A807]" />
              </div>
              <div className="empty-title">No Homework Assigned</div>
              <p className="empty-desc">Post homework assignments for your classes.</p>
              <button
                type="button"
                className="empty-action"
                onClick={() => setShowAddHomeworkModal(true)}
              >
                <Plus className="w-4 h-4" /> Post Homework
              </button>
            </div>
          ) : (
            homeworksList.map((hw) => {
              const classroomName =
                classroomsList.find((c) => c.id === hw.classroomId)?.name || 'General Class';

              return (
                <div
                  key={hw.id}
                  className="table-row"
                  style={{ gridTemplateColumns: '1.5fr 1.2fr 1.8fr 110px 80px' }}
                >
                  <div className="player-name">{hw.title}</div>

                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)' }}>
                    {classroomName}
                  </div>

                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hw.description || 'No description'}
                  </div>

                  <div>
                    {hw.dueDate ? (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#ca8a04' }}>
                        {hw.dueDate}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>No due date</span>
                    )}
                  </div>

                  <div className="actions-cell">
                    <button
                      className="icon-btn del"
                      title="Delete homework"
                      onClick={() => {
                        deleteHomework(hw.id);
                        triggerToast('Homework Removed', `Deleted "${hw.title}"`, 'danger');
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
      )}

      {/* ========================================================================= */}
      {/* TAB 5: REWARDS STORE & ORDER MANAGEMENT                                   */}
      {/* ========================================================================= */}
      {activeTab === 'store' && <StoreManagement />}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* ADD STUDENT MODAL */}
      <div className={`modal-overlay ${showAddStudentModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Add New Student</h2>
            <button
              type="button"
              onClick={() => setShowAddStudentModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateStudent}>
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Youssef Amrani"
                value={studentForm.name}
                onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                required
                placeholder="student@example.com"
                value={studentForm.email}
                onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Temporary Password</label>
              <input
                type="password"
                placeholder="Optional (defaults to student123)"
                value={studentForm.password}
                onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Age</label>
              <input
                type="number"
                min="5"
                max="25"
                value={studentForm.age}
                onChange={(e) => setStudentForm({ ...studentForm, age: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Assign to Classroom</label>
              <select
                value={studentForm.classroomId}
                onChange={(e) => setStudentForm({ ...studentForm, classroomId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {classroomsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddStudentModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Add Student
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EDIT STUDENT MODAL */}
      <div className={`modal-overlay ${showEditStudentModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Edit Student</h2>
            <button
              type="button"
              onClick={() => setShowEditStudentModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveEditStudent}>
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                required
                value={editStudentForm.name}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Email</label>
              <input
                type="email"
                required
                value={editStudentForm.email}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, email: e.target.value })}
              />
            </div>

            <div className="field">
              <label>New Password (leave blank to keep current)</label>
              <input
                type="password"
                placeholder="New password..."
                value={editStudentForm.password}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, password: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Age</label>
              <input
                type="number"
                min="5"
                max="25"
                value={editStudentForm.age}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, age: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Classroom</label>
              <select
                value={editStudentForm.classroomId}
                onChange={(e) => setEditStudentForm({ ...editStudentForm, classroomId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {classroomsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowEditStudentModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* DELETE STUDENT MODAL */}
      <div className={`modal-overlay ${studentToDelete ? 'open' : ''}`}>
        <div className="modal">
          <h2>Delete Student</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '10px 0 20px' }}>
            Are you sure you want to remove <strong>{studentToDelete?.user?.firstName} {studentToDelete?.user?.lastName}</strong>? This action cannot be undone.
          </p>
          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setStudentToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm danger"
              onClick={handleConfirmDeleteStudent}
            >
              Delete Student
            </button>
          </div>
        </div>
      </div>

      {/* ADD TEACHER MODAL */}
      <div className={`modal-overlay ${showAddTeacherModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Add New Teacher</h2>
            <button
              type="button"
              onClick={() => setShowAddTeacherModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateTeacher}>
            <div className="field">
              <label>First Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah"
                value={teacherForm.firstName}
                onChange={(e) => setTeacherForm({ ...teacherForm, firstName: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Last Name</label>
              <input
                type="text"
                placeholder="e.g. Mansouri"
                value={teacherForm.lastName}
                onChange={(e) => setTeacherForm({ ...teacherForm, lastName: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                required
                placeholder="teacher@example.com"
                value={teacherForm.email}
                onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                placeholder="Optional (defaults to teacher123)"
                value={teacherForm.password}
                onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddTeacherModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Add Teacher
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EDIT TEACHER MODAL */}
      <div className={`modal-overlay ${showEditTeacherModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Edit Teacher</h2>
            <button
              type="button"
              onClick={() => setShowEditTeacherModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveEditTeacher}>
            <div className="field">
              <label>First Name</label>
              <input
                type="text"
                required
                value={editTeacherForm.firstName}
                onChange={(e) => setEditTeacherForm({ ...editTeacherForm, firstName: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Last Name</label>
              <input
                type="text"
                value={editTeacherForm.lastName}
                onChange={(e) => setEditTeacherForm({ ...editTeacherForm, lastName: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                required
                value={editTeacherForm.email}
                onChange={(e) => setEditTeacherForm({ ...editTeacherForm, email: e.target.value })}
              />
            </div>

            <div className="field">
              <label>New Password (leave blank to keep current)</label>
              <input
                type="password"
                placeholder="New password..."
                value={editTeacherForm.password}
                onChange={(e) => setEditTeacherForm({ ...editTeacherForm, password: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowEditTeacherModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* DELETE TEACHER MODAL */}
      <div className={`modal-overlay ${teacherToDelete ? 'open' : ''}`}>
        <div className="modal">
          <h2>Delete Teacher</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '10px 0 20px' }}>
            Are you sure you want to remove teacher account <strong>{teacherToDelete?.user?.firstName} {teacherToDelete?.user?.lastName}</strong>?
          </p>
          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setTeacherToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm danger"
              onClick={handleConfirmDeleteTeacher}
            >
              Delete Teacher
            </button>
          </div>
        </div>
      </div>

      {/* ADD CLASS MODAL (WITHOUT BRANCHES) */}
      <div className={`modal-overlay ${showAddClassModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Create New Class</h2>
            <button
              type="button"
              onClick={() => setShowAddClassModal(false)}
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
                value={classForm.branch}
                onChange={(e) => setClassForm({ ...classForm, branch: e.target.value })}
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
                value={classForm.specialty}
                onChange={(e) => setClassForm({ ...classForm, specialty: e.target.value })}
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

            {/* ASSIGNED TEACHER */}
            <div className="field">
              <label>Assigned Teacher</label>
              <select
                value={classForm.teacherId}
                onChange={(e) => setClassForm({ ...classForm, teacherId: e.target.value })}
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
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user?.firstName} {t.user?.lastName} ({t.user?.email})
                  </option>
                ))}
              </select>
            </div>

            {/* CLASS NAME */}
            <div className="field">
              <label>Class Name</label>
              <input
                type="text"
                placeholder={`e.g. ${classForm.branch} - ${classForm.specialty}`}
                value={classForm.customName}
                onChange={(e) => setClassForm({ ...classForm, customName: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddClassModal(false)}
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

      {/* EDIT CLASS MODAL */}
      <div className={`modal-overlay ${showEditClassModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Edit Class</h2>
            <button
              type="button"
              onClick={() => setShowEditClassModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveEditClass}>
            <div className="field">
              <label>Class Name</label>
              <input
                type="text"
                required
                value={editClassForm.name}
                onChange={(e) => setEditClassForm({ ...editClassForm, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Branch / Section</label>
              <select
                value={editClassForm.branch}
                onChange={(e) => setEditClassForm({ ...editClassForm, branch: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {BRANCH_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Specialty</label>
              <select
                value={editClassForm.specialty}
                onChange={(e) => setEditClassForm({ ...editClassForm, specialty: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {SPECIALTY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Assigned Teacher</label>
              <select
                value={editClassForm.teacherId}
                onChange={(e) => setEditClassForm({ ...editClassForm, teacherId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user?.firstName} {t.user?.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* SHARED CO-TEACHERS LIST */}
            {classroomToEdit && (
              <div className="field" style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                  Shared Co-Teachers
                </label>
                {(() => {
                  const currentClass = classroomsList.find((c) => c.id === classroomToEdit.id) || classroomToEdit;
                  const sharedIds = currentClass.sharedWithTeacherIds || [];
                  const sharedTeachers = teachersList.filter((t) => sharedIds.includes(t.id));

                  if (sharedTeachers.length === 0) {
                    return (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        No additional co-teachers shared.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {sharedTeachers.map((st) => (
                        <div
                          key={st.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: '#f8fafc',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--navy)' }}>
                              {st.user?.firstName} {st.user?.lastName}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              {st.user?.email}
                            </div>
                          </div>
                          <button
                            type="button"
                            title="Remove co-teacher access"
                            onClick={() => {
                              unshareClassroom(classroomToEdit.id, st.id);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#dc2626',
                              background: 'rgba(220, 38, 38, 0.08)',
                              borderRadius: '4px',
                              border: '1px solid rgba(220, 38, 38, 0.2)',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowEditClassModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* DELETE CLASS MODAL */}
      <div className={`modal-overlay ${classroomToDelete ? 'open' : ''}`}>
        <div className="modal">
          <h2>Delete Classroom</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '10px 0 20px' }}>
            Are you sure you want to delete classroom <strong>{classroomToDelete?.name}</strong>?
          </p>
          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setClassroomToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm danger"
              onClick={handleConfirmDeleteClass}
            >
              Delete Class
            </button>
          </div>
        </div>
      </div>

      {/* POST HOMEWORK MODAL */}
      <div className={`modal-overlay ${showAddHomeworkModal ? 'open' : ''}`}>
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>Post Homework</h2>
            <button
              type="button"
              onClick={() => setShowAddHomeworkModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handlePostHomework}>
            <div className="field">
              <label>Select Classroom</label>
              <select
                required
                value={homeworkForm.classroomId}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, classroomId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: '700',
                  fontSize: '13px',
                }}
              >
                {classroomsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Homework Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Robot kinematics exercises"
                value={homeworkForm.title}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, title: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Description / Instructions</label>
              <textarea
                placeholder="Assignment guidelines..."
                value={homeworkForm.description}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '13px',
                  minHeight: '70px',
                }}
              />
            </div>

            <div className="field">
              <label>Due Date</label>
              <input
                type="date"
                value={homeworkForm.dueDate}
                onChange={(e) => setHomeworkForm({ ...homeworkForm, dueDate: e.target.value })}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowAddHomeworkModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Post Homework
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`toast ${toast.type === 'danger' ? 'danger' : toast.type === 'coin' ? 'coin' : ''}`}
        >
          <div className="toast-title">{toast.title}</div>
          {toast.desc && <div className="toast-desc">{toast.desc}</div>}
        </div>
      )}
    </div>
  );
};
