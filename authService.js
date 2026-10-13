const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_opensign_salt_2026').digest('hex');
}

function getUsersDatabase() {
  if (!fs.existsSync(USERS_FILE)) {
    // Seed initial default demo user
    const defaultUser = {
      id: 'usr_default_demo',
      name: 'Demo User',
      email: 'demo@opensign.local',
      passwordHash: hashPassword('demo123'),
      createdAt: new Date().toISOString()
    };

    const initialDb = {
      users: [defaultUser],
      sessions: {}
    };

    fs.writeFileSync(USERS_FILE, JSON.stringify(initialDb, null, 2));
    return initialDb;
  }

  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: [], sessions: {} };
  }
}

function saveUsersDatabase(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
}

function registerUser(name, email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (name || '').trim();

  if (!cleanName || !cleanEmail || !password) {
    throw new Error('Name, email, and password are required.');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const db = getUsersDatabase();
  const existing = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
  const newUser = {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  const token = 'tok_' + crypto.randomBytes(24).toString('hex');
  db.users.push(newUser);
  db.sessions[token] = {
    userId: newUser.id,
    createdAt: new Date().toISOString()
  };

  saveUsersDatabase(db);

  return {
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      createdAt: newUser.createdAt
    }
  };
}

function loginUser(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Email and password are required.');
  }

  const db = getUsersDatabase();
  const user = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const inputHash = hashPassword(password);
  if (user.passwordHash !== inputHash) {
    throw new Error('Invalid email or password.');
  }

  const token = 'tok_' + crypto.randomBytes(24).toString('hex');
  db.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString()
  };

  saveUsersDatabase(db);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    }
  };
}

function getUserByToken(token) {
  if (!token) return null;
  const db = getUsersDatabase();
  const session = db.sessions[token];
  if (!session) return null;

  const user = db.users.find(u => u.id === session.userId);
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function logoutUser(token) {
  if (!token) return true;
  const db = getUsersDatabase();
  if (db.sessions[token]) {
    delete db.sessions[token];
    saveUsersDatabase(db);
  }
  return true;
}

module.exports = {
  getUsersDatabase,
  registerUser,
  loginUser,
  getUserByToken,
  logoutUser
};
