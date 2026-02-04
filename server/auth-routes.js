/**
 * Simple admin-only auth: one user "admin", password from env (bcrypt hash).
 * POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
 */
const express = require('express');
const bcrypt = require('bcrypt');

const router = express.Router();
const ADMIN_USERNAME = 'admin';

router.post('/login', express.json(), async (req, res) => {
  const { username, password } = req.body || {};
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!hash) {
    console.error('[Auth] ADMIN_PASSWORD_HASH not set in .env');
    return res.status(503).json({ error: 'Server auth not configured' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const match = await bcrypt.compare(password, hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.user = { username: ADMIN_USERNAME };
    return res.json({ ok: true, user: { username: ADMIN_USERNAME } });
  } catch (e) {
    console.error('[Auth] bcrypt error', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json(req.session.user);
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

module.exports = router;
