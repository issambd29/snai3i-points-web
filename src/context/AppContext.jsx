import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { initialAppState } from '../mockData';
import { launchCoinCelebration } from '../utils/celebration';

const STORAGE_KEY = 'snai3i_points_tracker_state_v6';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(false);
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...initialAppState,
          ...parsed,
          users: parsed.users || initialAppState.users,
          teachers: parsed.teachers || initialAppState.teachers,
          students: parsed.students || initialAppState.students,
          classrooms: parsed.classrooms || initialAppState.classrooms,
          homeworks: parsed.homeworks || parsed.homework || initialAppState.homeworks || [],
          messages: parsed.messages || parsed.chatMessages || initialAppState.messages || [],
          sentEmails: parsed.sentEmails || initialAppState.sentEmails || [],
          attendance: parsed.attendance || initialAppState.attendance || [],
          products: parsed.products || initialAppState.products || [],
          orders: parsed.orders || initialAppState.orders || [],
          currentUser: parsed.currentUser !== undefined ? parsed.currentUser : initialAppState.currentUser,
        };
      }
    } catch {
      // ignore
    }
    return initialAppState;
  });

  // Save cache to localStorage for fast local re-renders
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state cache', e);
    }
  }, [state]);

  // Verify the actual authenticated session with the backend (source of truth)
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/user');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setState((prev) => ({ ...prev, currentUser: data.user }));
          return data.user;
        }
        // No active session on the server — never trust a stale local cache
        setState((prev) => ({ ...prev, currentUser: null }));
        return null;
      }
    } catch (err) {
      console.warn('Could not verify session with server:', err);
    }
    return undefined; // undefined = could not verify (e.g. offline); leave state as-is
  }, []);

  // Fetch full state from live PostgreSQL database
  const fetchAppData = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/app-data');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDbConnected(true);
          setState((prev) => {
            // Retain active currentUser, refreshed with the latest data from the DB.
            // We never guess who is "logged in" here — identity only ever comes from
            // an explicit sign-in or a verified server session (see fetchCurrentUser).
            let current = prev.currentUser;
            if (current) {
              const matchedUser = (data.users || []).find(
                (u) =>
                  u.id === current.id ||
                  (u.email && current.email && u.email.toLowerCase() === current.email.toLowerCase()) ||
                  (u.username && current.username && u.username.toLowerCase() === current.username.toLowerCase())
              );
              // If the previously-known user no longer exists in the DB, sign out
              current = matchedUser || null;
            }

            return {
              ...prev,
              users: data.users || [],
              teachers: data.teachers || [],
              students: data.students || [],
              classrooms: data.classrooms || [],
              homeworks: data.homeworks || [],
              homework: data.homeworks || [],
              messages: data.messages || [],
              chatMessages: data.messages || [],
              attendance: data.attendance || data.attendances || [],
              products: data.products || [],
              orders: data.orders || [],
              currentUser: current,
            };
          });
        }
      }
    } catch (err) {
      console.warn('Could not sync with PostgreSQL API, using cached state:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial load and periodic sync for multi-device collaboration
  useEffect(() => {
    (async () => {
      await fetchCurrentUser();
      await fetchAppData(true);
    })();

    const interval = setInterval(() => {
      fetchAppData(false);
    }, 6000);

    const onFocus = () => fetchAppData(false);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAppData, fetchCurrentUser]);


  // AUTH: SIGN IN
  const signIn = async (email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setState((prev) => ({ ...prev, currentUser: data.user }));
        await fetchAppData(false);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'Invalid credentials' };
      }
    } catch {
      // Network/server error — never fall back to a passwordless local match.
      return { success: false, error: 'Could not reach the server. Please check your connection and try again.' };
    }
  };

  // AUTH: SIGN UP (Teacher)
  const signUp = async ({ firstName, lastName, email, password }) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setState((prev) => ({ ...prev, currentUser: data.user }));
        await fetchAppData(false);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'Failed to create account.' };
      }
    } catch (err) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const signOut = () => {
    setState((prev) => ({ ...prev, currentUser: null }));
    // Also invalidate the server-side session so a stale cookie can't silently
    // resume this user on the next load (e.g. on a shared computer).
    fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
  };

  // POINTS: ADD POINTS
  const addPoints = async (studentId, amount) => {
    const val = Math.round(Number(amount) * 10) / 10;
    if (isNaN(val) || val <= 0) {
      return { success: false, newCoins: 0, error: 'Amount must be greater than 0.' };
    }

    let newCoinsEarned = 0;

    // Optimistic UI update
    setState((prev) => {
      const updatedStudents = (prev.students || []).map((s) => {
        if (s.id === studentId) {
          const oldPoints = Number(s.points) || 0;
          const oldCoins = Math.floor(oldPoints / 10);
          const newPoints = Math.round((oldPoints + val) * 10) / 10;
          const newCoinsCalculated = Math.floor(newPoints / 10);
          const coinDiff = Math.max(0, newCoinsCalculated - oldCoins);
          newCoinsEarned = coinDiff;
          return {
            ...s,
            points: newPoints,
            coins: (s.coins || 0) + coinDiff,
          };
        }
        return s;
      });

      return {
        ...prev,
        students: updatedStudents,
      };
    });

    if (newCoinsEarned > 0) {
      launchCoinCelebration(newCoinsEarned);
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#F2A807', '#E5A000', '#FFD700', '#FFA500'],
      });
    }

    // Persist to PostgreSQL backend
    try {
      const res = await fetch(`/api/students/${studentId}/points/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.newCoins === 'number') {
          setState((prev) => ({
            ...prev,
            students: (prev.students || []).map((s) =>
              s.id === studentId
                ? { ...s, points: data.newPoints, coins: data.newCoins }
                : s
            ),
          }));
        }
        if (data.coinsEarned > 0 && newCoinsEarned === 0) {
          launchCoinCelebration(data.coinsEarned);
        }
        await fetchAppData(false);
      }
    } catch (e) {
      console.error('Error syncing add points to PostgreSQL:', e);
    }

    return { success: true, newCoins: newCoinsEarned };
  };

  // POINTS: SUBTRACT POINTS
  const subtractPoints = async (studentId, amount) => {
    const val = Math.round(Number(amount) * 10) / 10;
    if (isNaN(val) || val <= 0) {
      return { success: false, error: 'Amount must be greater than 0.' };
    }

    const student = (state.students || []).find((s) => s.id === studentId);
    if (!student) {
      return { success: false, error: 'Student not found.' };
    }

    if (val > student.points) {
      return {
        success: false,
        error: `Cannot subtract more than current points (${student.points}).`,
      };
    }

    // Optimistic UI update
    setState((prev) => {
      const updatedStudents = (prev.students || []).map((s) => {
        if (s.id === studentId) {
          const oldPoints = Number(s.points) || 0;
          const oldCoins = Math.floor(oldPoints / 10);
          const newPoints = Math.max(0, Math.round((oldPoints - val) * 10) / 10);
          const newCoinsCalculated = Math.floor(newPoints / 10);
          const lostCoins = Math.max(0, oldCoins - newCoinsCalculated);
          return {
            ...s,
            points: newPoints,
            coins: Math.max(0, (s.coins || 0) - lostCoins),
          };
        }
        return s;
      });

      return {
        ...prev,
        students: updatedStudents,
      };
    });

    // Persist to PostgreSQL backend
    try {
      const res = await fetch(`/api/students/${studentId}/points/subtract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.newCoins === 'number') {
          setState((prev) => ({
            ...prev,
            students: (prev.students || []).map((s) =>
              s.id === studentId
                ? { ...s, points: data.newPoints, coins: data.newCoins }
                : s
            ),
          }));
        }
      }
      await fetchAppData(false);
    } catch (e) {
      console.error('Error syncing subtract points to PostgreSQL:', e);
    }

    return { success: true };
  };

  // STUDENTS: CREATE STUDENT
  const addStudent = async ({ name, firstName, lastName, email, password, age, classroomId }) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || `${firstName || ''} ${lastName || ''}`).trim();
    if (!cleanName || !cleanEmail) {
      return { success: false, error: 'Name and email are required.' };
    }

    const parts = cleanName.split(' ');
    const fName = (firstName || parts[0] || '').trim();
    const lName = (lastName !== undefined ? lastName : parts.slice(1).join(' ') || '').trim();

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          firstName: fName,
          lastName: lName,
          email: cleanEmail,
          password: password ? password.trim() : 'password123',
          age: Number(age) || 11,
          classroomId: classroomId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true, studentId: data.studentId, userId: data.userId };
      } else {
        return { success: false, error: data.error || 'Failed to add student to database.' };
      }
    } catch (e) {
      return { success: false, error: e.message || 'Network error saving to database.' };
    }
  };

  // STUDENTS: UPDATE STUDENT
  const updateStudent = async (studentId, { name, firstName, lastName, email, password, age, classroomId, points, coins }) => {
    const cleanName = (name || `${firstName || ''} ${lastName || ''}`).trim();
    const parts = cleanName.split(' ');
    const fName = (firstName || parts[0] || '').trim();
    const lName = (lastName !== undefined ? lastName : parts.slice(1).join(' ') || '').trim();

    // Immediate optimistic state update
    setState((prev) => {
      const updatedStudents = (prev.students || []).map((s) => {
        if (s.id === studentId) {
          const updatedUser = {
            ...s.user,
            firstName: fName || s.user?.firstName,
            lastName: lName !== undefined ? lName : s.user?.lastName,
            email: email ? email.trim().toLowerCase() : s.user?.email,
          };
          return {
            ...s,
            age: age !== undefined ? Number(age) : s.age,
            points: points !== undefined ? Number(points) : s.points,
            coins: coins !== undefined ? Number(coins) : s.coins,
            classroomId: classroomId || s.classroomId,
            user: updatedUser,
          };
        }
        return s;
      });
      const updatedUsers = (prev.users || []).map((u) => {
        const matchStudent = (prev.students || []).find((s) => s.id === studentId);
        if (matchStudent && u.id === matchStudent.userId) {
          return {
            ...u,
            firstName: fName || u.firstName,
            lastName: lName !== undefined ? lName : u.lastName,
            email: email ? email.trim().toLowerCase() : u.email,
          };
        }
        return u;
      });
      return {
        ...prev,
        students: updatedStudents,
        users: updatedUsers,
      };
    });

    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName || undefined,
          firstName: fName || undefined,
          lastName: lName !== undefined ? lName : undefined,
          email: email ? email.trim().toLowerCase() : undefined,
          password: password ? password.trim() : undefined,
          age: age !== undefined ? Number(age) : undefined,
          classroomId: classroomId || undefined,
          points: points !== undefined ? Number(points) : undefined,
          coins: coins !== undefined ? Number(coins) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        await fetchAppData(false);
        return { success: false, error: data.error || 'Failed to update student.' };
      }
    } catch (e) {
      await fetchAppData(false);
      return { success: false, error: e.message || 'Network error updating student.' };
    }
  };

  // STUDENTS: DELETE STUDENT
  const deleteStudent = async (studentId) => {
    // Optimistic removal
    setState((prev) => ({
      ...prev,
      students: (prev.students || []).filter((s) => s.id !== studentId),
    }));

    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        await fetchAppData(false);
        return { success: false, error: data.error || 'Failed to delete student.' };
      }
    } catch (e) {
      await fetchAppData(false);
      return { success: false, error: e.message || 'Network error deleting student.' };
    }
  };

  // TEACHERS: CREATE TEACHER
  const addTeacher = async ({ firstName, lastName, email, classroomName, password }) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!firstName?.trim() || !cleanEmail) {
      return { success: false, error: 'First name and email are required.' };
    }

    try {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email: cleanEmail, classroomName, password }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true, teacherId: data.teacherId };
      } else {
        return { success: false, error: data.error || 'Failed to create teacher in database.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // TEACHERS: UPDATE TEACHER
  const updateTeacher = async (teacherId, { firstName, lastName, email, password, classroomName }) => {
    if (!firstName?.trim()) {
      return { success: false, error: 'First name is required.' };
    }

    try {
      const res = await fetch(`/api/teachers/${teacherId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, classroomName }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to update teacher.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // TEACHERS: DELETE TEACHER
  const deleteTeacher = async (teacherId) => {
    try {
      const res = await fetch(`/api/teachers/${teacherId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to delete teacher.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // CLASSROOMS: CREATE CLASSROOM
  const addClassroom = async (params) => {
    let name = '';
    let branch = '';
    let specialty = '';
    let sessionTime = '';
    let teacherId = null;

    if (typeof params === 'string') {
      name = params.trim();
    } else if (params && typeof params === 'object') {
      name = params.name ? params.name.trim() : '';
      branch = params.branch ? params.branch.trim() : '';
      specialty = params.specialty ? params.specialty.trim() : '';
      sessionTime = params.sessionTime || '';
      teacherId = params.teacherId || null;
    }

    if (!name && (branch || specialty)) {
      const parts = [];
      if (branch) parts.push(branch);
      if (specialty) parts.push(specialty);
      name = parts.join(' - ') || 'New Classroom';
    }

    if (!name?.trim()) {
      return { success: false, error: 'Class name is required.' };
    }

    try {
      const res = await fetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, branch, specialty, sessionTime, teacherId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true, classroomId: data.classroomId };
      } else {
        return { success: false, error: data.error || 'Failed to create classroom.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // CLASSROOMS: UPDATE CLASSROOM
  const updateClassroom = async (classroomId, { name, branch, specialty, sessionTime, teacherId }) => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, branch, specialty, sessionTime, teacherId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to update classroom.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // CLASSROOMS: DELETE CLASSROOM
  const deleteClassroom = async (classroomId) => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to delete classroom.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // CLASSROOMS: SHARE CLASSROOM
  const shareClassroom = async (classroomId, teacherEmail) => {
    const cleanEmail = (teacherEmail || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Teacher email is required.' };
    }

    try {
      const res = await fetch(`/api/classrooms/${classroomId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherEmail: cleanEmail }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true, teacherName: data.teacherName };
      } else {
        return { success: false, error: data.error || 'Failed to share classroom.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // CLASSROOMS: UNSHARE CLASSROOM
  const unshareClassroom = async (classroomId, teacherId) => {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/unshare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to remove share access.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // HOMEWORK: ADD HOMEWORK
  const addHomework = async ({ classroomId, title, description, dueDate }) => {
    if (!title?.trim()) {
      return { success: false, error: 'Homework title is required.' };
    }

    try {
      const res = await fetch('/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId,
          title,
          description,
          dueDate,
          teacherUserId: state.currentUser?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true, homework: { id: data.homeworkId, title, description, dueDate } };
      } else {
        return { success: false, error: data.error || 'Failed to save homework.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // HOMEWORK: DELETE HOMEWORK
  const deleteHomework = async (homeworkId) => {
    try {
      const res = await fetch(`/api/homework/${homeworkId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchAppData(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to delete homework.' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const updateHomework = async (homeworkId, { title, description, dueDate }) => {
    // For fast update
    return { success: true };
  };

  // MESSAGES: REFRESH MESSAGES
  const refreshMessages = useCallback(async (classroomId) => {
    try {
      const query = classroomId ? `?classroomId=${classroomId}` : '';
      const res = await fetch(`/api/messages${query}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          setState((prev) => ({
            ...prev,
            messages: data.messages,
            chatMessages: data.messages,
          }));
        }
      }
    } catch (e) {
      console.warn('Could not refresh messages:', e);
    }
  }, []);

  // MESSAGES: SEND MESSAGE
  const sendMessage = async (classroomId, body) => {
    const text = (body || '').trim();
    if (!text) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const tempId = `temp-${Date.now()}`;
    const user = state.currentUser;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const optimisticMsg = {
      id: tempId,
      classroomId: classroomId || 'c-1',
      senderId: user?.id || 'u-unknown',
      senderName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.name || user?.email || 'You',
      senderRole: user?.role || 'student',
      senderEmail: user?.email || '',
      text: text,
      body: text,
      content: text,
      timestamp: now.toISOString(),
      createdAt: timeStr,
    };

    // Optimistic UI update for instant feedback
    setState((prev) => ({
      ...prev,
      messages: [...(prev.messages || []), optimisticMsg],
      chatMessages: [...(prev.chatMessages || []), optimisticMsg],
    }));

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId,
          senderId: user?.id,
          body: text,
          text: text,
          content: text,
        }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setState((prev) => {
          const currentList = prev.messages || [];
          const updated = currentList.map((m) => (m.id === tempId ? data.message : m));
          if (!updated.some((m) => m.id === data.message.id)) {
            updated.push(data.message);
          }
          return {
            ...prev,
            messages: updated,
            chatMessages: updated,
          };
        });
        return { success: true, message: data.message };
      } else {
        // Rollback optimistic message if failed
        setState((prev) => ({
          ...prev,
          messages: (prev.messages || []).filter((m) => m.id !== tempId),
          chatMessages: (prev.chatMessages || []).filter((m) => m.id !== tempId),
        }));
        return { success: false, error: data.error || 'Failed to send message.' };
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        messages: (prev.messages || []).filter((m) => m.id !== tempId),
        chatMessages: (prev.chatMessages || []).filter((m) => m.id !== tempId),
      }));
      return { success: false, error: e.message };
    }
  };

  // ATTENDANCE: SET SINGLE STUDENT ATTENDANCE
  const setStudentAttendance = async (classroomId, studentId, date, status, note = '') => {
    if (!classroomId || !studentId) {
      return { success: false, error: 'Classroom and Student IDs are required.' };
    }
    const cleanDate = date || new Date().toISOString().split('T')[0];
    const normClassId = String(classroomId).startsWith('c-') ? String(classroomId) : `c-${classroomId}`;
    const rawClassId = String(classroomId).replace(/^c-/, '');
    const normStudentId = String(studentId).startsWith('s-') ? String(studentId) : `s-${studentId}`;
    const rawStudentId = String(studentId).replace(/^s-/, '');

    const markedBy = state.currentUser
      ? `${state.currentUser.firstName || ''} ${state.currentUser.lastName || ''}`.trim() || state.currentUser.email
      : 'Teacher';

    // Optimistic UI update
    setState((prev) => {
      const existingRecords = prev.attendance || [];
      const matchFilter = (a) => {
        const aClass = String(a.classroomId || '').replace(/^c-/, '');
        const aStudent = String(a.studentId || '').replace(/^s-/, '');
        return aClass === rawClassId && aStudent === rawStudentId && a.date === cleanDate;
      };

      if (!status || status === 'unmarked') {
        return {
          ...prev,
          attendance: existingRecords.filter((a) => !matchFilter(a)),
        };
      }

      const matchIndex = existingRecords.findIndex(matchFilter);
      const record = {
        id: `att-${normClassId}-${normStudentId}-${cleanDate}`,
        classroomId: normClassId,
        studentId: normStudentId,
        date: cleanDate,
        status,
        note: note || '',
        updatedAt: new Date().toISOString(),
        markedBy,
      };

      let updated;
      if (matchIndex >= 0) {
        updated = [...existingRecords];
        updated[matchIndex] = record;
      } else {
        updated = [...existingRecords, record];
      }

      return {
        ...prev,
        attendance: updated,
      };
    });

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId: normClassId,
          studentId: normStudentId,
          date: cleanDate,
          status,
          note,
          markedBy,
        }),
      });
      const data = await res.json();
      fetchAppData(false);
      return data;
    } catch (e) {
      console.error('Error saving attendance to PostgreSQL:', e);
      return { success: false, error: e?.message };
    }
  };

  // ATTENDANCE: BULK MARK ATTENDANCE
  const bulkMarkAttendance = async (classroomId, date, status, studentIds) => {
    if (!classroomId) {
      return { success: false, error: 'Classroom ID is required.' };
    }
    const cleanDate = date || new Date().toISOString().split('T')[0];
    const normClassId = String(classroomId).startsWith('c-') ? String(classroomId) : `c-${classroomId}`;
    const rawClassId = String(classroomId).replace(/^c-/, '');
    const markedBy = state.currentUser
      ? `${state.currentUser.firstName || ''} ${state.currentUser.lastName || ''}`.trim() || state.currentUser.email
      : 'Teacher';

    const classroom = (state.classrooms || []).find(
      (c) => c.id === classroomId || String(c.id).replace(/^c-/, '') === rawClassId
    );
    const targetStudentIds = (
      studentIds ||
      (state.students || [])
        .filter((s) => {
          const sClass = String(s.classroomId || '').replace(/^c-/, '');
          return sClass === rawClassId || classroom?.studentIds?.includes(s.id);
        })
        .map((s) => s.id)
    ).map((id) => (String(id).startsWith('s-') ? String(id) : `s-${id}`));

    const targetRawIds = targetStudentIds.map((id) => String(id).replace(/^s-/, ''));

    // Optimistic UI update
    setState((prev) => {
      const existing = prev.attendance || [];
      const isTarget = (a) => {
        const aClass = String(a.classroomId || '').replace(/^c-/, '');
        const aStudent = String(a.studentId || '').replace(/^s-/, '');
        return aClass === rawClassId && a.date === cleanDate && targetRawIds.includes(aStudent);
      };

      if (!status || status === 'unmarked') {
        return {
          ...prev,
          attendance: existing.filter((a) => !isTarget(a)),
        };
      }

      const withoutTargets = existing.filter((a) => !isTarget(a));
      const newRecords = targetStudentIds.map((sId) => ({
        id: `att-${normClassId}-${sId}-${cleanDate}`,
        classroomId: normClassId,
        studentId: sId,
        date: cleanDate,
        status,
        note: '',
        updatedAt: new Date().toISOString(),
        markedBy,
      }));

      return {
        ...prev,
        attendance: [...withoutTargets, ...newRecords],
      };
    });

    try {
      await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId: normClassId,
          date: cleanDate,
          status,
          studentIds: targetStudentIds,
          records: targetStudentIds.map((sId) => ({ studentId: sId, status })),
          markedBy,
        }),
      });
      fetchAppData(false);
    } catch (e) {
      console.error('Error saving bulk attendance to PostgreSQL:', e);
    }

    return { success: true };
  };

  // ATTENDANCE: CLEAR DAY ATTENDANCE
  const clearDayAttendance = async (classroomId, date) => {
    const cleanDate = date || new Date().toISOString().split('T')[0];
    const rawClassId = String(classroomId || '').replace(/^c-/, '');

    // Optimistically remove records for this classroom and date
    setState((prev) => ({
      ...prev,
      attendance: (prev.attendance || []).filter((a) => {
        const aClassId = String(a.classroomId || '').replace(/^c-/, '');
        const isSameClass = !classroomId || aClassId === rawClassId || a.classroomId === classroomId;
        const isSameDate = a.date === cleanDate;
        return !(isSameClass && isSameDate);
      }),
    }));

    try {
      const res = await fetch(`/api/attendance/day?classroomId=${classroomId || ''}&date=${cleanDate}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      await fetchAppData(false);
      return data;
    } catch (e) {
      console.error('Error clearing day attendance in PostgreSQL:', e);
      return { success: false, error: e?.message };
    }
  };

  const clearAllStudents = () => {
    setState((prev) => {
      const nonStudentUsers = (prev.users || []).filter((u) => u.role !== 'student');
      const updatedClassrooms = (prev.classrooms || []).map((c) => ({
        ...c,
        studentIds: [],
      }));
      return {
        ...prev,
        users: nonStudentUsers,
        students: [],
        classrooms: updatedClassrooms,
      };
    });
    return { success: true };
  };

  const resetData = () => {
    localStorage.removeItem(STORAGE_KEY);
    fetchAppData(true);
  };

  // ----------------------------------------------------
  // STORE / REWARDS ACTIONS
  // ----------------------------------------------------

  const uploadProductImage = async (file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/store/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload product image');
      }
      return { success: true, url: data.url };
    } catch (err) {
      console.error('Image upload error:', err);
      return { success: false, error: err.message };
    }
  };

  const purchaseProduct = async (studentId, productId) => {
    try {
      const res = await fetch('/api/store/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, productId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || "Purchase could not be processed. Please check your balance or item stock.",
        };
      }

      // Optimistically update student coin balance and product stock in local state
      if (typeof data.newCoins === 'number') {
        setState((prev) => ({
          ...prev,
          students: (prev.students || []).map((s) =>
            s.id === studentId ? { ...s, coins: data.newCoins } : s
          ),
          products: (prev.products || []).map((p) =>
            p.id === productId ? { ...p, stock: Math.max(0, (p.stock || 1) - 1) } : p
          ),
        }));
      }

      // Sync from DB to ensure orders, coins and stock are in sync
      await fetchAppData(false);

      return {
        success: true,
        message: data.message || 'Reward requested successfully! Your request is pending review.',
        orderId: data.orderId,
        newCoins: data.newCoins,
      };
    } catch (err) {
      console.error('Error in purchaseProduct:', err);
      return {
        success: false,
        error: err.message || 'Network error occurred during purchase.',
      };
    }
  };

  const addProduct = async (productData, imageFile = null) => {
    try {
      let finalImageUrl = productData.imageUrl || '';

      if (imageFile) {
        const uploadResult = await uploadProductImage(imageFile);
        if (uploadResult.success) {
          finalImageUrl = uploadResult.url;
        }
      }

      const payload = {
        ...productData,
        imageUrl: finalImageUrl,
      };

      const res = await fetch('/api/store/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to create product.' };
      }

      await fetchAppData(false);
      return { success: true, product: data.product };
    } catch (err) {
      console.error('Error in addProduct:', err);
      return { success: false, error: err.message || 'Failed to add product.' };
    }
  };

  const updateProduct = async (productId, productData, imageFile = null) => {
    try {
      let finalImageUrl = productData.imageUrl;

      if (imageFile) {
        const uploadResult = await uploadProductImage(imageFile);
        if (uploadResult.success) {
          finalImageUrl = uploadResult.url;
        }
      }

      const payload = {
        ...productData,
        ...(finalImageUrl !== undefined ? { imageUrl: finalImageUrl } : {}),
      };

      const res = await fetch(`/api/store/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to update product.' };
      }

      await fetchAppData(false);
      return { success: true, product: data.product };
    } catch (err) {
      console.error('Error in updateProduct:', err);
      return { success: false, error: err.message || 'Failed to update product.' };
    }
  };

  const deleteProduct = async (productId) => {
    const rawId = parseInt(String(productId || '').replace(/^p-/, ''), 10);

    // Optimistically remove product from state
    setState((prev) => ({
      ...prev,
      products: (prev.products || []).filter(
        (p) => p.id !== productId && p.rawId !== rawId && `p-${p.rawId}` !== productId && p.id !== `p-${rawId}`
      ),
    }));

    try {
      const res = await fetch(`/api/store/products/${productId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        await fetchAppData(false);
        return { success: false, error: data.error || 'Failed to delete product.' };
      }

      await fetchAppData(false);
      return {
        success: true,
        action: 'deleted',
        message: data.message || 'Product removed from store.',
      };
    } catch (err) {
      console.error('Error in deleteProduct:', err);
      await fetchAppData(false);
      return { success: false, error: err.message || 'Failed to delete product.' };
    }
  };

  const updateOrderStatus = async (orderId, status, rejectionReason = '', options = { remove: true }) => {
    const shouldRemove = options?.remove !== false;
    const existingOrder = (state.orders || []).find((o) => o.id === orderId);

    // Optimistically update state: remove order immediately upon completion/action
    setState((prev) => {
      let updatedOrders = prev.orders || [];
      if (shouldRemove) {
        updatedOrders = updatedOrders.filter((o) => o.id !== orderId);
      } else {
        updatedOrders = updatedOrders.map((o) =>
          o.id === orderId ? { ...o, status, rejectionReason, completedAt: new Date().toISOString() } : o
        );
      }

      let updatedStudents = prev.students || [];
      let updatedProducts = prev.products || [];

      // If rejected, refund coins and restore stock optimistically
      if (status === 'rejected' && existingOrder && !existingOrder.refunded) {
        const cost = Number(existingOrder.costCoins || existingOrder.pricePaid) || 0;
        updatedStudents = updatedStudents.map((s) =>
          s.id === existingOrder.studentId || `s-${s.id}` === existingOrder.studentId || s.id === existingOrder.studentRawId
            ? { ...s, coins: (Number(s.coins) || 0) + cost }
            : s
        );
        if (existingOrder.productId || existingOrder.productRawId) {
          updatedProducts = updatedProducts.map((p) =>
            p.id === existingOrder.productId || p.id === existingOrder.productRawId
              ? { ...p, stock: (Number(p.stock) || 0) + 1 }
              : p
          );
        }
      }

      return {
        ...prev,
        orders: updatedOrders,
        students: updatedStudents,
        products: updatedProducts,
      };
    });

    try {
      const res = await fetch(`/api/store/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason, notes: rejectionReason, remove: shouldRemove }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        await fetchAppData(false);
        return { success: false, error: data.error || 'Failed to update order status.' };
      }

      await fetchAppData(false);
      return {
        success: true,
        status: data.status,
        removed: data.removed,
        refunded: data.refunded,
        refundAmount: data.refundAmount,
        message: data.message,
      };
    } catch (err) {
      console.error('Error in updateOrderStatus:', err);
      await fetchAppData(false);
      return { success: false, error: err.message || 'Failed to update request status.' };
    }
  };

  const deleteOrder = async (orderId, refund = true) => {
    const existingOrder = (state.orders || []).find((o) => o.id === orderId);

    // Optimistic removal from state
    setState((prev) => {
      const updatedOrders = (prev.orders || []).filter((o) => o.id !== orderId);
      let updatedStudents = prev.students || [];
      let updatedProducts = prev.products || [];

      if (refund && existingOrder && existingOrder.status === 'pending' && !existingOrder.refunded) {
        const cost = Number(existingOrder.costCoins || existingOrder.pricePaid) || 0;
        updatedStudents = updatedStudents.map((s) =>
          s.id === existingOrder.studentId || `s-${s.id}` === existingOrder.studentId || s.id === existingOrder.studentRawId
            ? { ...s, coins: (Number(s.coins) || 0) + cost }
            : s
        );
        if (existingOrder.productId || existingOrder.productRawId) {
          updatedProducts = updatedProducts.map((p) =>
            p.id === existingOrder.productId || p.id === existingOrder.productRawId
              ? { ...p, stock: (Number(p.stock) || 0) + 1 }
              : p
          );
        }
      }

      return {
        ...prev,
        orders: updatedOrders,
        students: updatedStudents,
        products: updatedProducts,
      };
    });

    try {
      const res = await fetch(`/api/store/orders/${orderId}?refund=${refund}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        await fetchAppData(false);
        return { success: false, error: data.error || 'Failed to delete request.' };
      }
      await fetchAppData(false);
      return { success: true, message: data.message || 'Request removed.' };
    } catch (err) {
      console.error('Error in deleteOrder:', err);
      await fetchAppData(false);
      return { success: false, error: err.message || 'Failed to remove request.' };
    }
  };

  return (
    <AppContext.Provider
      value={{
        state: {
          ...state,
          users: state.users || [],
          teachers: state.teachers || [],
          students: state.students || [],
          classrooms: state.classrooms || [],
          homework: state.homeworks || state.homework || [],
          homeworks: state.homeworks || state.homework || [],
          messages: state.messages || state.chatMessages || [],
          chatMessages: state.messages || state.chatMessages || [],
          sentEmails: state.sentEmails || [],
          attendance: state.attendance || [],
          products: state.products || [],
          orders: state.orders || [],
        },
        currentUser: state.currentUser,
        loading,
        dbConnected,
        refreshData: fetchAppData,
        signIn,
        signUp,
        signOut,
        addPoints,
        subtractPoints,
        addStudent,
        updateStudent,
        deleteStudent,
        clearAllStudents,
        addClassroom,
        updateClassroom,
        deleteClassroom,
        shareClassroom,
        unshareClassroom,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        addHomework,
        updateHomework,
        deleteHomework,
        setStudentAttendance,
        bulkMarkAttendance,
        clearDayAttendance,
        sendMessage,
        sendChatMessage: sendMessage,
        refreshMessages,
        resetData,
        // Store actions
        purchaseProduct,
        addProduct,
        updateProduct,
        deleteProduct,
        updateOrderStatus,
        deleteOrder,
        removeOrder: deleteOrder,
        uploadProductImage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
