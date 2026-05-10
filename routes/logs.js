const express = require('express');
const { query, run, get } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/logs - Get all logs for user (last 30 days)
router.get('/', (req, res) => {
  try {
    const logs = query(
      `SELECT * FROM wellness_logs 
       WHERE user_id = ? 
       ORDER BY log_date DESC 
       LIMIT 30`,
      [req.user.id]
    );
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/logs/stats - Aggregated stats (weekly averages)
router.get('/stats', (req, res) => {
  try {
    const stats = get(
      `SELECT 
        ROUND(AVG(sleep), 1) as avg_sleep,
        ROUND(AVG(water), 1) as avg_water,
        ROUND(AVG(exercise), 1) as avg_exercise,
        ROUND(AVG(stress), 1) as avg_stress,
        COUNT(*) as total_days,
        MIN(log_date) as first_log,
        MAX(log_date) as last_log
       FROM wellness_logs 
       WHERE user_id = ? AND log_date >= date('now', '-7 days')`,
      [req.user.id]
    );

    const streak = calculateStreak(req.user.id);
    res.json({ ...stats, streak });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

function calculateStreak(userId) {
  try {
    const logs = query(
      `SELECT log_date FROM wellness_logs 
       WHERE user_id = ? ORDER BY log_date DESC LIMIT 30`,
      [userId]
    );
    if (!logs.length) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < logs.length; i++) {
      const logDate = new Date(logs[i].log_date);
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (logDate.toDateString() === expected.toDateString()) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

// POST /api/logs - Create or update today's log
router.post('/', (req, res) => {
  try {
    const { sleep, water, exercise, stress, mood, notes, log_date } = req.body;

    if (sleep === undefined || water === undefined || exercise === undefined || stress === undefined || !mood) {
      return res.status(400).json({ error: 'sleep, water, exercise, stress, and mood are required' });
    }

    const date = log_date || new Date().toISOString().split('T')[0];

    // Upsert: update if exists, insert if not
    const existing = get(
      'SELECT id FROM wellness_logs WHERE user_id = ? AND log_date = ?',
      [req.user.id, date]
    );

    if (existing) {
      run(
        `UPDATE wellness_logs 
         SET sleep=?, water=?, exercise=?, stress=?, mood=?, notes=?
         WHERE user_id=? AND log_date=?`,
        [sleep, water, exercise, stress, mood, notes || null, req.user.id, date]
      );
      const updated = get('SELECT * FROM wellness_logs WHERE user_id=? AND log_date=?', [req.user.id, date]);
      return res.json({ ...updated, updated: true });
    }

    const result = run(
      `INSERT INTO wellness_logs (user_id, log_date, sleep, water, exercise, stress, mood, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, date, sleep, water, exercise, stress, mood, notes || null]
    );

    const created = get('SELECT * FROM wellness_logs WHERE id = ?', [result.lastID]);
    res.status(201).json({ ...created, updated: false });
  } catch (e) {
    console.error('Log create error:', e.message);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// DELETE /api/logs/:date - Delete a log entry
router.delete('/:date', (req, res) => {
  try {
    const log = get(
      'SELECT id FROM wellness_logs WHERE user_id = ? AND log_date = ?',
      [req.user.id, req.params.date]
    );
    if (!log) return res.status(404).json({ error: 'Log not found' });

    run('DELETE FROM wellness_logs WHERE id = ?', [log.id]);
    res.json({ message: 'Log deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

module.exports = router;
