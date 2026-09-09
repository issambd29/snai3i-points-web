import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const { Pool } = pg;
const PORT = 3000;

function normalizeDbUrl(rawUrl?: string): string {
  let url =
    rawUrl ||
    process.env.DATABASE_URL ||
    'postgresql://school_project_db_8c31_user:s3duMuzVyqkNNdBP1ctkoPuSyA9q9WVt@dpg-da2lpa7lk1mc73cgj4r0-a.frankfurt-postgres.render.com/school_project_db_8c31?sslmode=require';

  // If URL uses Render internal host dpg-xxx-a without domain, append .frankfurt-postgres.render.com
  if (url.includes('@dpg-') && !url.includes('.render.com')) {
    url = url.replace(/@(dpg-[^/]+)\//, '@$1.frankfurt-postgres.render.com/');
  }
  if (!url.includes('sslmode=')) {
    url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return url;
}

const pool = new Pool({
  connectionString: normalizeDbUrl(),
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Django password hashing & verification helpers
function verifyPassword(password: string, encoded: string): boolean {
  if (!encoded || !password) return false;
  if (encoded === password) return true;

  const parts = encoded.split('$');
  if (parts.length === 4 && parts[0] === 'pbkdf2_sha256') {
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedHash = parts[3];
    const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
    return computedHash === expectedHash;
  }
  return false;
}

function hashPassword(password: string): string {
  const iterations = 100000;
  const salt = crypto.randomBytes(12).toString('base64').replace(/\+/g, '.').slice(0, 16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

// Database schema migration / initialization check
async function initDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL successfully');

    // Create attendance table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS core_attendance (
        id SERIAL PRIMARY KEY,
        classroom_id BIGINT,
        student_id BIGINT,
        date DATE NOT NULL,
        status VARCHAR(20) NOT NULL,
        note TEXT DEFAULT '',
        marked_by VARCHAR(150) DEFAULT '',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_att_classroom_student_date UNIQUE (classroom_id, student_id, date)
      );

      CREATE TABLE IF NOT EXISTS core_product (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        price_coins INTEGER DEFAULT 1,
        stock INTEGER DEFAULT 0,
        category VARCHAR(100) DEFAULT 'General',
        image_url TEXT DEFAULT '',
        icon VARCHAR(50) DEFAULT 'Gift',
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS core_store_order (
        id SERIAL PRIMARY KEY,
        student_id BIGINT NOT NULL,
        product_id BIGINT,
        product_name VARCHAR(200) NOT NULL,
        cost_coins INTEGER NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        notes TEXT DEFAULT '',
        rejection_reason TEXT DEFAULT '',
        refunded BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      );

      ALTER TABLE core_product ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      ALTER TABLE core_store_order ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE core_store_order ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';
      ALTER TABLE core_store_order ADD COLUMN IF NOT EXISTS refunded BOOLEAN DEFAULT FALSE;
      ALTER TABLE core_store_order ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    `);

    console.log('PostgreSQL schema verification complete');
  } catch (err: any) {
    console.error('Database connection / init error:', err.message);
  } finally {
    if (client) client.release();
  }
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Static uploads directory for product images
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const productsUploadDir = path.join(uploadsDir, 'products');
  if (!fs.existsSync(productsUploadDir)) fs.mkdirSync(productsUploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, productsUploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}-${cleanBase}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (_req, file, cb) => {
      if (
        /image\/(jpeg|jpg|png|webp|gif|svg\+xml)/.test(file.mimetype) ||
        /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname)
      ) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPG, PNG, WEBP, GIF, SVG) are allowed.'));
      }
    },
  });

  // ----------------------------------------------------
  // API ROUTES
  // ----------------------------------------------------

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'postgresql' });
  });

  // GET complete state from PostgreSQL for React application
  app.get('/api/app-data', async (req, res) => {
    try {
      // 1. Fetch Users
      const usersRes = await pool.query(`
        SELECT id, username, email, first_name, last_name, is_superuser, is_staff 
        FROM auth_user 
        ORDER BY id
      `);

      // 2. Fetch Teachers
      const teachersRes = await pool.query(`
        SELECT t.id as teacher_db_id, t.user_id, u.first_name, u.last_name, u.email, u.username
        FROM core_teacher t
        JOIN auth_user u ON t.user_id = u.id
        ORDER BY t.id
      `);

      // 3. Fetch Classrooms
      const classroomsRes = await pool.query(`
        SELECT c.id, c.name, COALESCE(c.branch, '') as branch, COALESCE(c.specialty, '') as specialty, 
               COALESCE(c.session_time, '') as session_time, c.teacher_id,
               t.user_id as teacher_user_id, u.first_name as teacher_first_name, u.last_name as teacher_last_name, u.email as teacher_email
        FROM core_classroom c
        LEFT JOIN core_teacher t ON c.teacher_id = t.id
        LEFT JOIN auth_user u ON t.user_id = u.id
        ORDER BY c.id
      `);

      // 4. Fetch Classroom Shared With Teachers
      const sharedRes = await pool.query(`
        SELECT classroom_id, teacher_id
        FROM core_classroom_shared_with
      `);

      // 5. Fetch Classroom Student Links
      const classStudentsRes = await pool.query(`
        SELECT classroom_id, student_id
        FROM core_classroom_students
      `);

      // 6. Fetch Students
      const studentsRes = await pool.query(`
        SELECT s.id as student_db_id, s.user_id, s.points, s.coins, s.age, s.division,
               u.first_name, u.last_name, u.email, u.username
        FROM core_student s
        JOIN auth_user u ON s.user_id = u.id
        ORDER BY s.id
      `);

      // 7. Fetch Homeworks
      const homeworkRes = await pool.query(`
        SELECT h.id, h.classroom_id, h.title, h.description, h.due_date, h.created_at, h.created_by_id,
               u.first_name as teacher_first_name, u.last_name as teacher_last_name
        FROM core_homework h
        LEFT JOIN core_teacher t ON h.created_by_id = t.id
        LEFT JOIN auth_user u ON t.user_id = u.id
        ORDER BY h.created_at DESC
      `);

      // 8. Fetch Chat Messages
      const messagesRes = await pool.query(`
        SELECT m.id, m.classroom_id, m.sender_id, m.body, m.created_at,
               u.first_name as sender_first_name, u.last_name as sender_last_name, u.email as sender_email, u.is_superuser
        FROM core_chatmessage m
        JOIN auth_user u ON m.sender_id = u.id
        ORDER BY m.created_at ASC
      `);

      // 9. Fetch Attendance
      let attendanceRows: any[] = [];
      try {
        const attRes = await pool.query(`
          SELECT id, classroom_id, student_id, date::text as date, status, note, marked_by, updated_at
          FROM core_attendance
          ORDER BY date DESC, id ASC
        `);
        attendanceRows = attRes.rows;
      } catch (e) {
        // Table might be freshly created
      }

      // Map users
      const studentUserIdSet = new Set(studentsRes.rows.map((s) => s.user_id));
      const teacherUserIdSet = new Set(teachersRes.rows.map((t) => t.user_id));

      const users = usersRes.rows.map((u) => {
        let role = 'student';
        if (u.is_superuser) role = 'admin';
        else if (teacherUserIdSet.has(u.id)) role = 'teacher';
        else if (studentUserIdSet.has(u.id)) role = 'student';

        return {
          id: `u-${u.id}`,
          rawId: u.id,
          username: u.username,
          email: u.email,
          firstName: u.first_name || (u.is_superuser ? 'System' : 'User'),
          lastName: u.last_name || (u.is_superuser ? 'Admin' : ''),
          role,
          isSuperuser: u.is_superuser,
        };
      });

      // Map teachers
      const teachers = teachersRes.rows.map((t) => {
        const u = users.find((x) => x.rawId === t.user_id) || {
          id: `u-${t.user_id}`,
          email: t.email,
          firstName: t.first_name,
          lastName: t.last_name,
          role: 'teacher',
        };
        return {
          id: `t-${t.teacher_db_id}`,
          rawId: t.teacher_db_id,
          userId: `u-${t.user_id}`,
          userRawId: t.user_id,
          user: u,
        };
      });

      // Map classrooms
      const classrooms = classroomsRes.rows.map((c) => {
        const teacher = teachers.find((t) => t.rawId === Number(c.teacher_id));
        const sharedTeacherIds = sharedRes.rows
          .filter((s) => Number(s.classroom_id) === Number(c.id))
          .map((s) => `t-${s.teacher_id}`);
        const studentIds = classStudentsRes.rows
          .filter((s) => Number(s.classroom_id) === Number(c.id))
          .map((s) => `s-${s.student_id}`);

        return {
          id: `c-${c.id}`,
          rawId: c.id,
          name: c.name,
          branch: c.branch || 'Bordj Kiffan',
          specialty: c.specialty || 'SE1',
          sessionTime: c.session_time || '',
          teacherId: teacher ? teacher.id : (teachers[0]?.id || 't-1'),
          teacher: teacher || teachers[0],
          sharedWithTeacherIds: sharedTeacherIds,
          studentIds,
        };
      });

      // Map students
      const students = studentsRes.rows.map((s) => {
        const u = users.find((x) => x.rawId === s.user_id) || {
          id: `u-${s.user_id}`,
          email: s.email,
          firstName: s.first_name,
          lastName: s.last_name,
          role: 'student',
        };

        // Find classroom for this student
        const classLink = classStudentsRes.rows.find((cs) => Number(cs.student_id) === Number(s.student_db_id));
        const classroom = classLink ? classrooms.find((c) => c.rawId === Number(classLink.classroom_id)) : classrooms[0];

        return {
          id: `s-${s.student_db_id}`,
          rawId: s.student_db_id,
          userId: `u-${s.user_id}`,
          userRawId: s.user_id,
          points: parseFloat(s.points) || 0,
          coins: s.coins || 0,
          age: s.age || 0,
          division: s.division || 'Class A',
          classroomId: classroom ? classroom.id : (classrooms[0]?.id || 'c-1'),
          user: u,
        };
      });

      // Map homeworks
      const homeworks = homeworkRes.rows.map((h) => {
        const teacherName = `${h.teacher_first_name || ''} ${h.teacher_last_name || ''}`.trim() || 'Teacher';
        return {
          id: `hw-${h.id}`,
          rawId: h.id,
          classroomId: `c-${h.classroom_id}`,
          title: h.title,
          description: h.description || '',
          dueDate: h.due_date ? new Date(h.due_date).toISOString().split('T')[0] : '',
          createdAt: h.created_at,
          teacherName,
        };
      });

      // Map messages
      const messages = messagesRes.rows.map((m) => {
        const senderName = `${m.sender_first_name || ''} ${m.sender_last_name || ''}`.trim() || m.sender_email;
        const senderUser = users.find((u) => u.rawId === m.sender_id);
        const senderRole = senderUser ? senderUser.role : (m.is_superuser ? 'admin' : 'student');
        const createdAtDate = new Date(m.created_at);
        const formattedDate = createdAtDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const formattedTime = createdAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return {
          id: `m-${m.id}`,
          rawId: m.id,
          classroomId: `c-${m.classroom_id}`,
          senderId: `u-${m.sender_id}`,
          senderName,
          senderRole,
          body: m.body,
          content: m.body,
          createdAt: `${formattedDate}, ${formattedTime}`,
        };
      });

      // Map attendance
      const attendance = attendanceRows.map((a) => ({
        id: `att-${a.id}`,
        rawId: a.id,
        classroomId: `c-${a.classroom_id}`,
        studentId: `s-${a.student_id}`,
        date: a.date,
        status: a.status,
        note: a.note || '',
        markedBy: a.marked_by || 'Teacher',
        updatedAt: a.updated_at,
      }));

      // 8. Fetch Store Products
      const productsRes = await pool.query(`
        SELECT id, name, description, price_coins, stock, category, image_url, icon, is_available, created_at, updated_at
        FROM core_product
        WHERE is_available IS NOT FALSE
        ORDER BY id ASC
      `);

      const products = productsRes.rows.map((p) => ({
        id: `p-${p.id}`,
        rawId: p.id,
        name: p.name,
        description: p.description || '',
        priceCoins: Number(p.price_coins),
        price: Number(p.price_coins),
        stock: Number(p.stock),
        category: p.category || 'General',
        imageUrl: p.image_url || '',
        icon: p.icon || 'Gift',
        isAvailable: Boolean(p.is_available),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));

      // 9. Fetch Store Orders / Requests
      const ordersRes = await pool.query(`
        SELECT o.id, o.student_id, o.product_id, o.product_name, o.cost_coins, o.status, o.notes, 
               o.rejection_reason, o.refunded, o.created_at, o.completed_at, o.updated_at,
               s.user_id as student_user_id,
               u.first_name as student_first_name, u.last_name as student_last_name, u.email as student_email,
               p.image_url as product_image_url, p.icon as product_icon,
               c.id as classroom_id, c.name as classroom_name
        FROM core_store_order o
        LEFT JOIN core_student s ON o.student_id = s.id
        LEFT JOIN auth_user u ON s.user_id = u.id
        LEFT JOIN core_product p ON o.product_id = p.id
        LEFT JOIN core_classroom_students cs ON s.id = cs.student_id
        LEFT JOIN core_classroom c ON cs.classroom_id = c.id
        ORDER BY o.created_at DESC, o.id DESC
      `);

      const orders = ordersRes.rows.map((o) => ({
        id: `ord-${o.id}`,
        rawId: o.id,
        studentId: `s-${o.student_id}`,
        studentRawId: o.student_id,
        studentName: `${o.student_first_name || ''} ${o.student_last_name || ''}`.trim() || o.student_email || 'Student',
        studentEmail: o.student_email || '',
        studentClass: o.classroom_name || 'Unassigned',
        productId: o.product_id ? `p-${o.product_id}` : null,
        productRawId: o.product_id,
        productName: o.product_name,
        productImage: o.product_image_url || '',
        productIcon: o.product_icon || 'Gift',
        costCoins: Number(o.cost_coins),
        pricePaid: Number(o.cost_coins),
        status: o.status || 'pending',
        notes: o.notes || '',
        rejectionReason: o.rejection_reason || '',
        refunded: Boolean(o.refunded),
        createdAt: o.created_at,
        completedAt: o.completed_at,
        updatedAt: o.updated_at,
      }));

      res.json({
        success: true,
        users,
        teachers,
        students,
        classrooms,
        homeworks,
        messages,
        attendance,
        products,
        orders,
      });
    } catch (err: any) {
      console.error('Error in /api/app-data:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SIGN IN
  app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, error: 'Email/username is required.' });
    }

    try {
      const userRes = await pool.query(
        `SELECT id, username, email, password, first_name, last_name, is_superuser, is_staff 
         FROM auth_user 
         WHERE LOWER(email) = $1 OR LOWER(username) = $1 OR ($1 = 'admin' AND is_superuser = true)
         LIMIT 1`,
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'No user account found with those credentials.' });
      }

      const dbUser = userRes.rows[0];

      if (password) {
        const isMatch = verifyPassword(password, dbUser.password);
        if (!isMatch) {
          return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
        }
      }

      // Check role
      let role = 'student';
      if (dbUser.is_superuser) {
        role = 'admin';
      } else {
        const teacherCheck = await pool.query('SELECT id FROM core_teacher WHERE user_id = $1', [dbUser.id]);
        if (teacherCheck.rows.length > 0) {
          role = 'teacher';
        }
      }

      const userObj = {
        id: `u-${dbUser.id}`,
        rawId: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        firstName: dbUser.first_name || (dbUser.is_superuser ? 'System' : 'User'),
        lastName: dbUser.last_name || (dbUser.is_superuser ? 'Admin' : ''),
        role,
        isSuperuser: dbUser.is_superuser,
      };

      res.json({ success: true, user: userObj });
    } catch (err: any) {
      console.error('Error in signin:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SIGN UP (TEACHER)
  app.post('/api/auth/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanFirstName = (firstName || '').trim();
    const cleanLastName = (lastName || '').trim();

    if (!cleanFirstName || !cleanEmail || !password) {
      return res.status(400).json({ success: false, error: 'First name, email, and password are required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check existing email
      const existCheck = await client.query(
        'SELECT id FROM auth_user WHERE LOWER(email) = $1 OR LOWER(username) = $1',
        [cleanEmail]
      );
      if (existCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'An account with that email already exists.' });
      }

      const encodedPass = hashPassword(password);
      const userRes = await client.query(
        `INSERT INTO auth_user (username, email, password, first_name, last_name, is_superuser, is_staff, is_active, date_joined)
         VALUES ($1, $2, $3, $4, $5, false, false, true, NOW())
         RETURNING id`,
        [cleanEmail, cleanEmail, encodedPass, cleanFirstName, cleanLastName]
      );
      const userId = userRes.rows[0].id;

      const teacherRes = await client.query(
        `INSERT INTO core_teacher (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      const teacherId = teacherRes.rows[0].id;

      await client.query(
        `INSERT INTO core_classroom (name, teacher_id, branch, specialty, session_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [`${cleanFirstName}'s Class`, teacherId, 'Bordj Kiffan', 'SE1', '2 hours']
      );

      await client.query('COMMIT');

      const userObj = {
        id: `u-${userId}`,
        rawId: userId,
        username: cleanEmail,
        email: cleanEmail,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        role: 'teacher',
        isSuperuser: false,
      };

      res.json({ success: true, user: userObj });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error in signup:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // CREATE STUDENT
  app.post('/api/students', async (req, res) => {
    const { name, email, password, age, classroomId } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    const parts = cleanName.split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || '';

    const rawClassroomId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existCheck = await client.query(
        'SELECT id FROM auth_user WHERE LOWER(email) = $1 OR LOWER(username) = $1',
        [cleanEmail]
      );
      if (existCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'A student with that email already exists.' });
      }

      const encodedPass = hashPassword(password || 'password123');
      const userRes = await client.query(
        `INSERT INTO auth_user (username, email, password, first_name, last_name, is_superuser, is_staff, is_active, date_joined)
         VALUES ($1, $2, $3, $4, $5, false, false, true, NOW())
         RETURNING id`,
        [cleanEmail, cleanEmail, encodedPass, firstName, lastName]
      );
      const userId = userRes.rows[0].id;

      const studentRes = await client.query(
        `INSERT INTO core_student (user_id, points, coins, age, division)
         VALUES ($1, 0, 0, $2, $3)
         RETURNING id`,
        [userId, Number(age) || 0, 'Class A']
      );
      const studentId = studentRes.rows[0].id;

      // Validate classroom ID against existing classrooms
      let targetClassId: number | null = !isNaN(rawClassroomId) && rawClassroomId > 0 ? rawClassroomId : null;
      if (targetClassId) {
        const checkClass = await client.query('SELECT id FROM core_classroom WHERE id = $1', [targetClassId]);
        if (checkClass.rows.length === 0) {
          targetClassId = null;
        }
      }

      // If classroom does not exist or was unspecified, fallback to the first available classroom
      if (!targetClassId) {
        const firstClass = await client.query('SELECT id FROM core_classroom ORDER BY id ASC LIMIT 1');
        if (firstClass.rows.length > 0) {
          targetClassId = parseInt(firstClass.rows[0].id, 10);
        }
      }

      if (targetClassId) {
        await client.query(
          `INSERT INTO core_classroom_students (classroom_id, student_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [targetClassId, studentId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, studentId: `s-${studentId}`, userId: `u-${userId}` });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error creating student:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // UPDATE STUDENT
  app.put('/api/students/:id', async (req, res) => {
    const rawStudentId = parseInt(req.params.id.replace(/^s-/, ''), 10);
    const { name, email, password, age, classroomId, points, coins } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sRes = await client.query('SELECT user_id FROM core_student WHERE id = $1', [rawStudentId]);
      if (sRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student not found.' });
      }
      const userId = sRes.rows[0].user_id;

      // Update User
      if (name) {
        const parts = name.trim().split(' ');
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || '';
        await client.query(
          `UPDATE auth_user SET first_name = $1, last_name = $2 WHERE id = $3`,
          [firstName, lastName, userId]
        );
      }
      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        await client.query(
          `UPDATE auth_user SET email = $1, username = $1 WHERE id = $2`,
          [cleanEmail, userId]
        );
      }
      if (password && password.trim()) {
        const encodedPass = hashPassword(password.trim());
        await client.query(`UPDATE auth_user SET password = $1 WHERE id = $2`, [encodedPass, userId]);
      }

      // Update Student
      if (points !== undefined || coins !== undefined || age !== undefined) {
        await client.query(
          `UPDATE core_student 
           SET points = COALESCE($1, points), coins = COALESCE($2, coins), age = COALESCE($3, age)
           WHERE id = $4`,
          [
            points !== undefined ? Number(points) : null,
            coins !== undefined ? parseInt(coins, 10) : null,
            age !== undefined ? Number(age) : null,
            rawStudentId,
          ]
        );
      }

      // Update Classroom Enrollment Link
      if (classroomId) {
        const newClassId = parseInt(String(classroomId).replace(/^c-/, ''), 10);
        if (!isNaN(newClassId) && newClassId > 0) {
          const checkClass = await client.query('SELECT id FROM core_classroom WHERE id = $1', [newClassId]);
          if (checkClass.rows.length > 0) {
            await client.query('DELETE FROM core_classroom_students WHERE student_id = $1', [rawStudentId]);
            await client.query(
              'INSERT INTO core_classroom_students (classroom_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [newClassId, rawStudentId]
            );
          }
        }
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error updating student:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE STUDENT
  app.delete('/api/students/:id', async (req, res) => {
    const rawStudentId = parseInt(req.params.id.replace(/^s-/, ''), 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sRes = await client.query('SELECT user_id FROM core_student WHERE id = $1', [rawStudentId]);
      if (sRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student not found.' });
      }
      const userId = sRes.rows[0].user_id;

      await client.query('DELETE FROM core_classroom_students WHERE student_id = $1', [rawStudentId]);
      await client.query('DELETE FROM core_attendance WHERE student_id = $1', [rawStudentId]);
      await client.query('DELETE FROM core_chatmessage WHERE sender_id = $1', [userId]);
      await client.query('DELETE FROM core_student WHERE id = $1', [rawStudentId]);
      await client.query('DELETE FROM auth_user WHERE id = $1', [userId]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error deleting student:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ADD POINTS TO STUDENT
  app.post('/api/students/:id/points/add', async (req, res) => {
    const rawStudentId = parseInt(req.params.id.replace(/^s-/, ''), 10);
    const amount = parseFloat(req.body.amount || 1);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sRes = await client.query('SELECT points, coins FROM core_student WHERE id = $1', [rawStudentId]);
      if (sRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student not found.' });
      }

      const oldPoints = parseFloat(sRes.rows[0].points) || 0;
      const oldCoins = sRes.rows[0].coins || 0;
      const newPoints = Math.round((oldPoints + amount) * 10) / 10;
      const oldBlockCoins = Math.floor(oldPoints / 10);
      const newBlockCoins = Math.floor(newPoints / 10);
      const coinDiff = Math.max(0, newBlockCoins - oldBlockCoins);
      const newCoins = oldCoins + coinDiff;

      await client.query(
        'UPDATE core_student SET points = $1, coins = $2 WHERE id = $3',
        [newPoints, newCoins, rawStudentId]
      );

      await client.query('COMMIT');
      res.json({ success: true, newPoints, newCoins, coinsEarned: coinDiff });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error adding points:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // SUBTRACT POINTS FROM STUDENT
  app.post('/api/students/:id/points/subtract', async (req, res) => {
    const rawStudentId = parseInt(req.params.id.replace(/^s-/, ''), 10);
    const amount = parseFloat(req.body.amount || 1);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sRes = await client.query('SELECT points, coins FROM core_student WHERE id = $1', [rawStudentId]);
      if (sRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student not found.' });
      }

      const oldPoints = parseFloat(sRes.rows[0].points) || 0;
      const oldCoins = sRes.rows[0].coins || 0;
      const newPoints = Math.max(0, Math.round((oldPoints - amount) * 10) / 10);
      const oldBlockCoins = Math.floor(oldPoints / 10);
      const newBlockCoins = Math.floor(newPoints / 10);
      const lostCoins = Math.max(0, oldBlockCoins - newBlockCoins);
      const newCoins = Math.max(0, oldCoins - lostCoins);

      await client.query(
        'UPDATE core_student SET points = $1, coins = $2 WHERE id = $3',
        [newPoints, newCoins, rawStudentId]
      );

      await client.query('COMMIT');
      res.json({ success: true, newPoints, newCoins, lostCoins });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error subtracting points:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // CREATE TEACHER
  app.post('/api/teachers', async (req, res) => {
    const { firstName, lastName, email, classroomName, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanFirstName = (firstName || '').trim();
    const cleanLastName = (lastName || '').trim();

    if (!cleanFirstName || !cleanEmail) {
      return res.status(400).json({ success: false, error: 'First name and email are required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existCheck = await client.query(
        'SELECT id FROM auth_user WHERE LOWER(email) = $1 OR LOWER(username) = $1',
        [cleanEmail]
      );
      if (existCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'A user with that email already exists.' });
      }

      const encodedPass = hashPassword(password || 'password123');
      const userRes = await client.query(
        `INSERT INTO auth_user (username, email, password, first_name, last_name, is_superuser, is_staff, is_active, date_joined)
         VALUES ($1, $2, $3, $4, $5, false, false, true, NOW())
         RETURNING id`,
        [cleanEmail, cleanEmail, encodedPass, cleanFirstName, cleanLastName]
      );
      const userId = userRes.rows[0].id;

      const teacherRes = await client.query(
        `INSERT INTO core_teacher (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      const teacherId = teacherRes.rows[0].id;

      await client.query(
        `INSERT INTO core_classroom (name, teacher_id, branch, specialty, session_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [classroomName?.trim() || `${cleanFirstName}'s Class`, teacherId, 'Bordj Kiffan', 'SE1', '2 hours']
      );

      await client.query('COMMIT');
      res.json({ success: true, teacherId: `t-${teacherId}`, userId: `u-${userId}` });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error creating teacher:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // UPDATE TEACHER
  app.put('/api/teachers/:id', async (req, res) => {
    const rawTeacherId = parseInt(req.params.id.replace(/^t-/, ''), 10);
    const { firstName, lastName, email, password, classroomName } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tRes = await client.query('SELECT user_id FROM core_teacher WHERE id = $1', [rawTeacherId]);
      if (tRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Teacher not found.' });
      }
      const userId = tRes.rows[0].user_id;

      if (firstName) {
        await client.query(
          `UPDATE auth_user SET first_name = $1, last_name = COALESCE($2, last_name) WHERE id = $3`,
          [firstName.trim(), lastName ? lastName.trim() : null, userId]
        );
      }
      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        await client.query(
          `UPDATE auth_user SET email = $1, username = $1 WHERE id = $2`,
          [cleanEmail, userId]
        );
      }
      if (password && password.trim()) {
        const encodedPass = hashPassword(password.trim());
        await client.query(`UPDATE auth_user SET password = $1 WHERE id = $2`, [encodedPass, userId]);
      }

      if (classroomName && classroomName.trim()) {
        await client.query(
          `UPDATE core_classroom SET name = $1 WHERE teacher_id = $2`,
          [classroomName.trim(), rawTeacherId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error updating teacher:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE TEACHER
  app.delete('/api/teachers/:id', async (req, res) => {
    const rawTeacherId = parseInt(req.params.id.replace(/^t-/, ''), 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tRes = await client.query('SELECT user_id FROM core_teacher WHERE id = $1', [rawTeacherId]);
      if (tRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Teacher not found.' });
      }
      const userId = tRes.rows[0].user_id;

      // Delete classrooms owned by this teacher and their child records
      const classRes = await client.query('SELECT id FROM core_classroom WHERE teacher_id = $1', [rawTeacherId]);
      const classIds = classRes.rows.map((r: any) => r.id);
      if (classIds.length > 0) {
        await client.query('DELETE FROM core_homework WHERE classroom_id = ANY($1)', [classIds]);
        await client.query('DELETE FROM core_attendance WHERE classroom_id = ANY($1)', [classIds]);
        await client.query('DELETE FROM core_chatmessage WHERE classroom_id = ANY($1)', [classIds]);
        await client.query('DELETE FROM core_classroom_students WHERE classroom_id = ANY($1)', [classIds]);
        await client.query('DELETE FROM core_classroom_shared_with WHERE classroom_id = ANY($1)', [classIds]);
      }
      await client.query('DELETE FROM core_classroom_shared_with WHERE teacher_id = $1', [rawTeacherId]);
      await client.query('DELETE FROM core_classroom WHERE teacher_id = $1', [rawTeacherId]);
      await client.query('DELETE FROM core_chatmessage WHERE sender_id = $1', [userId]);
      await client.query('DELETE FROM core_teacher WHERE id = $1', [rawTeacherId]);
      await client.query('DELETE FROM auth_user WHERE id = $1', [userId]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error deleting teacher:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // CREATE CLASSROOM
  app.post('/api/classrooms', async (req, res) => {
    const { name, branch, specialty, sessionTime, teacherId } = req.body || {};
    const cleanName = (name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Classroom name is required.' });
    }

    const rawTeacherId = teacherId ? parseInt(String(teacherId).replace(/^t-/, ''), 10) : 1;

    try {
      const classRes = await pool.query(
        `INSERT INTO core_classroom (name, branch, specialty, session_time, teacher_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [cleanName, branch || 'Bordj Kiffan', specialty || 'SE1', sessionTime || '2 hours', rawTeacherId || 1]
      );
      const newId = classRes.rows[0].id;
      res.json({ success: true, classroomId: `c-${newId}` });
    } catch (err: any) {
      console.error('Error creating classroom:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // UPDATE CLASSROOM
  app.put('/api/classrooms/:id', async (req, res) => {
    const rawClassId = parseInt(req.params.id.replace(/^c-/, ''), 10);
    const { name, branch, specialty, sessionTime, teacherId } = req.body || {};

    const rawTeacherId = teacherId ? parseInt(String(teacherId).replace(/^t-/, ''), 10) : null;

    try {
      await pool.query(
        `UPDATE core_classroom 
         SET name = COALESCE($1, name), branch = COALESCE($2, branch), specialty = COALESCE($3, specialty),
             session_time = COALESCE($4, session_time), teacher_id = COALESCE($5, teacher_id)
         WHERE id = $6`,
        [
          name ? name.trim() : null,
          branch ? branch.trim() : null,
          specialty ? specialty.trim() : null,
          sessionTime ? sessionTime.trim() : null,
          rawTeacherId,
          rawClassId,
        ]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error updating classroom:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE CLASSROOM
  app.delete('/api/classrooms/:id', async (req, res) => {
    const rawClassId = parseInt(req.params.id.replace(/^c-/, ''), 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM core_classroom_students WHERE classroom_id = $1', [rawClassId]);
      await client.query('DELETE FROM core_classroom_shared_with WHERE classroom_id = $1', [rawClassId]);
      await client.query('DELETE FROM core_homework WHERE classroom_id = $1', [rawClassId]);
      await client.query('DELETE FROM core_chatmessage WHERE classroom_id = $1', [rawClassId]);
      await client.query('DELETE FROM core_attendance WHERE classroom_id = $1', [rawClassId]);
      await client.query('DELETE FROM core_classroom WHERE id = $1', [rawClassId]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error deleting classroom:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // SHARE CLASSROOM
  app.post('/api/classrooms/:id/share', async (req, res) => {
    const rawClassId = parseInt(req.params.id.replace(/^c-/, ''), 10);
    const { teacherEmail } = req.body || {};
    const cleanEmail = (teacherEmail || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, error: 'Teacher email is required.' });
    }

    try {
      const teacherRes = await pool.query(
        `SELECT t.id, u.first_name, u.last_name FROM core_teacher t JOIN auth_user u ON t.user_id = u.id WHERE LOWER(u.email) = $1`,
        [cleanEmail]
      );
      if (teacherRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'No teacher account found with that email.' });
      }

      const teacher = teacherRes.rows[0];
      await pool.query(
        `INSERT INTO core_classroom_shared_with (classroom_id, teacher_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [rawClassId, teacher.id]
      );

      res.json({
        success: true,
        teacherName: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || cleanEmail,
      });
    } catch (err: any) {
      console.error('Error sharing classroom:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // UNSHARE CLASSROOM
  app.post('/api/classrooms/:id/unshare', async (req, res) => {
    const rawClassId = parseInt(req.params.id.replace(/^c-/, ''), 10);
    const { teacherId } = req.body || {};
    const rawTeacherId = parseInt(String(teacherId || '').replace(/^t-/, ''), 10);

    try {
      await pool.query(
        `DELETE FROM core_classroom_shared_with WHERE classroom_id = $1 AND teacher_id = $2`,
        [rawClassId, rawTeacherId]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error unsharing classroom:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // HOMEWORK ENDPOINTS
  app.post('/api/homework', async (req, res) => {
    const { classroomId, title, description, dueDate, teacherUserId } = req.body || {};
    const rawClassId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const rawTeacherUserId = parseInt(String(teacherUserId || '').replace(/^u-/, ''), 10);

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required.' });
    }

    try {
      let teacherDbId = 1;
      if (!isNaN(rawTeacherUserId)) {
        const tRes = await pool.query('SELECT id FROM core_teacher WHERE user_id = $1', [rawTeacherUserId]);
        if (tRes.rows.length > 0) teacherDbId = tRes.rows[0].id;
      }

      const hwRes = await pool.query(
        `INSERT INTO core_homework (classroom_id, created_by_id, title, description, due_date, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, created_at`,
        [rawClassId, teacherDbId, title.trim(), description?.trim() || '', dueDate || null]
      );

      res.json({ success: true, homeworkId: `hw-${hwRes.rows[0].id}`, createdAt: hwRes.rows[0].created_at });
    } catch (err: any) {
      console.error('Error adding homework:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/homework/:id', async (req, res) => {
    const rawHwId = parseInt(req.params.id.replace(/^hw-/, ''), 10);
    try {
      await pool.query('DELETE FROM core_homework WHERE id = $1', [rawHwId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting homework:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // CHAT MESSAGES
  app.post('/api/messages', async (req, res) => {
    const { classroomId, senderId, body } = req.body || {};
    const rawClassId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const rawSenderId = parseInt(String(senderId || '').replace(/^u-/, ''), 10);

    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required.' });
    }

    try {
      const msgRes = await pool.query(
        `INSERT INTO core_chatmessage (classroom_id, sender_id, body, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, created_at`,
        [rawClassId, rawSenderId || 1, body.trim()]
      );
      res.json({ success: true, messageId: `m-${msgRes.rows[0].id}`, createdAt: msgRes.rows[0].created_at });
    } catch (err: any) {
      console.error('Error posting message:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ATTENDANCE ENDPOINTS
  app.post('/api/attendance', async (req, res) => {
    const { classroomId, studentId, date, status, note, markedBy } = req.body || {};
    const rawClassId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const rawStudentId = parseInt(String(studentId || '').replace(/^s-/, ''), 10);
    const cleanDate = date || new Date().toISOString().split('T')[0];

    try {
      if (!status || status === 'unmarked') {
        await pool.query(
          'DELETE FROM core_attendance WHERE classroom_id = $1 AND student_id = $2 AND date = $3',
          [rawClassId, rawStudentId, cleanDate]
        );
        return res.json({ success: true, action: 'cleared' });
      }

      await pool.query(
        `INSERT INTO core_attendance (classroom_id, student_id, date, status, note, marked_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (classroom_id, student_id, date)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, marked_by = EXCLUDED.marked_by, updated_at = NOW()`,
        [rawClassId, rawStudentId, cleanDate, status, note || '', markedBy || 'Teacher']
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error('Error setting attendance:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/attendance/bulk', async (req, res) => {
    const { classroomId, date, status, studentIds, markedBy } = req.body || {};
    const rawClassId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const cleanDate = date || new Date().toISOString().split('T')[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rawStudentIds = (studentIds || []).map((id: string) => parseInt(String(id).replace(/^s-/, ''), 10));

      if (!status || status === 'unmarked') {
        if (rawStudentIds.length > 0) {
          await client.query(
            'DELETE FROM core_attendance WHERE classroom_id = $1 AND date = $2 AND student_id = ANY($3)',
            [rawClassId, cleanDate, rawStudentIds]
          );
        } else {
          await client.query(
            'DELETE FROM core_attendance WHERE classroom_id = $1 AND date = $2',
            [rawClassId, cleanDate]
          );
        }
      } else {
        for (const sId of rawStudentIds) {
          await client.query(
            `INSERT INTO core_attendance (classroom_id, student_id, date, status, note, marked_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (classroom_id, student_id, date)
             DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, updated_at = NOW()`,
            [rawClassId, sId, cleanDate, status, '', markedBy || 'Teacher']
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error in bulk attendance:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  app.delete('/api/attendance/day', async (req, res) => {
    const { classroomId, date } = req.query || {};
    const rawClassId = parseInt(String(classroomId || '').replace(/^c-/, ''), 10);
    const cleanDate = (date as string) || new Date().toISOString().split('T')[0];

    try {
      if (isNaN(rawClassId)) {
        await pool.query('DELETE FROM core_attendance WHERE date = $1', [cleanDate]);
      } else {
        await pool.query(
          'DELETE FROM core_attendance WHERE classroom_id = $1 AND date = $2',
          [rawClassId, cleanDate]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error clearing day attendance:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // STORE / REWARDS API
  // ----------------------------------------------------

  // Upload product image
  app.post('/api/store/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        console.error('Image upload error:', err);
        return res.status(400).json({ success: false, error: err.message || 'Image upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file uploaded.' });
      }
      const fileUrl = `/uploads/products/${req.file.filename}`;
      return res.json({ success: true, url: fileUrl });
    });
  });

  // GET products
  app.get('/api/store/products', async (req, res) => {
    const { availableOnly } = req.query;
    try {
      let query = `
        SELECT id, name, description, price_coins, stock, category, image_url, icon, is_available, created_at, updated_at
        FROM core_product
      `;
      if (availableOnly === 'true') {
        query += ' WHERE is_available = true';
      }
      query += ' ORDER BY is_available DESC, id ASC';

      const result = await pool.query(query);
      const products = result.rows.map((p) => ({
        id: `p-${p.id}`,
        rawId: p.id,
        name: p.name,
        description: p.description || '',
        priceCoins: Number(p.price_coins),
        price: Number(p.price_coins),
        stock: Number(p.stock),
        category: p.category || 'General',
        imageUrl: p.image_url || '',
        icon: p.icon || 'Gift',
        isAvailable: Boolean(p.is_available),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
      res.json({ success: true, products });
    } catch (err: any) {
      console.error('Error fetching store products:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // CREATE product
  app.post('/api/store/products', async (req, res) => {
    const { name, description, priceCoins, price, stock, category, imageUrl, icon, isAvailable } = req.body || {};
    const cleanName = (name || '').trim();
    const finalPrice = Math.max(0, parseInt(String(priceCoins !== undefined ? priceCoins : price ?? 1), 10) || 0);
    const finalStock = Math.max(0, parseInt(String(stock ?? 0), 10) || 0);
    const finalCat = (category || 'General').trim();
    const finalActive = isAvailable !== undefined ? Boolean(isAvailable) : true;
    const finalIcon = (icon || 'Gift').trim();

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Product name is required.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO core_product (name, description, price_coins, stock, category, image_url, icon, is_available, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, created_at`,
        [cleanName, description || '', finalPrice, finalStock, finalCat, imageUrl || '', finalIcon, finalActive]
      );

      const newId = result.rows[0].id;
      res.json({
        success: true,
        product: {
          id: `p-${newId}`,
          rawId: newId,
          name: cleanName,
          description: description || '',
          priceCoins: finalPrice,
          price: finalPrice,
          stock: finalStock,
          category: finalCat,
          imageUrl: imageUrl || '',
          icon: finalIcon,
          isAvailable: finalActive,
          createdAt: result.rows[0].created_at,
        },
      });
    } catch (err: any) {
      console.error('Error creating product:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // UPDATE product
  app.put('/api/store/products/:id', async (req, res) => {
    const rawId = parseInt(String(req.params.id || '').replace(/^p-/, ''), 10);
    if (!rawId) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    const { name, description, priceCoins, price, stock, category, imageUrl, icon, isAvailable } = req.body || {};

    try {
      const current = await pool.query('SELECT * FROM core_product WHERE id = $1', [rawId]);
      if (current.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
      }
      const existing = current.rows[0];

      const cleanName = name !== undefined ? String(name).trim() : existing.name;
      const cleanDesc = description !== undefined ? String(description) : (existing.description || '');
      const finalPrice =
        priceCoins !== undefined || price !== undefined
          ? Math.max(0, parseInt(String(priceCoins !== undefined ? priceCoins : price), 10) || 0)
          : existing.price_coins;
      const finalStock = stock !== undefined ? Math.max(0, parseInt(String(stock), 10) || 0) : existing.stock;
      const finalCat = category !== undefined ? String(category).trim() : existing.category;
      const finalImg = imageUrl !== undefined ? String(imageUrl) : existing.image_url;
      const finalIcon = icon !== undefined ? String(icon).trim() : existing.icon;
      const finalActive = isAvailable !== undefined ? Boolean(isAvailable) : existing.is_available;

      await pool.query(
        `UPDATE core_product
         SET name = $1, description = $2, price_coins = $3, stock = $4, category = $5,
             image_url = $6, icon = $7, is_available = $8, updated_at = NOW()
         WHERE id = $9`,
        [cleanName, cleanDesc, finalPrice, finalStock, finalCat, finalImg, finalIcon, finalActive, rawId]
      );

      res.json({
        success: true,
        product: {
          id: `p-${rawId}`,
          rawId,
          name: cleanName,
          description: cleanDesc,
          priceCoins: finalPrice,
          price: finalPrice,
          stock: finalStock,
          category: finalCat,
          imageUrl: finalImg,
          icon: finalIcon,
          isAvailable: finalActive,
        },
      });
    } catch (err: any) {
      console.error('Error updating product:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE product permanently from store catalog
  app.delete('/api/store/products/:id', async (req, res) => {
    const rawId = parseInt(String(req.params.id || '').replace(/^p-/, ''), 10);
    if (!rawId) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Decouple product_id on past orders so order text/cost history remains intact
      await client.query('UPDATE core_store_order SET product_id = NULL WHERE product_id = $1', [rawId]);
      // Permanently remove from core_product
      const delRes = await client.query('DELETE FROM core_product WHERE id = $1 RETURNING id, name', [rawId]);
      await client.query('COMMIT');

      if (delRes.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Product not found in catalog.' });
      }

      return res.json({
        success: true,
        action: 'deleted',
        productId: `p-${rawId}`,
        message: 'Product removed from store catalog successfully.',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error deleting product:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ATOMIC PURCHASE ENDPOINT
  app.post('/api/store/purchase', async (req, res) => {
    const { studentId, productId } = req.body || {};
    const cleanStudentId = parseInt(String(studentId || '').replace(/^s-/, ''), 10);
    const cleanProductId = parseInt(String(productId || '').replace(/^p-/, ''), 10);

    if (!cleanStudentId || !cleanProductId) {
      return res.status(400).json({ success: false, error: 'Valid student ID and product ID are required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock student record and check balance
      const studentRes = await client.query(
        'SELECT id, user_id, coins FROM core_student WHERE id = $1 FOR UPDATE',
        [cleanStudentId]
      );
      if (studentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student record not found.' });
      }
      const student = studentRes.rows[0];
      const currentCoins = Number(student.coins) || 0;

      // 2. Lock product record and check availability & stock
      const productRes = await client.query(
        'SELECT id, name, price_coins, stock, is_available, image_url, icon FROM core_product WHERE id = $1 FOR UPDATE',
        [cleanProductId]
      );
      if (productRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Reward product not found.' });
      }
      const product = productRes.rows[0];
      const productPrice = Number(product.price_coins) || 0;
      const productStock = Number(product.stock) || 0;

      // 3. Verify product is active/available
      if (!product.is_available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'This reward is currently inactive or unavailable.' });
      }

      // 4. Verify stock is greater than 0
      if (productStock <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'This product is out of stock.' });
      }

      // 5. Verify student has enough coins
      if (currentCoins < productPrice) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: "You don't have enough coins for this reward.",
          currentCoins,
          requiredCoins: productPrice,
        });
      }

      // 6. Deduct coins from student & decrease stock by 1
      const newCoins = currentCoins - productPrice;
      await client.query('UPDATE core_student SET coins = $1 WHERE id = $2', [newCoins, student.id]);
      await client.query('UPDATE core_product SET stock = stock - 1, updated_at = NOW() WHERE id = $1', [product.id]);

      // 7. Create purchase request record
      const orderRes = await client.query(
        `INSERT INTO core_store_order (student_id, product_id, product_name, cost_coins, status, notes, rejection_reason, refunded, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', '', '', false, NOW(), NOW())
         RETURNING id, created_at`,
        [student.id, product.id, product.name, productPrice]
      );

      await client.query('COMMIT');

      const createdOrder = orderRes.rows[0];
      return res.json({
        success: true,
        orderId: `ord-${createdOrder.id}`,
        rawOrderId: createdOrder.id,
        newCoins,
        costCoins: productPrice,
        remainingStock: productStock - 1,
        message: `Successfully requested "${product.name}"! Status is now Pending.`,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error in /api/store/purchase:', err);
      return res.status(500).json({ success: false, error: err.message || 'Transaction failed.' });
    } finally {
      client.release();
    }
  });

  // GET store orders / purchase requests
  app.get('/api/store/orders', async (req, res) => {
    const { studentId } = req.query;
    try {
      let query = `
        SELECT o.id, o.student_id, o.product_id, o.product_name, o.cost_coins, o.status, o.notes, 
               o.rejection_reason, o.refunded, o.created_at, o.completed_at, o.updated_at,
               s.user_id as student_user_id,
               u.first_name as student_first_name, u.last_name as student_last_name, u.email as student_email,
               p.image_url as product_image_url, p.icon as product_icon,
               c.id as classroom_id, c.name as classroom_name
        FROM core_store_order o
        LEFT JOIN core_student s ON o.student_id = s.id
        LEFT JOIN auth_user u ON s.user_id = u.id
        LEFT JOIN core_product p ON o.product_id = p.id
        LEFT JOIN core_classroom_students cs ON s.id = cs.student_id
        LEFT JOIN core_classroom c ON cs.classroom_id = c.id
      `;

      const params: any[] = [];
      if (studentId) {
        const rawStudentId = parseInt(String(studentId).replace(/^s-/, ''), 10);
        if (rawStudentId) {
          query += ' WHERE o.student_id = $1';
          params.push(rawStudentId);
        }
      }

      query += ' ORDER BY o.created_at DESC, o.id DESC';

      const result = await pool.query(query, params);
      const orders = result.rows.map((o) => ({
        id: `ord-${o.id}`,
        rawId: o.id,
        studentId: `s-${o.student_id}`,
        studentRawId: o.student_id,
        studentName: `${o.student_first_name || ''} ${o.student_last_name || ''}`.trim() || o.student_email || 'Student',
        studentEmail: o.student_email || '',
        studentClass: o.classroom_name || 'Unassigned',
        productId: o.product_id ? `p-${o.product_id}` : null,
        productRawId: o.product_id,
        productName: o.product_name,
        productImage: o.product_image_url || '',
        productIcon: o.product_icon || 'Gift',
        costCoins: Number(o.cost_coins),
        pricePaid: Number(o.cost_coins),
        status: o.status || 'pending',
        notes: o.notes || '',
        rejectionReason: o.rejection_reason || '',
        refunded: Boolean(o.refunded),
        createdAt: o.created_at,
        completedAt: o.completed_at,
        updatedAt: o.updated_at,
      }));

      res.json({ success: true, orders });
    } catch (err: any) {
      console.error('Error fetching store orders:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // UPDATE order status (Approve, Reject with automatic idempotent refund, Complete, or Remove)
  app.put('/api/store/orders/:id/status', async (req, res) => {
    const rawOrderId = parseInt(String(req.params.id || '').replace(/^ord-/, ''), 10);
    const { status, rejectionReason, notes, remove } = req.body || {};
    const validStatuses = ['pending', 'approved', 'rejected', 'completed', 'delivered'];

    if (!rawOrderId || !status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid order ID and status are required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock order
      const orderRes = await client.query(
        'SELECT id, student_id, product_id, product_name, cost_coins, status, refunded FROM core_store_order WHERE id = $1 FOR UPDATE',
        [rawOrderId]
      );
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Order not found.' });
      }

      const order = orderRes.rows[0];
      const costCoins = Number(order.cost_coins) || 0;
      let refundedNow = false;

      // If rejecting and not already refunded, refund coins to student & restore stock!
      if (status === 'rejected' && !order.refunded) {
        await client.query('UPDATE core_student SET coins = coins + $1 WHERE id = $2', [costCoins, order.student_id]);
        refundedNow = true;

        if (order.product_id) {
          await client.query('UPDATE core_product SET stock = stock + 1, updated_at = NOW() WHERE id = $1', [
            order.product_id,
          ]);
        }
      }

      const updatedRefunded = Boolean(order.refunded || refundedNow);
      const completedAt = (status === 'completed' || status === 'delivered') ? new Date() : null;
      const finalReason = rejectionReason !== undefined ? rejectionReason : (notes !== undefined ? notes : '');

      // User instruction: When the action is completed, remove the request. When accepted/approved or rejected, remove it.
      // If remove flag is true, or if status is approved/rejected/completed/delivered and remove is not explicitly false:
      const shouldRemove = remove === true || (remove !== false && ['approved', 'rejected', 'completed', 'delivered'].includes(status));

      if (shouldRemove) {
        await client.query('DELETE FROM core_store_order WHERE id = $1', [order.id]);
      } else {
        await client.query(
          `UPDATE core_store_order
           SET status = $1,
               rejection_reason = $2,
               refunded = $3,
               completed_at = COALESCE($4, completed_at),
               updated_at = NOW()
           WHERE id = $5`,
          [status, finalReason, updatedRefunded, completedAt, order.id]
        );
      }

      await client.query('COMMIT');

      let message = shouldRemove
        ? (status === 'rejected'
            ? `Request rejected and removed. ${costCoins} coins refunded to student.`
            : `Request approved and completed. The request has been removed.`)
        : `Order marked as ${status}.`;

      res.json({
        success: true,
        orderId: `ord-${order.id}`,
        status,
        removed: shouldRemove,
        refunded: updatedRefunded,
        refundAmount: refundedNow ? costCoins : 0,
        message,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error updating order status:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE / REMOVE store order directly
  app.delete('/api/store/orders/:id', async (req, res) => {
    const rawOrderId = parseInt(String(req.params.id || '').replace(/^ord-/, ''), 10);
    if (!rawOrderId) {
      return res.status(400).json({ success: false, error: 'Valid order ID is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT id, student_id, product_id, cost_coins, status, refunded FROM core_store_order WHERE id = $1 FOR UPDATE',
        [rawOrderId]
      );
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Order not found.' });
      }

      const order = orderRes.rows[0];
      const costCoins = Number(order.cost_coins) || 0;
      let refundedNow = false;

      // If order was pending and not refunded, and refund is requested (default true for pending)
      const shouldRefund = req.query.refund === 'true' || (order.status === 'pending' && req.query.refund !== 'false');
      if (shouldRefund && !order.refunded) {
        await client.query('UPDATE core_student SET coins = coins + $1 WHERE id = $2', [costCoins, order.student_id]);
        refundedNow = true;
        if (order.product_id) {
          await client.query('UPDATE core_product SET stock = stock + 1, updated_at = NOW() WHERE id = $1', [
            order.product_id,
          ]);
        }
      }

      await client.query('DELETE FROM core_store_order WHERE id = $1', [rawOrderId]);
      await client.query('COMMIT');

      res.json({
        success: true,
        orderId: `ord-${rawOrderId}`,
        refunded: refundedNow,
        refundAmount: refundedNow ? costCoins : 0,
        message: 'Request successfully removed.',
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Error deleting store order:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ----------------------------------------------------
  // VITE MIDDLEWARE / STATIC ASSETS
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Snai3i Server running on http://0.0.0.0:${PORT} with live PostgreSQL persistence`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
