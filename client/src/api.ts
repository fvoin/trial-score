const API_BASE = '/api';

// Types
export interface Competitor {
  id: number;
  number: number;
  name: string;
  primary_class: 'kids' | 'clubman' | 'advanced';
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

export async function getNextLap(competitorId: number, sectionId: number): Promise<number> {
  const res = await fetch(`${API_BASE}/scores/next-lap/${competitorId}/${sectionId}`);
  if (!res.ok) throw new Error('Failed to fetch next lap');
  const data = await res.json();
  return data.nextLap;
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
