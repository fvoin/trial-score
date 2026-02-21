const API_BASE = '/api';

// Types
export interface Competitor {
  id: number;
  number: number;
  name: string;
  primary_class: 'kids' | 'clubman' | 'advanced' | 'enduro-trial';
  enduro_trial: number;
  photo_url: string | null;
  created_at: string;
}

export interface Section {
  id: number;
  name: string;
  type: 'main' | 'enduro' | 'kids';
  section_order: number;
}

export interface Score {
  id: number;
  competitor_id: number;
  section_id: number;
  lap: number;
  points: number | null;
  is_dnf: number;
  created_at: string;
  updated_at: string | null;
  competitor_name?: string;
  competitor_number?: number;
  section_name?: string;
  section_type?: string;
  photo_url?: string;
}

export interface LeaderboardEntry extends Competitor {
  main_total: number;
  enduro_total: number;
  main_sections_done: number;
  enduro_sections_done: number;
  main_dnf_count: number;
  enduro_dnf_count: number;
  main_last_scored_at: string;
  enduro_last_scored_at: string;
}

export interface Settings {
  id: number;
  event_name: string;
  event_date: string | null;
  email_backup_address: string | null;
  email_backup_enabled: number;
}

// Competitors
export async function getCompetitors(): Promise<Competitor[]> {
  const res = await fetch(`${API_BASE}/competitors`);
  if (!res.ok) throw new Error('Failed to fetch competitors');
  return res.json();
}

export async function getCompetitor(id: number): Promise<Competitor & { scores: Score[] }> {
  const res = await fetch(`${API_BASE}/competitors/${id}`);
  if (!res.ok) throw new Error('Failed to fetch competitor');
  return res.json();
}

export async function createCompetitor(data: FormData): Promise<Competitor> {
  const res = await fetch(`${API_BASE}/competitors`, {
    method: 'POST',
    body: data
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create competitor');
  }
  return res.json();
}

export async function updateCompetitor(id: number, data: FormData): Promise<Competitor> {
  const res = await fetch(`${API_BASE}/competitors/${id}`, {
    method: 'PUT',
    body: data
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update competitor');
  }
  return res.json();
}

export async function deleteCompetitor(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/competitors/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete competitor');
}

// Sections
export async function getSections(): Promise<Section[]> {
  const res = await fetch(`${API_BASE}/scores/sections`);
  if (!res.ok) throw new Error('Failed to fetch sections');
  return res.json();
}

// Scores
export async function getScores(): Promise<Score[]> {
  const res = await fetch(`${API_BASE}/scores`);
  if (!res.ok) throw new Error('Failed to fetch scores');
  return res.json();
}

export async function getScoresBySection(sectionId: number): Promise<Score[]> {
  const res = await fetch(`${API_BASE}/scores/section/${sectionId}`);
  if (!res.ok) throw new Error('Failed to fetch section scores');
  return res.json();
}

export interface NextLapResponse {
  nextLap: number;
  canScore: boolean;
  currentLap: number;
  incompleteSections: string[];
}

export async function getNextLap(competitorId: number, sectionId: number): Promise<NextLapResponse> {
  const res = await fetch(`${API_BASE}/scores/next-lap/${competitorId}/${sectionId}`);
  if (!res.ok) throw new Error('Failed to fetch next lap');
  return res.json();
}

export async function createScore(data: {
  competitor_id: number;
  section_id: number;
  points?: number;
  is_dnf?: boolean;
}): Promise<Score> {
  const res = await fetch(`${API_BASE}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create score');
  }
  return res.json();
}

export async function updateScore(id: number, data: {
  points?: number;
  is_dnf?: boolean;
}): Promise<Score> {
  const res = await fetch(`${API_BASE}/scores/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to update score');
  return res.json();
}

export async function deleteScore(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/scores/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete score');
}

export async function deleteAllScores(): Promise<void> {
  const res = await fetch(`${API_BASE}/scores/all`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete all scores');
}

// Leaderboard
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/scores/leaderboard`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

// Settings
export async function getSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

// Auth
export async function verifyPin(pin: string, role: 'manager' | 'judge'): Promise<{ valid: boolean }> {
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, role })
  });
  return res.json();
}

export async function getAuthRequired(): Promise<{ manager: boolean; judge: boolean }> {
  const res = await fetch(`${API_BASE}/auth/required`);
  if (!res.ok) throw new Error('Failed to check auth');
  return res.json();
}

// Export
export function getExportEventUrl(): string {
  return `${API_BASE}/export/event`;
}

export function getExportCsvUrl(): string {
  return `${API_BASE}/export/csv`;
}

export async function importEvent(file: File): Promise<{ success: boolean; imported: { competitors: number; scores: number; photos: number } }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/export/event`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Import failed');
  }
  return res.json();
}
