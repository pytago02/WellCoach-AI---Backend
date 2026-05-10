const express = require('express');
const { query, run, get } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/chat/history - Get recent chat history
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = query(
      `SELECT role, content, created_at FROM chat_history 
       WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
      [req.user.id, limit]
    );
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// DELETE /api/chat/history - Clear chat history
router.delete('/history', (req, res) => {
  try {
    run('DELETE FROM chat_history WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'Chat history cleared' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// POST /api/chat/send - Send message, proxy to Claude, persist
router.post('/send', async (req, res) => {
  try {
    const { message, apiKey: bodyApiKey } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Get API key (from body or stored)
    let apiKey = bodyApiKey;
    if (!apiKey) {
      const user = get('SELECT anthropic_key FROM users WHERE id = ?', [req.user.id]);
      apiKey = user?.anthropic_key;
    }
    if (!apiKey) return res.status(400).json({ error: 'No API key. Please connect your Anthropic key.' });

    // Get user's wellness logs for context
    const logs = query(
      `SELECT log_date, sleep, water, exercise, stress, mood, notes 
       FROM wellness_logs WHERE user_id = ? 
       ORDER BY log_date DESC LIMIT 7`,
      [req.user.id]
    );

    const user = get('SELECT name FROM users WHERE id = ?', [req.user.id]);

    // Build system prompt
    const logSummary = logs.length > 0
      ? logs.map(l =>
          `${l.log_date}: Sleep ${l.sleep}h, Water ${l.water} glasses, Exercise ${l.exercise}min, Stress ${l.stress}/10, Mood ${l.mood}${l.notes ? ', Notes: ' + l.notes : ''}`
        ).join('\n')
      : 'No logs recorded yet.';

    const systemPrompt = `You are WellCoach AI, a warm, empathetic, and knowledgeable personal wellness coach for ${user?.name || 'the user'}.

IMPORTANT GUIDELINES:
- Be warm, encouraging, and non-judgmental
- Keep responses concise (3-5 sentences for simple questions, slightly longer for analysis)
- Always reference the user's actual logged data when relevant
- Offer one specific, actionable suggestion per response
- You are NOT a medical professional. For health concerns, recommend they consult a doctor
- Use a conversational, friendly tone — not clinical or robotic
- Address the user by their name (${user?.name || 'friend'}) occasionally

USER'S WELLNESS LOG (most recent first):
${logSummary}

Today's metrics are at the top. Use this data to personalise your responses. If no data is logged yet, gently encourage them to complete their first check-in.`;

    // Get recent chat history for context
    const historyRows = query(
      `SELECT role, content FROM chat_history 
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    const conversationHistory = historyRows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));

    // Add current message
    conversationHistory.push({ role: 'user', content: message });

    // Call Claude API
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    // const response = await fetch('https://api.anthropic.com/v1/messages', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'x-api-key': apiKey,
    //     'anthropic-version': '2023-06-01'
    //   },
    //   body: JSON.stringify({
    //     model: 'claude-sonnet-4-20250514',
    //     max_tokens: 1000,
    //     system: systemPrompt,
    //     messages: conversationHistory
    //   })
    // });

// const response = await fetch(
//   "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
//   {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify({
//       contents: [
//         {
//           role: "user",
//           parts: [
//             { text: "Xin chào, đây là thử nghiệm với Gemini API!" }
//           ]
//         }
//       ]
//     })
//   }
// );

// const data = await response.json();
// console.log(data);


//     const data = await response.json();

//     if (data.error) {
//       return res.status(400).json({ error: data.error.message || 'Claude API error' });
//     }

//     const reply = data.content[0].text;

//     // Persist both messages
//     run('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [req.user.id, 'user', message]);
//     run('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [req.user.id, 'assistant', reply]);

//     res.json({ reply, usage: data.usage });

const response = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: message } // dùng message từ người dùng
          ]
        }
      ]
    })
  }
);

const data = await response.json();

if (data.error) {
  return res.status(400).json({ error: data.error.message || 'Gemini API error' });
}

// Lấy text từ Gemini response
const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No reply";

// Lưu lịch sử chat
run('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [req.user.id, 'user', message]);
run('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [req.user.id, 'assistant', reply]);

res.json({ reply });

  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: 'Failed to send message: ' + e.message });
  }
});

module.exports = router;
