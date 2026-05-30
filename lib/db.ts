import Database from 'better-sqlite3';
import type { Lead, Control, LeadFilters, QualificationStatus, OutreachChannel, DailyCount } from '@/types/lead';

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
      linkedin_connected INTEGER DEFAULT 0,
      linkedin_message_sent INTEGER DEFAULT 0,
      linkedin_status TEXT DEFAULT 'pending',
      connection_sent_at TEXT,
      connection_accepted_at TEXT,
      linkedin_message_sent_at TEXT,
      linkedin_conv_step INTEGER DEFAULT 0,
      linkedin_engagement TEXT DEFAULT 'none',
      linkedin_last_reply_at TEXT,
      linkedin_rdv_proposed INTEGER DEFAULT 0,
      sequence_step INTEGER DEFAULT 0,
      last_action_date TEXT,
      calendly_sent INTEGER DEFAULT 0,
      recap_generated INTEGER DEFAULT 0,
      notes TEXT,
      qualification_status TEXT DEFAULT 'pending_review',
      outreach_channel TEXT DEFAULT 'linkedin',
      outreach_queued_at TEXT,
      outreach_sent_at TEXT,
      email_outreach_status TEXT DEFAULT 'pending',
      email_opened INTEGER DEFAULT 0,
      email_opened_at TEXT,
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
      last_run TEXT,
      next_run TEXT,
      daily_actions INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO control (id, status, mode, daily_actions, updated_at)
    VALUES (1, 'active', 'simulation', 0, datetime('now'));
  `);

  // Migrations: add new columns to existing tables without breaking them
  const migrations = [
    "ALTER TABLE leads ADD COLUMN linkedin_conv_step INTEGER DEFAULT 0",
    "ALTER TABLE leads ADD COLUMN linkedin_engagement TEXT DEFAULT 'none'",
    "ALTER TABLE leads ADD COLUMN linkedin_last_reply_at TEXT",
    "ALTER TABLE leads ADD COLUMN linkedin_rdv_proposed INTEGER DEFAULT 0",
    "ALTER TABLE leads ADD COLUMN qualification_status TEXT DEFAULT 'pending_review'",
    "ALTER TABLE leads ADD COLUMN outreach_channel TEXT DEFAULT 'linkedin'",
    "ALTER TABLE leads ADD COLUMN outreach_queued_at TEXT",
    "ALTER TABLE leads ADD COLUMN outreach_sent_at TEXT",
    "ALTER TABLE leads ADD COLUMN email_outreach_status TEXT DEFAULT 'pending'",
    "ALTER TABLE leads ADD COLUMN email_opened INTEGER DEFAULT 0",
    "ALTER TABLE leads ADD COLUMN email_opened_at TEXT",
    "ALTER TABLE leads ADD COLUMN linkedin_connection_note TEXT",
    "ALTER TABLE leads ADD COLUMN linkedin_first_message TEXT",
    "ALTER TABLE leads ADD COLUMN email_draft_subject TEXT",
    "ALTER TABLE leads ADD COLUMN email_draft_body TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Reset les leads 'chaud' sans activité réelle (import incorrect)
  db.exec(`
    UPDATE leads SET temperature = 'new', updated_at = datetime('now')
    WHERE temperature = 'chaud'
      AND linkedin_connected = 0
      AND linkedin_message_sent = 0
      AND status = 'new'
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

export function getLeadByEmail(email: string): Lead | undefined {
  return getDb().prepare('SELECT * FROM leads WHERE email = ? LIMIT 1').get(email) as
    | Lead
    | undefined;
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
      status, temperature, linkedin_url, linkedin_found, linkedin_connected,
      linkedin_message_sent, linkedin_status,
      linkedin_conv_step, linkedin_engagement, linkedin_rdv_proposed,
      notes, created_at, updated_at
    ) VALUES (
      :id, :date_received, :company, :siret, :score, :sector, :location, :size,
      :contact_name, :contact_title, :phone, :email, :current_host, :angle,
      :status, :temperature, :linkedin_url, :linkedin_found, :linkedin_connected,
      :linkedin_message_sent, :linkedin_status,
      :linkedin_conv_step, :linkedin_engagement, :linkedin_rdv_proposed,
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
    temperature: 'new',  // toujours 'new' à la création, évolue via le pipeline
    linkedin_url: data.linkedin_url ?? null,
    linkedin_found: data.linkedin_found ?? 0,
    linkedin_connected: data.linkedin_connected ?? 0,
    linkedin_message_sent: data.linkedin_message_sent ?? 0,
    linkedin_status: data.linkedin_status ?? 'pending',
    linkedin_conv_step: data.linkedin_conv_step ?? 0,
    linkedin_engagement: data.linkedin_engagement ?? 'none',
    linkedin_rdv_proposed: data.linkedin_rdv_proposed ?? 0,
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
    'linkedin_connected', 'linkedin_message_sent', 'linkedin_status',
    'connection_sent_at', 'connection_accepted_at', 'linkedin_message_sent_at',
    'linkedin_conv_step', 'linkedin_engagement', 'linkedin_last_reply_at',
    'linkedin_rdv_proposed',
    'sequence_step', 'last_action_date', 'calendly_sent', 'recap_generated',
    'notes', 'crm_checked', 'crm_exists', 'qualification_status',
    'outreach_channel', 'outreach_queued_at', 'outreach_sent_at',
    'email_outreach_status', 'email_opened', 'email_opened_at',
    'linkedin_connection_note', 'linkedin_first_message', 'email_draft_subject', 'email_draft_body',
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
      .prepare('SELECT COUNT(*) as c FROM leads WHERE linkedin_connected = 1')
      .get() as { c: number }
  ).c;

  const leads_chauds = (
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE temperature = 'chaud'").get() as { c: number }
  ).c;

  const ban_count = (
    db.prepare('SELECT COUNT(*) as c FROM ban_list').get() as { c: number }
  ).c;

  // LinkedIn engagement breakdown
  const linkedin_engaged = (
    db.prepare("SELECT COUNT(*) as c FROM leads WHERE linkedin_engagement IN ('replied', 'warm', 'rdv_proposed')").get() as { c: number }
  ).c;

  const funnelStatuses = [
    { name: 'Nouveaux', status: 'new' },
    { name: 'Connexion envoyée', status: 'connection_sent' },
    { name: 'Connecté', status: 'connected' },
    { name: 'En conversation', status: 'message_sent' },
    { name: 'RDV proposé', status: 'rdv_planifie' },
    { name: 'Chaud 🔥', status: 'chaud' },
  ];

  const funnel = funnelStatuses.map(({ name, status }) => ({
    name,
    status,
    count: (
      db.prepare('SELECT COUNT(*) as c FROM leads WHERE status = ?').get(status) as { c: number }
    ).c,
  }));

  const dailyRaw = db.prepare(`
    SELECT DATE(created_at) as date, temperature, COUNT(*) as count
    FROM leads
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY DATE(created_at), temperature
  `).all() as { date: string; temperature: string; count: number }[];

  const dailyConnRaw = db.prepare(`
    SELECT DATE(connection_accepted_at) as date, COUNT(*) as count
    FROM leads
    WHERE connection_accepted_at IS NOT NULL
      AND connection_accepted_at >= datetime('now', '-7 days')
    GROUP BY DATE(connection_accepted_at)
  `).all() as { date: string; count: number }[];

  const daily: DailyCount[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const rows = dailyRaw.filter((r) => r.date === dateStr);
    const conn = dailyConnRaw.find((r) => r.date === dateStr);
    daily.push({
      date: dateStr,
      count: rows.reduce((s, r) => s + r.count, 0),
      new: rows.find((r) => r.temperature === 'new')?.count ?? 0,
      froid: rows.find((r) => r.temperature === 'froid')?.count ?? 0,
      tiede: rows.find((r) => r.temperature === 'tiede')?.count ?? 0,
      chaud: rows.find((r) => r.temperature === 'chaud')?.count ?? 0,
      connections: conn?.count ?? 0,
    });
  }

  return {
    total,
    linkedin_found,
    linkedin_actions_today,
    connections_accepted,
    leads_chauds,
    ban_count,
    linkedin_engaged,
    funnel,
    daily,
  };
}

// ─── Control ──────────────────────────────────────────────────────────────────

/** Synchronise le mode (simulation/reel) selon la présence de PHANTOMBUSTER_API_KEY. */
export function syncControlMode(): Control {
  const hasKey = !!process.env.PHANTOMBUSTER_API_KEY;
  const db = getDb();
  const current = db.prepare('SELECT mode FROM control WHERE id = 1').get() as { mode: string };
  const expected = hasKey ? 'reel' : 'simulation';
  if (current.mode !== expected) {
    db.prepare("UPDATE control SET mode = :mode, updated_at = datetime('now') WHERE id = 1").run({ mode: expected });
  }
  return getControl();
}

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

export function updateControlRun(nextRun?: string): Control {
  getDb()
    .prepare(
      `UPDATE control SET last_run = datetime('now'), next_run = :next_run, updated_at = datetime('now') WHERE id = 1`
    )
    .run({ next_run: nextRun ?? null });
  return getControl();
}

export function incrementDailyActions(count = 1): Control {
  getDb()
    .prepare(
      `UPDATE control SET daily_actions = daily_actions + :count, updated_at = datetime('now') WHERE id = 1`
    )
    .run({ count });
  return getControl();
}

// ─── Qualification manuelle ─────────────────────────────────────────────────────────────────────────────────

export function setQualificationStatus(
  id: string,
  status: QualificationStatus
): Lead | undefined {
  getDb()
    .prepare(
      `UPDATE leads SET qualification_status = :status, updated_at = datetime('now') WHERE id = :id`
    )
    .run({ id, status });
  return getLeadById(id);
}

export function deleteLead(id: string): void {
  getDb().prepare('DELETE FROM leads WHERE id = ?').run(id);
}

// ─── Outreach queue ─────────────────────────────────────────────────────────────────────────────────────

export function queueLeadForOutreach(id: string, channel: OutreachChannel): Lead | undefined {
  getDb()
    .prepare(
      `UPDATE leads
       SET outreach_channel = :channel, outreach_queued_at = datetime('now'), updated_at = datetime('now')
       WHERE id = :id AND qualification_status = 'approved'`
    )
    .run({ id, channel });
  return getLeadById(id);
}

export function getQueuedLeads(channel: OutreachChannel): Lead[] {
  return getDb()
    .prepare(
      `SELECT * FROM leads
       WHERE qualification_status = 'approved'
         AND outreach_channel = ?
         AND outreach_queued_at IS NOT NULL
         AND outreach_sent_at IS NULL
       ORDER BY outreach_queued_at ASC`
    )
    .all(channel) as Lead[];
}

export function markOutreachSent(id: string): Lead | undefined {
  getDb()
    .prepare(
      `UPDATE leads SET outreach_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
    .run(id);
  return getLeadById(id);
}

export function markEmailOpened(id: string): Lead | undefined {
  getDb()
    .prepare(
      `UPDATE leads
       SET email_opened = 1, email_opened_at = datetime('now'),
           email_outreach_status = 'opened', updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(id);
  return getLeadById(id);
}

export function resetDailyActions(): Control {
  getDb()
    .prepare(
      `UPDATE control SET daily_actions = 0, updated_at = datetime('now') WHERE id = 1`
    )
    .run();
  return getControl();
}

