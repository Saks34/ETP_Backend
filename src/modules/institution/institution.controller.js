const { Institution } = require('./institution.model');
const { User } = require('../auth/user.model');
const { signAccessToken, signRefreshToken } = require('../auth/token.service');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { connectMongo, getDB, ObjectId } = require('../../database/mongo');
const { INSTITUTIONS, USERS } = require('../../database/collections');
const { sendCredentialEmail } = require('../../services/email.service');

function sanitizeInstitution(inst) {
  return {
    id: inst._id,
    name: inst.name,
    logo: inst.logo || null,
    status: inst.status,
    createdAt: inst.createdAt,
    updatedAt: inst.updatedAt,
  };
}

// ephemeral export storage (in-memory, one-time)
const _exportStore = new Map();
function _putExport(token, payload, ttlMs = 10 * 60 * 1000) {
  const expiresAt = Date.now() + ttlMs;
  _exportStore.set(token, { ...payload, expiresAt });
}
function _takeExport(token) {
  const data = _exportStore.get(token);
  if (!data) return null;
  _exportStore.delete(token);
  return data;
}
function _cleanupExports() {
  const now = Date.now();
  for (const [k, v] of _exportStore.entries()) {
    if (!v || v.expiresAt <= now) _exportStore.delete(k);
  }
}

async function registerInstitution(req, res) {
  try {
    const { name, logo, admin } = req.body || {};
    if (!name || !admin || !admin?.name || !admin?.email || !admin?.password) {
      return res.status(400).json({ message: 'name and admin{name,email,password} are required' });
    }

    // Ensure native driver is connected
    await connectMongo();
    const db = getDB();
    const institutionsCol = db.collection(INSTITUTIONS);
    const usersCol = db.collection(USERS);

    // Conflict checks
    const [existingInst, existingUser] = await Promise.all([
      institutionsCol.findOne({ name: name.trim() }),
      usersCol.findOne({ email: admin.email.trim().toLowerCase() }),
    ]);

    if (existingInst) {
      return res.status(409).json({ message: 'Institution or email already exists' });
    }
    if (existingUser) {
      return res.status(409).json({ message: 'Institution or email already exists' });
    }

    const now = new Date();
    const instDoc = {
      name: name.trim(),
      logo: logo || null,
      status: 'ACTIVE', // status set to ACTIVE
      createdAt: now,
      updatedAt: now,
    };

    const instResult = await institutionsCol.insertOne(instDoc);
    const institutionId = instResult.insertedId;

    // Hash password using bcryptjs
    const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const salt = await bcrypt.genSalt(rounds);
    const hashed = await bcrypt.hash(admin.password, salt);

    const adminDoc = {
      name: admin.name,
      email: admin.email.trim().toLowerCase(),
      password: hashed,
      role: 'InstitutionAdmin',
      institutionId: institutionId, // store as ObjectId
      createdAt: now,
      updatedAt: now,
    };

    const userResult = await usersCol.insertOne(adminDoc);

    // Build response objects
    const instResponse = sanitizeInstitution({ _id: institutionId, ...instDoc });
    const adminResponse = {
      id: userResult.insertedId,
      name: adminDoc.name,
      email: adminDoc.email,
      role: adminDoc.role,
      institutionId: adminDoc.institutionId,
    };

    const payload = { sub: String(userResult.insertedId), role: adminDoc.role, institutionId: String(institutionId) };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(201).json({
      institution: instResponse,
      admin: adminResponse,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('registerInstitution error:', err);
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Institution or email already exists' });
    }
    if (err && err.message && /required/i.test(err.message)) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    return res.status(500).json({ message: 'Institution registration failed' });
  }
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId || null,
    batchId: user.batchId || null,  // Include batch assignment
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const ALLOWED_STAFF_ROLES = ['Teacher', 'Moderator', 'AcademicAdmin', 'Student'];

function canAssignRole(actorRole, targetRole) {
  if (actorRole === 'SuperAdmin') return true;
  if (actorRole === 'InstitutionAdmin') return ALLOWED_STAFF_ROLES.includes(targetRole);
  if (actorRole === 'AcademicAdmin') return ['Teacher', 'Moderator'].includes(targetRole);
  return false;
}

async function addStaff(req, res) {
  try {
    const { name, email, password, role, sendEmail } = req.body || {};
    if (!name || !email || !role) {
      return res.status(400).json({ message: 'name, email and role are required' });
    }

    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });

    if (!canAssignRole(actor.role, role)) {
      return res.status(403).json({ message: 'Forbidden: cannot assign this role' });
    }

    let institutionId = null;
    if (actor.role === 'SuperAdmin') {
      // SuperAdmin may specify institutionId in body
      institutionId = req.body.institutionId;
      if (!institutionId) {
        return res.status(400).json({ message: 'institutionId is required for SuperAdmin' });
      }
    } else {
      institutionId = actor.institutionId;
      if (!institutionId) return res.status(400).json({ message: 'Institution context required' });
    }

    const inst = await Institution.findById(institutionId);
    if (!inst) return res.status(404).json({ message: 'Institution not found' });

    // When InstitutionAdmin creates Teacher or Student: use native driver, auto-generate temp password
    const isInstitutionAdminCreatingStudentOrTeacher =
      actor.role === 'InstitutionAdmin' && (role === 'Teacher' || role === 'Student');

    if (isInstitutionAdminCreatingStudentOrTeacher) {
      await connectMongo();
      const db = getDB();
      const usersCol = db.collection(USERS);

      // Generate a secure temporary password (not logged or returned)
      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
      const salt = await bcrypt.genSalt(rounds);
      const hashed = await bcrypt.hash(tempPassword, salt);

      const now = new Date();
      const doc = {
        name,
        email: String(email).trim().toLowerCase(),
        password: hashed,
        role,
        institutionId: new ObjectId(String(institutionId)),
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      };

      // Add batch assignment if provided (for students primarily)
      const { batchId } = req.body || {};
      if (batchId) {
        doc.batchId = new ObjectId(String(batchId));
      }

      // Check email conflict
      const existing = await usersCol.findOne({ email: doc.email });
      if (existing) {
        return res.status(409).json({ message: 'Email already in use' });
      }

      const result = await usersCol.insertOne(doc);

      // Expose internally only for email/export (not in response)
      req.generatedCredentials = { email: doc.email, tempPassword };

      // Optionally send email if requested; failure must not block
      if (sendEmail === true || sendEmail === 'true') {
        try {
          await sendCredentialEmail({ to: doc.email, tempPassword });
        } catch (e) {
          // already safely logged inside service
        }
      }

      return res.status(201).json({
        user: sanitizeUser({ _id: result.insertedId, ...doc }),
      });
    }

    // Default path: use existing Mongoose logic for other roles/actors
    if (!password) {
      return res.status(400).json({ message: 'password is required' });
    }
    const user = await User.create({ name, email, password, role, institutionId });
    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    return res.status(500).json({ message: 'Failed to add staff' });
  }
}

async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ message: 'role is required' });

    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });

    if (!canAssignRole(actor.role, role)) {
      return res.status(403).json({ message: 'Forbidden: cannot assign this role' });
    }

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Prevent cross-institution access except for SuperAdmin
    if (actor.role !== 'SuperAdmin') {
      if (!actor.institutionId || String(target.institutionId) !== String(actor.institutionId)) {
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    target.role = role;
    await target.save();
    return res.status(200).json({ user: sanitizeUser(target) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update role' });
  }
}

// Bulk staff creation for InstitutionAdmin with one-time CSV export
async function bulkAddStaff(req, res) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });
    if (actor.role !== 'InstitutionAdmin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { users, sendEmail } = req.body || {};
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ message: 'users array is required' });
    }

    const institutionId = actor.institutionId;
    if (!institutionId) return res.status(400).json({ message: 'Institution context required' });

    await connectMongo();
    const db = getDB();
    const usersCol = db.collection(USERS);

    const now = new Date();
    const results = [];
    for (const u of users) {
      const name = u?.name;
      const email = String(u?.email || '').trim().toLowerCase();
      const role = u?.role;
      if (!name || !email || !role || !['Teacher', 'Student'].includes(role)) {
        results.push({ email: email || u?.email, status: 'failed', reason: 'invalid_input' });
        continue;
      }
      // conflict check
      const existing = await usersCol.findOne({ email });
      if (existing) {
        results.push({ email, status: 'skipped', reason: 'conflict' });
        continue;
      }
      // generate temp password
      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
      const salt = await bcrypt.genSalt(rounds);
      const hashed = await bcrypt.hash(tempPassword, salt);

      const doc = {
        name,
        email,
        password: hashed,
        role,
        institutionId: new ObjectId(String(institutionId)),
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      };

      const ins = await usersCol.insertOne(doc);

      // optional email send
      if (sendEmail === true || sendEmail === 'true') {
        try { await sendCredentialEmail({ to: email, tempPassword }); } catch (e) { }
      }

      results.push({
        email,
        name,
        role,
        userId: String(ins.insertedId),
        tempPassword, // for export only
        status: 'created',
      });
    }

    // build one-time export token
    const token = crypto.randomBytes(24).toString('base64url');
    _cleanupExports();
    _putExport(token, {
      institutionId: String(institutionId),
      actorId: String(actor._id || actor.id || ''),
      rows: results
        .filter((r) => r.status === 'created')
        .map((r) => ({ name: r.name, email: r.email, role: r.role, tempPassword: r.tempPassword })),
    });

    return res.status(201).json({
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      exportToken: token,
    });
  } catch (err) {
    console.error('bulkAddStaff error:', err);
    return res.status(500).json({ message: 'Failed to add staff in bulk' });
  }
}

async function downloadBulkExport(req, res) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });
    if (actor.role !== 'InstitutionAdmin') return res.status(403).json({ message: 'Forbidden' });

    const { token } = req.query || {};
    if (!token) return res.status(400).json({ message: 'token is required' });

    const data = _takeExport(token);
    if (!data) return res.status(404).json({ message: 'Export not found or already downloaded' });

    // Ensure same institution
    if (String(actor.institutionId) !== String(data.institutionId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const rows = data.rows || [];
    const header = ['Name', 'Email', 'Role', 'Temporary Password'];
    const csvLines = [header.join(',')];
    for (const r of rows) {
      const line = [r.name, r.email, r.role, r.tempPassword]
        .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"')
        .join(',');
      csvLines.push(line);
    }
    const csv = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('downloadBulkExport error:', err);
    return res.status(500).json({ message: 'Failed to download export' });
  }
}

async function listStaff(req, res) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Unauthorized' });

    let institutionId = null;
    if (actor.role === 'SuperAdmin') {
      institutionId = req.query.institutionId;
      if (!institutionId) {
        return res.status(400).json({ message: 'institutionId is required for SuperAdmin' });
      }
    } else {
      institutionId = actor.institutionId;
      if (!institutionId) return res.status(400).json({ message: 'Institution context required' });
    }

    // Only admins can list staff
    if (!['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(actor.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { role } = req.query || {};
    const filter = { institutionId: new ObjectId(String(institutionId)) };

    // Filter by role if specified
    if (role && ['Teacher', 'Student', 'Moderator', 'AcademicAdmin'].includes(role)) {
      filter.role = role;
    } else if (!role) {
      // Default: show teachers and students only
      filter.role = { $in: ['Teacher', 'Student', 'Moderator', 'AcademicAdmin'] };
    }

    await connectMongo();
    const db = getDB();
    const usersCol = db.collection(USERS);

    const staff = await usersCol
      .find(filter, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    const sanitizedStaff = staff.map(user => sanitizeUser(user));
    return res.status(200).json({ staff: sanitizedStaff });
  } catch (err) {
    console.error('listStaff error:', err);
    return res.status(500).json({ message: 'Failed to fetch staff' });
  }
}

module.exports = { registerInstitution, addStaff, updateUserRole, bulkAddStaff, downloadBulkExport, listStaff };
