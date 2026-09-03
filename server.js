const path = require('path');
const http = require('http');
const express = require('express');
const { Pool } = require('pg');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não foi configurada. Use o Blueprint do Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const emptyState = () => ({
  schema: 1,
  savedAt: Date.now(),
  plans: Array.from({ length: 6 }, (_, id) => ({ id, plano: '', injetora: '', giros: [] })),
  completedLog: [],
  completedPlansLog: []
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `INSERT INTO dashboard_state (id, payload, revision)
     VALUES (1, $1::jsonb, 0)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(emptyState())]
  );
}

function isValidState(state) {
  if (!state || typeof state !== 'object') return false;
  if (!Array.isArray(state.plans) || state.plans.length !== 6) return false;
  if (!Array.isArray(state.completedLog) || !Array.isArray(state.completedPlansLog)) return false;
  return state.plans.every((plan, index) =>
    plan && typeof plan === 'object' && Number(plan.id) === index && Array.isArray(plan.giros)
  );
}

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/state', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT payload, revision, updated_at FROM dashboard_state WHERE id = 1'
    );
    const row = result.rows[0];
    res.set('Cache-Control', 'no-store');
    res.json({ state: row.payload, revision: Number(row.revision), updatedAt: row.updated_at });
  } catch (error) { next(error); }
});

async function saveStateHandler(req, res, next) {
  try {
    const state = req.body && req.body.state;
    if (!isValidState(state)) {
      return res.status(400).json({ error: 'Estado do dashboard inválido.' });
    }
    state.savedAt = Date.now();
    const result = await pool.query(
      `UPDATE dashboard_state
       SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW()
       WHERE id = 1
       RETURNING payload, revision, updated_at`,
      [JSON.stringify(state)]
    );
    const row = result.rows[0];
    const message = JSON.stringify({
      type: 'state',
      state: row.payload,
      revision: Number(row.revision),
      updatedAt: row.updated_at
    });
    broadcast(message);
    res.json({ ok: true, revision: Number(row.revision), updatedAt: row.updated_at });
  } catch (error) { next(error); }
}

app.put('/api/state', saveStateHandler);
// sendBeacon usa POST ao fechar a página; recebe o último clique antes da saída.
app.post('/api/state', saveStateHandler);

app.use(express.static(path.join(__dirname), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0
}));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno ao salvar o dashboard.' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

wss.on('connection', socket => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

async function shutdown() {
  clearInterval(heartbeat);
  wss.close();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

initializeDatabase()
  .then(() => server.listen(port, '0.0.0.0', () => console.log(`Dashboard ativo na porta ${port}`)))
  .catch(error => {
    console.error('Falha ao iniciar o banco:', error);
    process.exit(1);
  });
