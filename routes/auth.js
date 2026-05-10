const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });

    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), email.toLowerCase(), hash]
    );

    const token = jwt.sign({ id: result.lastID, email: email.toLowerCase(), name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastID, name, email: email.toLowerCase() } });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, hasApiKey: !!user.anthropic_key }
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = get('SELECT id, name, email, created_at, anthropic_key FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, created_at: user.created_at, hasApiKey: !!user.anthropic_key });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/auth/apikey - Save encrypted Anthropic API key
router.put('/apikey', authMiddleware, (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });
    run('UPDATE users SET anthropic_key = ? WHERE id = ?', [apiKey, req.user.id]);
    res.json({ message: 'API key saved' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// GET /api/auth/apikey - Retrieve stored API key
router.get('/apikey', authMiddleware, (req, res) => {
  try {
    const user = get('SELECT anthropic_key FROM users WHERE id = ?', [req.user.id]);
    res.json({ apiKey: user?.anthropic_key || null });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch API key' });
  }
});

module.exports = router;
