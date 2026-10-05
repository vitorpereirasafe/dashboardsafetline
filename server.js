const path = require('path');
const http = require('http');
const express = require('express');
const { Pool } = require('pg');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
const PLAN_SLOTS = 8;

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
  schema: 2,
  savedAt: Date.now(),
  plans: Array.from({ length: PLAN_SLOTS }, (_, id) => ({ id, plano: '', injetora: '', giros: [] })),
  completedLog: [],
  completedPlansLog: []
});

// Preserva os seis planos já existentes e acrescenta G/H vazios.
// Também aceita por segurança um clique enviado por uma aba antiga durante o deploy.
function normalizeState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.plans)) return null;
  if (![6, PLAN_SLOTS].includes(state.plans.length)) return null;
  if (!Array.isArray(state.completedLog) || !Array.isArray(state.completedPlansLog)) return null;
  if (!state.plans.every((plan, index) =>
    plan && typeof plan === 'object' && Number(plan.id) === index && Array.isArray(plan.giros)
  )) return null;

  const plans = state.plans.map((plan, id) => ({ ...plan, id }));
  while (plans.length < PLAN_SLOTS) {
    const id = plans.length;
    plans.push({ id, plano: '', injetora: '', giros: [] });
  }
  return { ...state, schema: 2, plans };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_state_history (
      id BIGSERIAL PRIMARY KEY,
      payload JSONB NOT NULL,
      source_revision BIGINT NOT NULL,
      action_label TEXT NOT NULL DEFAULT 'Alteração no dashboard',
      action_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_state_history_action_at
    ON dashboard_state_history (action_at DESC)
  `);
  await pool.query(
    `INSERT INTO dashboard_state (id, payload, revision)
     VALUES (1, $1::jsonb, 0)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(emptyState())]
  );

  // Migração idempotente do estado salvo: 6 slots -> 8 slots, sem apagar cliques.
  const current = await pool.query('SELECT payload FROM dashboard_state WHERE id = 1');
  const stored = current.rows[0] && current.rows[0].payload;
  const normalized = normalizeState(stored);
  if (normalized && stored.plans.length !== PLAN_SLOTS) {
    await pool.query(
      `UPDATE dashboard_state
       SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW()
       WHERE id = 1`,
      [JSON.stringify(normalized)]
    );
  }
}

function isValidState(state) {
  return Boolean(normalizeState(state));
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

app.get('/api/history', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, source_revision, action_label, action_at
       FROM dashboard_state_history
       ORDER BY id DESC
       LIMIT 20`
    );
    res.set('Cache-Control', 'no-store');
    res.json({ versions: result.rows.map(row => ({
      id: Number(row.id),
      revision: Number(row.source_revision),
      action: row.action_label,
      actionAt: row.action_at
    })) });
  } catch (error) { next(error); }
});

async function saveStateHandler(req, res, next) {
  const client = await pool.connect();
  try {
    const incomingState = req.body && req.body.state;
    if (!isValidState(incomingState)) {
      return res.status(400).json({ error: 'Estado do dashboard inválido.' });
    }
    const state = normalizeState(incomingState);
    const action = String((req.body && req.body.action) || 'Alteração no dashboard').slice(0, 240);
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT payload, revision FROM dashboard_state WHERE id = 1 FOR UPDATE'
    );
    const currentRow = locked.rows[0];
    // Se uma aba antiga (6 slots) salvar durante a atualização, ela não pode
    // apagar os planos G/H que já tenham sido preenchidos na versão nova.
    if (incomingState.plans.length === 6) {
      const currentState = normalizeState(currentRow && currentRow.payload);
      if (currentState) state.plans.splice(6, 2, ...currentState.plans.slice(6, 8));
    }
    state.savedAt = Date.now();
    await client.query(
      `INSERT INTO dashboard_state_history
       (payload, source_revision, action_label, action_at)
       VALUES ($1::jsonb, $2, $3, NOW())`,
      [JSON.stringify(currentRow.payload), currentRow.revision, action]
    );
    const result = await client.query(
      `UPDATE dashboard_state
       SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW()
       WHERE id = 1
       RETURNING payload, revision, updated_at`,
      [JSON.stringify(state)]
    );
    await client.query(`
      DELETE FROM dashboard_state_history
      WHERE id NOT IN (
        SELECT id FROM dashboard_state_history ORDER BY id DESC LIMIT 20
      )
    `);
    await client.query('COMMIT');
    const row = result.rows[0];
    const message = JSON.stringify({
      type: 'state',
      state: row.payload,
      revision: Number(row.revision),
      updatedAt: row.updated_at
    });
    broadcast(message);
    res.json({ ok: true, revision: Number(row.revision), updatedAt: row.updated_at });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
}

app.post('/api/history/:id/restore', async (req, res, next) => {
  const historyId = Number(req.params.id);
  if (!Number.isSafeInteger(historyId) || historyId <= 0) {
    return res.status(400).json({ error: 'Versão inválida.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT payload, revision FROM dashboard_state WHERE id = 1 FOR UPDATE'
    );
    const versionResult = await client.query(
      'SELECT payload, action_label, action_at FROM dashboard_state_history WHERE id = $1',
      [historyId]
    );
    if (!versionResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Essa versão não está mais disponível.' });
    }
    const current = currentResult.rows[0];
    const version = versionResult.rows[0];
    const restored = normalizeState(version.payload);
    if (!restored) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'O estado desta versão é inválido.' });
    }
    await client.query(
      `INSERT INTO dashboard_state_history
       (payload, source_revision, action_label, action_at)
       VALUES ($1::jsonb, $2, $3, NOW())`,
      [JSON.stringify(current.payload), current.revision, `Antes da restauração: ${version.action_label}`]
    );
    restored.savedAt = Date.now();
    const updated = await client.query(
      `UPDATE dashboard_state
       SET payload = $1::jsonb, revision = revision + 1, updated_at = NOW()
       WHERE id = 1
       RETURNING payload, revision, updated_at`,
      [JSON.stringify(restored)]
    );
    await client.query(`
      DELETE FROM dashboard_state_history
      WHERE id NOT IN (
        SELECT id FROM dashboard_state_history ORDER BY id DESC LIMIT 20
      )
    `);
    await client.query('COMMIT');
    const row = updated.rows[0];
    const message = JSON.stringify({
      type: 'state', state: row.payload,
      revision: Number(row.revision), updatedAt: row.updated_at
    });
    broadcast(message);
    res.json({
      ok: true, state: row.payload, revision: Number(row.revision),
      updatedAt: row.updated_at
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

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
