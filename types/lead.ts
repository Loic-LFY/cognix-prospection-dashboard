export interface Lead {
  id: string;
  date_received: string | null;
  company: string;
  siret: string | null;
  score: number;
  sector: string | null;
  location: string | null;
  size: string | null;
  contact_name: string | null;
  contact_title: string | null;
  phone: string | null;
  email: string | null;
  current_host: string | null;
  angle: string | null;
  status: LeadStatus;
  temperature: Temperature;
  crm_checked: number;
  crm_exists: number | null;
  linkedin_url: string | null;
  linkedin_found: number;
  linkedin_connected: number;
  linkedin_message_sent: number;
  linkedin_status: LinkedInStatus;
  connection_sent_at: string | null;
  connection_accepted_at: string | null;
  linkedin_message_sent_at: string | null;
  sequence_step: number;
  last_action_date: string | null;
  calendly_sent: number;
  recap_generated: number;
  notes: string | null;
  qualification_status: QualificationStatus;
  created_at: string;
  updated_at: string;
}

export type QualificationStatus = 'pending_review' | 'approved' | 'rejected';

export type LeadStatus =
  | 'new'
  | 'linkedin_pending'
  | 'connection_sent'
  | 'connected'
  | 'message_sent'
  | 'chaud'
  | 'rdv_planifie'
  | 'converti'
  | 'perdu'
  | 'ban';

export type Temperature = 'new' | 'froid' | 'tiede' | 'chaud';

export type LinkedInStatus =
  | 'pending'
  | 'not_found'
  | 'found'
  | 'connection_sent'
  | 'connected'
  | 'message_sent'
  | 'replied';

export interface Control {
  id: number;
  status: 'active' | 'paused';
  mode: 'simulation' | 'reel';
  pause_reason: string | null;
  paused_at: string | null;
  resume_at: string | null;
  last_run: string | null;
  next_run: string | null;
  daily_actions: number;
  updated_at: string;
}

export interface Stats {
  total: number;
  linkedin_found: number;
  linkedin_actions_today: number;
  connections_accepted: number;
  leads_chauds: number;
  ban_count: number;
  funnel: FunnelStep[];
  daily: DailyCount[];
}

export interface FunnelStep {
  name: string;
  status: string;
  count: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface LeadsResponse {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LeadFilters {
  temperature?: Temperature;
  status?: LeadStatus;
  linkedin_status?: LinkedInStatus;
  search?: string;
  sortBy?: 'score' | 'created_at' | 'last_action_date';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
