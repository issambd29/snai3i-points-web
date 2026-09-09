export const initialUsers = [
  {
    id: 'u-admin-1',
    email: 'admin@snai3i.com',
    username: 'admin@snai3i.com',
    password: 'password123',
    firstName: 'System',
    lastName: 'Admin',
    role: 'admin',
    isSuperuser: true,
  },
  {
    id: 'u-teacher-1',
    email: 'teacher@snai3i.com',
    username: 'teacher@snai3i.com',
    password: 'password123',
    firstName: 'Sarah',
    lastName: 'Johnson',
    role: 'teacher',
  },
  {
    id: 'u-teacher-2',
    email: 'david@snai3i.com',
    username: 'david@snai3i.com',
    password: 'password123',
    firstName: 'David',
    lastName: 'Miller',
    role: 'teacher',
  },
  {
    id: 'u-teacher-3',
    email: 'amira@snai3i.com',
    username: 'amira@snai3i.com',
    password: 'password123',
    firstName: 'Amira',
    lastName: 'Hassan',
    role: 'teacher',
  },
];

export const initialTeachers = [
  {
    id: 't-1',
    userId: 'u-teacher-1',
    user: initialUsers[1],
  },
  {
    id: 't-2',
    userId: 'u-teacher-2',
    user: initialUsers[2],
  },
  {
    id: 't-3',
    userId: 'u-teacher-3',
    user: initialUsers[3],
  },
];

export const initialStudents = [];

export const initialClassrooms = [
  {
    id: 'c-1',
    name: 'Bordj Kiffan - SE1',
    branch: 'Bordj Kiffan',
    specialty: 'SE1',
    teacherId: 't-1',
    teacher: initialTeachers[0],
    sharedWithTeacherIds: ['t-2'],
    studentIds: [],
  },
  {
    id: 'c-2',
    name: 'Rouissou - MECA1',
    branch: 'Rouissou',
    specialty: 'MECA1',
    teacherId: 't-2',
    teacher: initialTeachers[1],
    sharedWithTeacherIds: [],
    studentIds: [],
  },
  {
    id: 'c-3',
    name: 'Oran - Tronc Commun',
    branch: 'Oran',
    specialty: 'Tronc Commun',
    teacherId: 't-3',
    teacher: initialTeachers[2],
    sharedWithTeacherIds: [],
    studentIds: [],
  },
];

export const initialHomeworks = [];

export const initialMessages = [];

export const initialSentEmails = [];

export const initialAttendance = [];

export const initialProducts = [];

export const initialOrders = [];

export const initialAppState = {
  users: initialUsers,
  teachers: initialTeachers,
  students: initialStudents,
  classrooms: initialClassrooms,
  homeworks: initialHomeworks,
  messages: initialMessages,
  sentEmails: initialSentEmails,
  attendance: initialAttendance,
  products: initialProducts,
  orders: initialOrders,
  currentUser: initialUsers[0], // Default to Admin
};
