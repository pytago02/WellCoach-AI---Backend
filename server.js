const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const logsRoutes = require('./routes/logs');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Init DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ WellCoach server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to init DB:', err);
  process.exit(1);
});
