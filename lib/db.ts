import Database from 'better-sqlite3';
import path from 'path';
import type { Lead, Control, LeadFilters } from '@/types/lead';

const DB_PATH =
  process.env.DATABASE_URL ||
  '/home/node/.openclaw/workspace/state/cognix/leads.db';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initDb(_db);
  }
  return _db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      date_received TEXT,
      company TEXT,
      siret TEXT,
      score INTEGER,
      sector TEXT,
      location TEXT,
      size TEXT,
      contact_name TEXT,
      contact_title TEXT,
      phone TEXT,
      email TEXT,
      current_host TEXT,
      angle TEXT,
      status TEXT DEFAULT 'new',
      temperature TEXT DEFAULT 'new',
      crm_checked INTEGER DEFAULT 0,
      crm_exists INTEGER,
      linkedin_url TEXT,
      linkedin_found INTEGER DEFAULT 0,
      linkedin_status TEXT DEFAULT 'pending',
      connection_sent_at TEXT,
      connection_accepted_at TEXT,
      linkedin_message_sent_at TEXT,
      sequence_step INTEGER DEFAULT 0,
      last_action_date TEXT,
      calendly_sent INTEGER DEFAULT 0,
      recap_generated INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      step INTEGER,
      type TEXT,
      direction TEXT,
      subject TEXT,
      body TEXT,
      sent_at TEXT,
      mode TEXT DEFAULT 'simulation',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ban_list (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      reason TEXT,
      banned_at TEXT,
      unban_at TEXT,
      recontact_approved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS control (
      id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'active',
      mode TEXT DEFAULT 'simulation',
      pause_reason TEXT,
      paused_at TEXT,
      resume_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO control (id, status, mode, updated_at)
    VALUES (1, 'active', 'simulation', datetime('now'));
  `);
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export function getLeads(filters: LeadFilters = {}): {
  data: Lead[];
  total: number;
} {
  const db = getDb();
  const {
    temperature,
    status,
    linkedin_status,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    pageSize = 20,
  } = filters;

  const allowedSorts = ['score', 'created_at', 'last_action_date'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (temperature) {
    conditions.push('temperature = :temperature');
    params.temperature = temperature;
  }
  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }
  if (linkedin_status) {
    conditions.push('linkedin_status = :linkedin_status');
    params.linkedin_status = linkedin_status;
  }
  if (search) {
    conditions.push(
      '(company LIKE :search OR contact_name LIKE :search OR location LIKE :search OR sector LIKE :search)'
    );
    params.search = `%${search}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM leads ${where}`)
      .get(params) as { count: number }
  ).count;

  const data = db
    .prepare(
      `SELECT * FROM leads ${where} ORDER BY ${safeSort} ${safeOrder} LIMIT :limit OFFSET :offset`
    )
    .all({ ...params, limit: pageSize, offset }) as Lead[];

  return { data, total };
}

export function getLeadById(id: string): Lead | undefined {
  return getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id) as
    | Lead
    | undefined;
}

export function createLead(data: Partial<Lead>): Lead {
  const db = getDb();
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO leads (
      id, date_received, company, siret, score, sector, location, size,
      contact_name, contact_title, phone, email, current_host, angle,
      status, temperature, linkedin_url, linkedin_found, linkedin_status,
      notes, created_at, updated_at
    ) VALUES (
      :id, :date_received, :company, :siret, :score, :sector, :location, :size,
      :contact_name, :contact_title, :phone, :email, :current_host, :angle,
      :status, :temperature, :linkedin_url, :linkedin_found, :linkedin_status,
      :notes, datetime('now'), datetime('now')
    )`
  ).run({
    id,
    date_received: data.date_received ?? null,
    company: data.company ?? '',
    siret: data.siret ?? null,
    score: data.score ?? 0,
    sector: data.sector ?? null,
    location: data.location ?? null,
    size: data.size ?? null,
    contact_name: data.contact_name ?? null,
    contact_title: data.contact_title ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    current_host: data.current_host ?? null,
    angle: data.angle ?? null,
    status: data.status ?? 'new',
    temperature: data.temperature ?? 'new',
    linkedin_url: data.linkedin_url ?? null,
    linkedin_found: data.linkedin_found ?? 0,
    linkedin_status: data.linkedin_status ?? 'pending',
    notes: data.notes ?? null,
  });
  return getLeadById(id)!;
}

export function updateLead(id: string, data: Partial<Lead>): Lead | undefined {
  const db = getDb();
  const allowed = [
    'company', 'siret', 'score', 'sector', 'location', 'size',
    'contact_name', 'contact_title', 'phone', 'email', 'current_host',
    'angle', 'status', 'temperature', 'linkedin_url', 'linkedin_found',
    'linkedin_status', 'connection_sent_at', 'connection_accepted_at',
    'linkedin_message_sent_at', 'sequence_step', 'last_action_date',
    'calendly_sent', 'recap_generated', 'notes', 'crm_checked', 'crm_exists',
  ];
  const sets: string[] = [];
  const params: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in data) {
      sets.push(`${key} = :${key}`);
      params[key] = (data as Record<string, unknown>)[key];
    }
  }

  if (sets.length === 0) return getLeadById(id);

  sets.push("updated_at = datetime('now')");
  params.id = id;

  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = :id`).run(params);
  return getLeadById(id);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM leads').get() as { c: number }).c;
  const linkedin_found = (
    db.prepare('SELECT COUNT(*) as c FROM leads WHERE linkedin_found = 1').get() as { c: number }
  ).c;

  const today = new Date().toISOString().slice(0, 10);
  const linkedin_actions_today = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM leads WHERE (connection_sent_at LIKE :d OR linkedin_message_sent_at LIKE :d)`
      )
      .get({ d: `${today}%` }) as { c: number }
  ).c;

  const connections_accepted = (
    db
      .prepare("SELECT COUNT(*) as c FROM leads WHERE connection_accepted_at IS NOT NULL")
      .get() as { c: number }
  ).c;

  const leads_chauds = (
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE temperature = 'chaud'").get() as { c: number }
  ).c;

  const ban_count = (
    db.prepare('SELECT COUNT(*) as c FROM ban_list').get() as { c: number }
  ).c;

  const funnelStatuses = [
    { name: 'Nouveaux', status: 'new' },
    { name: 'LinkedIn en attente', status: 'linkedin_pending' },
    { name: 'Connexion envoyée', status: 'connection_sent' },
    { name: 'Connecté', status: 'connected' },
    { name: 'Message envoyé', status: 'message_sent' },
    { name: 'Chaud 🔥', status: 'chaud' },
  ];

  const funnel = funnelStatuses.map(({ name, status }) => ({
    name,
    status,
    count: (
      db.prepare('SELECT COUNT(*) as c FROM leads WHERE status = ?').get(status) as { c: number }
    ).c,
  }));

  const dailyRaw = db
    .prepare(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM leads
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
    .all() as { date: string; count: number }[];

  const daily: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = dailyRaw.find((r) => r.date === dateStr);
    daily.push({ date: dateStr, count: found?.count ?? 0 });
  }

  return {
    total,
    linkedin_found,
    linkedin_actions_today,
    connections_accepted,
    leads_chauds,
    ban_count,
    funnel,
    daily,
  };
}

// ─── Control ──────────────────────────────────────────────────────────────────

export function getControl(): Control {
  return getDb().prepare('SELECT * FROM control WHERE id = 1').get() as Control;
}

export function pauseControl(reason?: string): Control {
  getDb()
    .prepare(
      `UPDATE control SET status = 'paused', pause_reason = :reason, paused_at = datetime('now'), updated_at = datetime('now') WHERE id = 1`
    )
    .run({ reason: reason ?? null });
  return getControl();
}

export function resumeControl(): Control {
  getDb()
    .prepare(
      `UPDATE control SET status = 'active', pause_reason = NULL, paused_at = NULL, resume_at = NULL, updated_at = datetime('now') WHERE id = 1`
    )
    .run();
  return getControl();
}
