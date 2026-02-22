export interface Competitor {
  id: number;
  number: number;
  name: string;
  classes: string[];
  photo_url: string | null;
  created_at: string;
}

export interface Section {
  id: number;
  name: string;
}

export interface ClassConfig {
  id: string;
  name: string;
  laps: number;
  section_ids: number[];
  color: string;
}

export interface Score {
  id: number;
  competitor_id: number;
  section_id: number;
  lap: number;
  points: number | null;
  is_dnf: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface ScoreWithDetails extends Score {
  competitor_name: string;
  competitor_number: number;
  section_name: string;
}

export interface Settings {
  event_name: string;
  event_date: string;
  sections: Section[];
  classes: ClassConfig[];
}

export interface Standings {
  competitor: Competitor;
  total_points: number;
  sections_completed: number;
  scores: Score[];
}
