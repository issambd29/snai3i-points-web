import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, setUnauthorizedHandler } from '../utils/api';
import { todayString } from '../utils/date';

const AppContext = createContext(null);

const EMPTY_DATA = {
  users: [],
  teachers: [],
  managers: [],
  students: [],
  classrooms: [],
  homeworks: [],
  messages: [],
  attendance: [],
  products: [],
  orders: [],
};

const POLL_INTERVAL_MS = 6000;

const withPrefix = (prefix, id) => {
  const text = String(id ?? '');
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
};
const stripPrefix = (prefix, id) => String(id ?? '').replace(new RegExp(`^${prefix}`), '');
const roundTenth = (n) => Math.round(Number(n) * 10) / 10;

export const AppProvider = ({ children }) => {
  const [data, setData] = useState(EMPTY_DATA);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until the session has been checked
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());
  const fetchingRef = useRef(false);
  const refetchQueuedRef = useRef(false);
  const mutationSeqRef = useRef(0);
  const deletedMessageIdsRef = useRef(new Set());
  const lastToastRef = useRef({ key: '', at: 0, id: '' });

  // --------------------------------------------------------------------
  // Toasts (alerts)
  // --------------------------------------------------------------------
  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerToast = useCallback(
    (title, desc = '', type = 'normal', duration = 3500) => {
      // Safety net: the exact same alert twice within a second is shown once.
      const key = `${title}|${desc}|${type}`;
      const now = Date.now();
      if (lastToastRef.current.key === key && now - lastToastRef.current.at < 1000) return lastToastRef.current.id;
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      lastToastRef.current = { key, at: now, id };
      setToasts((prev) => [...prev.slice(-3), { id, title, desc, type, duration }]);
      toastTimersRef.current.set(id, setTimeout(() => dismissToast(id), duration));
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  // --------------------------------------------------------------------
  // Session + data sync
  // --------------------------------------------------------------------
  const clearSession = useCallback(() => {
    setCurrentUser(null);
    setData(EMPTY_DATA);
  }, []);

  useEffect(() => {
    // Any API call that comes back 401 means the session is gone.
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(() => {});
  }, [clearSession]);

  const fetchAppData = useCallback(async () => {
    // A refresh requested while another is running is queued (not dropped), so data
    // changed by a save is never left stale until the next poll.
    if (fetchingRef.current) {
      refetchQueuedRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      do {
        refetchQueuedRef.current = false;
        const seqAtStart = mutationSeqRef.current;
        const res = await apiFetch('/api/app-data');
        if (!res.success) continue;
        // A save finished while this request was in flight: its data may be older than the save.
        if (seqAtStart !== mutationSeqRef.current) {
          refetchQueuedRef.current = true;
          continue;
        }
        setData((prev) => ({
          users: res.users || [],
          teachers: res.teachers || [],
          managers: res.managers || [],
          students: res.students || [],
          classrooms: res.classrooms || [],
          homeworks: res.homeworks || [],
          messages: (() => {
            const gone = deletedMessageIdsRef.current;
            const server = (res.messages || []).filter((m) => !gone.has(m.id));
            const ids = new Set(server.map((m) => m.id));
            // messages still being sent must not vanish during a refresh
            return [...server, ...prev.messages.filter((m) => String(m.id).startsWith('temp-') && !ids.has(m.id))];
          })(),
          attendance: res.attendance || [],
          products: res.products || [],
          orders: res.orders || [],
        }));
        // Keep the signed-in user's profile fresh (e.g. after a name change).
        setCurrentUser((prev) => (prev ? (res.users || []).find((u) => u.id === prev.id) || prev : prev));
      } while (refetchQueuedRef.current);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Verify the session with the server once on load. Nothing is cached locally.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch('/api/auth/user', { auth: false });
      if (cancelled) return;
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
        await fetchAppData();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAppData]);

  // Periodic sync for multi-device collaboration - only while signed in and visible.
  const signedIn = Boolean(currentUser);
  useEffect(() => {
    if (!signedIn) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') fetchAppData();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [signedIn, fetchAppData]);

  /**
   * Run a request and resolve as soon as the server answers. `onSuccess` patches the screen
   * instantly; the full refresh then runs in the background (it no longer delays the result).
   */
  const mutate = useCallback(
    async (path, options, onSuccess) => {
      const res = await apiFetch(path, options);
      mutationSeqRef.current += 1;
      if (res.success && onSuccess) onSuccess(res);
      fetchAppData();
      return res;
    },
    [fetchAppData]
  );

  // --------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------
  const signIn = async (email, password) => {
    const res = await apiFetch('/api/auth/signin', {
      method: 'POST',
      auth: false,
      body: { email: (email || '').trim().toLowerCase(), password },
    });
    if (!res.success || !res.user) {
      return { success: false, error: res.error || 'Invalid credentials.' };
    }
    setCurrentUser(res.user);
    await fetchAppData();
    return { success: true, user: res.user };
  };

  const signOut = async () => {
    await apiFetch('/api/auth/signout', { method: 'POST', auth: false });
    clearSession();
  };

  // --------------------------------------------------------------------
  // Points
  // --------------------------------------------------------------------
  const patchStudent = (studentId, fields) =>
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === studentId ? { ...s, ...fields } : s)),
    }));

  const addPoints = async (studentId, amount) => {
    const value = roundTenth(amount);
    if (!(value > 0)) return { success: false, error: 'Amount must be greater than 0.' };

    const res = await apiFetch(`/api/students/${studentId}/points/add`, { method: 'POST', body: { amount: value } });
    if (!res.success) return { success: false, error: res.error };
    patchStudent(studentId, { points: res.newPoints, coins: res.newCoins });
    return { success: true, newCoins: res.coinsEarned || 0 };
  };

  const subtractPoints = async (studentId, amount) => {
    const value = roundTenth(amount);
    if (!(value > 0)) return { success: false, error: 'Amount must be greater than 0.' };

    const res = await apiFetch(`/api/students/${studentId}/points/subtract`, { method: 'POST', body: { amount: value } });
    if (!res.success) return { success: false, error: res.error };
    patchStudent(studentId, { points: res.newPoints, coins: res.newCoins });
    return { success: true, coinsLost: res.coinsLost || 0 };
  };

  // --------------------------------------------------------------------
  // Students
  // --------------------------------------------------------------------
  const addStudent = async ({ name, firstName, lastName, email, password, age, classroomId }) => {
    const cleanName = (name || `${firstName || ''} ${lastName || ''}`).trim();
    if (!cleanName || !(email || '').trim()) {
      return { success: false, error: 'Name and email are required.' };
    }
    const res = await mutate('/api/students', {
      method: 'POST',
      body: {
        name: cleanName,
        email: email.trim().toLowerCase(),
        password,
        age: Number(age) || 11,
        classroomId: classroomId || undefined,
      },
    });
    return res.success ? { success: true, studentId: res.studentId, userId: res.userId } : { success: false, error: res.error };
  };

  const updateStudent = async (studentId, { name, firstName, lastName, email, password, age, classroomId, points, coins }) => {
    const body = {};
    if (name) body.name = name.trim();
    if (firstName) body.firstName = firstName.trim();
    if (lastName !== undefined && firstName) body.lastName = lastName.trim();
    if (email) body.email = email.trim().toLowerCase();
    if (password) body.password = password;
    if (age !== undefined) body.age = Number(age);
    if (classroomId) body.classroomId = classroomId;
    if (points !== undefined) body.points = Number(points);
    if (coins !== undefined) body.coins = Number(coins);

    const res = await mutate(`/api/students/${studentId}`, { method: 'PUT', body });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteStudent = async (studentId) => {
    const res = await mutate(`/api/students/${studentId}`, { method: 'DELETE' }, () =>
      setData((prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.id !== studentId),
        classrooms: prev.classrooms.map((c) => ({ ...c, studentIds: (c.studentIds || []).filter((id) => id !== studentId) })),
        orders: prev.orders.filter((o) => o.studentId !== studentId),
        attendance: prev.attendance.filter((a) => a.studentId !== studentId),
      }))
    );
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  // --------------------------------------------------------------------
  // Teachers
  // --------------------------------------------------------------------
  const addTeacher = async ({ firstName, lastName, email, classroomName, password }) => {
    if (!firstName?.trim() || !(email || '').trim()) {
      return { success: false, error: 'First name and email are required.' };
    }
    const res = await mutate('/api/teachers', {
      method: 'POST',
      body: { firstName, lastName, email: email.trim().toLowerCase(), classroomName, password },
    });
    return res.success ? { success: true, teacherId: res.teacherId } : { success: false, error: res.error };
  };

  const updateTeacher = async (teacherId, { firstName, lastName, email, password, classroomName }) => {
    if (!firstName?.trim()) return { success: false, error: 'First name is required.' };
    const res = await mutate(`/api/teachers/${teacherId}`, {
      method: 'PUT',
      body: { firstName, lastName, email, password: password || undefined, classroomName },
    });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteTeacher = async (teacherId) => {
    const res = await mutate(`/api/teachers/${teacherId}`, { method: 'DELETE' });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  // --------------------------------------------------------------------
  // Branch managers (administrators only)
  // --------------------------------------------------------------------
  const addManager = async ({ firstName, lastName, email, password, branch }) => {
    if (!firstName?.trim() || !(email || '').trim()) {
      return { success: false, error: 'First name and email are required.' };
    }
    if (!branch) return { success: false, error: 'Please choose a branch.' };
    const res = await mutate('/api/managers', {
      method: 'POST',
      body: { firstName, lastName, email: email.trim().toLowerCase(), password, branch },
    });
    return res.success ? { success: true, managerId: res.managerId } : { success: false, error: res.error };
  };

  const updateManager = async (managerId, { firstName, lastName, email, password, branch }) => {
    if (!firstName?.trim()) return { success: false, error: 'First name is required.' };
    const res = await mutate(`/api/managers/${managerId}`, {
      method: 'PUT',
      body: { firstName, lastName, email, password: password || undefined, branch },
    });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteManager = async (managerId) => {
    const res = await mutate(`/api/managers/${managerId}`, { method: 'DELETE' });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  // --------------------------------------------------------------------
  // Classrooms
  // --------------------------------------------------------------------
  const addClassroom = async (params) => {
    const input = typeof params === 'string' ? { name: params } : params || {};
    const name = (input.name || '').trim();
    const branch = (input.branch || '').trim();
    const specialty = (input.specialty || '').trim();
    const finalName = name || [branch, specialty].filter(Boolean).join(' - ');
    if (!finalName) return { success: false, error: 'Class name is required.' };

    const res = await mutate('/api/classrooms', {
      method: 'POST',
      body: { name: finalName, branch, specialty, sessionTime: input.sessionTime || '', teacherId: input.teacherId || undefined },
    });
    return res.success ? { success: true, classroomId: res.classroomId } : { success: false, error: res.error };
  };

  const updateClassroom = async (classroomId, { name, branch, specialty, sessionTime, teacherId }) => {
    const res = await mutate(`/api/classrooms/${classroomId}`, {
      method: 'PUT',
      body: { name, branch, specialty, sessionTime, teacherId },
    });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const deleteClassroom = async (classroomId) => {
    const res = await mutate(`/api/classrooms/${classroomId}`, { method: 'DELETE' });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  const shareClassroom = async (classroomId, teacherEmail) => {
    const email = (teacherEmail || '').trim().toLowerCase();
    if (!email) return { success: false, error: 'Teacher email is required.' };
    const res = await mutate(`/api/classrooms/${classroomId}/share`, { method: 'POST', body: { teacherEmail: email } });
    return res.success ? { success: true, teacherName: res.teacherName } : { success: false, error: res.error };
  };

  const unshareClassroom = async (classroomId, teacherId) => {
    const res = await mutate(`/api/classrooms/${classroomId}/unshare`, { method: 'POST', body: { teacherId } });
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  // --------------------------------------------------------------------
  // Homework
  // --------------------------------------------------------------------
  const addHomework = async ({ classroomId, title, description, dueDate }) => {
    if (!title?.trim()) return { success: false, error: 'Homework title is required.' };
    const res = await mutate('/api/homework', {
      method: 'POST',
      body: { classroomId, title, description, dueDate: dueDate || undefined },
    });
    return res.success
      ? { success: true, homework: { id: res.homeworkId, title, description, dueDate } }
      : { success: false, error: res.error };
  };

  const deleteHomework = async (homeworkId) => {
    const res = await mutate(`/api/homework/${homeworkId}`, { method: 'DELETE' }, () =>
      setData((prev) => ({ ...prev, homeworks: prev.homeworks.filter((h) => h.id !== homeworkId) }))
    );
    return res.success ? { success: true } : { success: false, error: res.error };
  };

  // --------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------
  const refreshMessages = useCallback(async (classroomId) => {
    const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : '';
    const res = await apiFetch(`/api/messages${query}`);
    if (!res.success || !Array.isArray(res.messages)) return;
    setData((prev) => {
      const sameClass = (m) => !classroomId || m.classroomId === classroomId;
      const others = prev.messages.filter((m) => !sameClass(m));
      // Messages still being sent stay on screen; a message the server already returned is never doubled.
      const serverIds = new Set(res.messages.map((m) => m.id));
      const pending = prev.messages.filter((m) => sameClass(m) && String(m.id).startsWith('temp-') && !serverIds.has(m.id));
      // A message deleted while this request was in flight must not come back.
      const gone = deletedMessageIdsRef.current;
      const fresh = res.messages.filter((m) => !gone.has(m.id));
      return { ...prev, messages: [...others, ...fresh, ...pending] };
    });
  }, []);

  const sendMessage = async (classroomId, body) => {
    const text = (body || '').trim();
    if (!text) return { success: false, error: 'Message cannot be empty.' };
    if (!classroomId) return { success: false, error: 'Choose a classroom first.' };

    // Shown instantly; replaced by the saved message when the server answers.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic = {
      id: tempId,
      classroomId,
      senderId: currentUser?.id,
      senderName: currentUser?.name || 'You',
      senderRole: currentUser?.role || 'student',
      text,
      body: text,
      content: text,
      timestamp: new Date().toISOString(),
      pending: true,
    };
    setData((prev) => ({ ...prev, messages: [...prev.messages, optimistic] }));

    const res = await apiFetch('/api/messages', { method: 'POST', body: { classroomId, body: text } });
    setData((prev) => {
      if (!res.success) return { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) };
      // If a refresh already brought the saved message in, just drop the temporary copy.
      const alreadyThere = prev.messages.some((m) => m.id === res.message.id);
      return {
        ...prev,
        messages: alreadyThere
          ? prev.messages.filter((m) => m.id !== tempId)
          : prev.messages.map((m) => (m.id === tempId ? res.message : m)),
      };
    });
    return res.success ? { success: true, message: res.message } : { success: false, error: res.error };
  };

  const deleteMessage = async (messageId) => {
    deletedMessageIdsRef.current.add(messageId);
    let removed = null;
    setData((prev) => {
      removed = prev.messages.find((m) => m.id === messageId) || null;
      return { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) };
    });
    const res = await apiFetch(`/api/messages/${messageId}`, { method: 'DELETE' });
    if (!res.success && res.status !== 404) {
      deletedMessageIdsRef.current.delete(messageId);
      if (removed) setData((prev) => ({ ...prev, messages: [...prev.messages, removed].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))) }));
      return { success: false, error: res.error };
    }
    return { success: true };
  };

  // --------------------------------------------------------------------
  // Attendance (optimistic: the toggles are clicked rapidly)
  // --------------------------------------------------------------------
  const markedBy = currentUser?.name || 'Teacher';

  const sameRecord = (a, classKey, studentKey, date) =>
    stripPrefix('c-', a.classroomId) === classKey && stripPrefix('s-', a.studentId) === studentKey && a.date === date;

  const attendanceFailed = async (title, error) => {
    triggerToast(title, error, 'danger');
    await fetchAppData(); // roll the optimistic change back to what the server has
  };

  const setStudentAttendance = async (classroomId, studentId, date, status, note = '') => {
    if (!classroomId || !studentId) return { success: false, error: 'Classroom and student are required.' };
    const day = date || todayString();
    const classId = withPrefix('c-', classroomId);
    const studId = withPrefix('s-', studentId);
    const classKey = stripPrefix('c-', classId);
    const studentKey = stripPrefix('s-', studId);
    const clearing = !status || status === 'unmarked';

    setData((prev) => {
      const rest = prev.attendance.filter((a) => !sameRecord(a, classKey, studentKey, day));
      if (clearing) return { ...prev, attendance: rest };
      const record = { id: `att-temp-${classKey}-${studentKey}-${day}`, classroomId: classId, studentId: studId, date: day, status, note: note || '', markedBy };
      return { ...prev, attendance: [...rest, record] };
    });

    const res = await apiFetch('/api/attendance', {
      method: 'POST',
      body: { classroomId: classId, studentId: studId, date: day, status: clearing ? 'unmarked' : status, note },
    });
    if (!res.success) await attendanceFailed('Attendance not saved', res.error);
    return res;
  };

  const bulkMarkAttendance = async (classroomId, date, status, studentIds) => {
    if (!classroomId) return { success: false, error: 'Classroom is required.' };
    const day = date || todayString();
    const classId = withPrefix('c-', classroomId);
    const classKey = stripPrefix('c-', classId);

    const classroom = data.classrooms.find((c) => c.id === classId);
    const targets = (studentIds || classroom?.studentIds || []).map((id) => withPrefix('s-', id));
    const targetKeys = new Set(targets.map((id) => stripPrefix('s-', id)));
    const clearing = !status || status === 'unmarked';

    setData((prev) => {
      const rest = prev.attendance.filter(
        (a) => !(stripPrefix('c-', a.classroomId) === classKey && a.date === day && targetKeys.has(stripPrefix('s-', a.studentId)))
      );
      if (clearing) return { ...prev, attendance: rest };
      const created = targets.map((studId) => ({
        id: `att-temp-${classKey}-${studId}-${day}`, classroomId: classId, studentId: studId, date: day, status, note: '', markedBy,
      }));
      return { ...prev, attendance: [...rest, ...created] };
    });

    const res = await apiFetch('/api/attendance/bulk', {
      method: 'POST',
      body: { classroomId: classId, date: day, status: clearing ? 'unmarked' : status, studentIds: targets },
    });
    if (!res.success) {
      await attendanceFailed('Attendance not saved', res.error);
      return res;
    }
    fetchAppData();
    return res;
  };

  const clearDayAttendance = async (classroomId, date) => {
    const day = date || todayString();
    const classId = withPrefix('c-', classroomId);
    const classKey = stripPrefix('c-', classId);

    setData((prev) => ({
      ...prev,
      attendance: prev.attendance.filter((a) => !(stripPrefix('c-', a.classroomId) === classKey && a.date === day)),
    }));

    const res = await apiFetch(`/api/attendance/day?classroomId=${encodeURIComponent(classId)}&date=${encodeURIComponent(day)}`, {
      method: 'DELETE',
    });
    if (!res.success) await attendanceFailed('Could not clear attendance', res.error);
    return res;
  };

  // --------------------------------------------------------------------
  // Rewards store
  // --------------------------------------------------------------------
  const uploadProductImage = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await apiFetch('/api/store/upload', { method: 'POST', body: formData });
    return res.success ? { success: true, url: res.url } : { success: false, error: res.error };
  };

  const purchaseProduct = async (_studentId, productId) => {
    // The server always uses the signed-in student, whatever id the client sends.
    const res = await mutate('/api/store/purchase', { method: 'POST', body: { productId } });
    if (!res.success) {
      return { success: false, error: res.error || 'Purchase could not be processed.' };
    }
    return {
      success: true,
      message: res.message || 'Reward requested successfully! Your request is pending review.',
      orderId: res.orderId,
      newCoins: res.newCoins,
    };
  };

  const saveProduct = async (path, method, productData, imageFile) => {
    const payload = { ...productData };
    if (imageFile) {
      const upload = await uploadProductImage(imageFile);
      if (!upload.success) return { success: false, error: upload.error || 'Image upload failed.' };
      payload.imageUrl = upload.url;
    }
    const res = await mutate(path, { method, body: payload });
    return res.success ? { success: true, product: res.product } : { success: false, error: res.error };
  };

  const addProduct = (productData, imageFile = null) =>
    saveProduct('/api/store/products', 'POST', productData, imageFile);

  const updateProduct = (productId, productData, imageFile = null) =>
    saveProduct(`/api/store/products/${productId}`, 'PUT', productData, imageFile);

  const deleteProduct = async (productId) => {
    const res = await mutate(`/api/store/products/${productId}`, { method: 'DELETE' }, (r) =>
      setData((prev) => ({
        ...prev,
        products:
          r.action === 'deactivated'
            ? prev.products.map((p) => (p.id === productId ? { ...p, isAvailable: false } : p))
            : prev.products.filter((p) => p.id !== productId),
      }))
    );
    if (!res.success) return { success: false, error: res.error };
    return { success: true, action: res.action, message: res.message };
  };

  const updateOrderStatus = async (orderId, status, rejectionReason = '', options = { remove: false }) => {
    const res = await mutate(`/api/store/orders/${orderId}/status`, {
      method: 'PUT',
      body: { status, rejectionReason, notes: rejectionReason, remove: Boolean(options?.remove) },
    });
    if (!res.success) {
      triggerToast('Action Failed', res.error, 'danger');
      return { success: false, error: res.error };
    }
    triggerToast('Request Updated', res.message || `Request marked as ${status}.`, status === 'rejected' ? 'warning' : 'success');
    return { success: true, status: res.status, removed: res.removed, refunded: res.refunded, refundAmount: res.refundAmount, message: res.message };
  };

  const deleteOrder = async (orderId, refund = true) => {
    const res = await mutate(`/api/store/orders/${orderId}?refund=${refund ? 'true' : 'false'}`, { method: 'DELETE' }, () =>
      setData((prev) => ({ ...prev, orders: prev.orders.filter((o) => o.id !== orderId) }))
    );
    if (!res.success) {
      triggerToast('Action Failed', res.error, 'danger');
      return { success: false, error: res.error };
    }
    triggerToast('Request Removed', res.message || 'Request removed.', 'info');
    return { success: true, message: res.message, refunded: res.refunded };
  };

  return (
    <AppContext.Provider
      value={{
        state: {
          ...data,
          // Aliases kept for components that use the older names.
          homework: data.homeworks,
          chatMessages: data.messages,
        },
        currentUser,
        loading,
        refreshData: fetchAppData,
        toasts,
        triggerToast,
        dismissToast,
        signIn,
        signOut,
        addPoints,
        subtractPoints,
        addStudent,
        updateStudent,
        deleteStudent,
        addClassroom,
        updateClassroom,
        deleteClassroom,
        shareClassroom,
        unshareClassroom,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        addManager,
        updateManager,
        deleteManager,
        addHomework,
        deleteHomework,
        setStudentAttendance,
        bulkMarkAttendance,
        clearDayAttendance,
        sendMessage,
        sendChatMessage: sendMessage,
        deleteMessage,
        refreshMessages,
        purchaseProduct,
        addProduct,
        updateProduct,
        deleteProduct,
        updateOrderStatus,
        deleteOrder,
        cancelOrder: deleteOrder,
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
