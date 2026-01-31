import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use /app/data for Railway volume, otherwise local data.json
const dataDir = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, '..');
const dbPath = path.join(dataDir, 'data.json');
console.log('Database path:', dbPath);

// Default database structure
const defaultDb = {
  competitors: [],
  sections: [],
  scores: [],
  settings: {
    id: 1,
    event_name: 'Moto Trial Event',
    event_date: null,
    email_backup_address: null,
    email_backup_enabled: 0
  },
  nextIds: {
    competitor: 1,
    score: 1
  }
};

// Load or create database
function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
  return { ...defaultDb };
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let db = loadDb();

export function initDb() {
  // Initialize sections if not exist or add missing types
  const hasKidsSections = db.sections.some(s => s.type === 'kids');
  
  if (db.sections.length === 0) {
    let id = 1;
    // Main sections 1-6 (for Clubman/Advanced)
    for (let i = 1; i <= 6; i++) {
      db.sections.push({ id: id++, name: `Section ${i}`, type: 'main', section_order: i });
    }
    // Kids sections 1-3
    for (let i = 1; i <= 3; i++) {
      db.sections.push({ id: id++, name: `Kids ${i}`, type: 'kids', section_order: i });
    }
    // Enduro sections 1-2
    for (let i = 1; i <= 2; i++) {
      db.sections.push({ id: id++, name: `Enduro ${i}`, type: 'enduro', section_order: i });
    }
    saveDb(db);
  } else if (!hasKidsSections) {
    // Add kids sections if they don't exist
    const maxId = Math.max(...db.sections.map(s => s.id));
    for (let i = 1; i <= 3; i++) {
      db.sections.push({ id: maxId + i, name: `Kids ${i}`, type: 'kids', section_order: i });
    }
    saveDb(db);
  }
  console.log('Database initialized');
}

// Competitor queries
export function getCompetitors() {
  return [...db.competitors].sort((a, b) => a.number - b.number);
}

export function getCompetitor(id) {
  return db.competitors.find(c => c.id === parseInt(id));
}

export function createCompetitor(data) {
  const id = db.nextIds.competitor++;
  const competitor = {
    id,
    number: data.number,
    name: data.name,
    primary_class: data.primary_class,
    enduro_trial: data.enduro_trial,
    photo_url: data.photo_url,
    created_at: new Date().toISOString()
  };
  
  // Check for duplicate number
  if (db.competitors.some(c => c.number === competitor.number)) {
    throw new Error('Competitor number already exists');
  }
  
  db.competitors.push(competitor);
  saveDb(db);
  return competitor;
}

export function updateCompetitor(id, data) {
  const index = db.competitors.findIndex(c => c.id === parseInt(id));
  if (index === -1) throw new Error('Competitor not found');
  
  // Check for duplicate number (excluding current)
  if (db.competitors.some(c => c.number === data.number && c.id !== parseInt(id))) {
    throw new Error('Competitor number already exists');
  }
  
  db.competitors[index] = {
    ...db.competitors[index],
    number: data.number,
    name: data.name,
    primary_class: data.primary_class,
    enduro_trial: data.enduro_trial,
    photo_url: data.photo_url || db.competitors[index].photo_url
  };
  saveDb(db);
  return db.competitors[index];
}

export function deleteCompetitor(id) {
  const numId = parseInt(id);
  db.scores = db.scores.filter(s => s.competitor_id !== numId);
  db.competitors = db.competitors.filter(c => c.id !== numId);
  saveDb(db);
}

// Section queries
export function getSections() {
  return [...db.sections].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'main' ? -1 : 1;
    return a.section_order - b.section_order;
  });
}

export function getSection(id) {
  return db.sections.find(s => s.id === parseInt(id));
}

// Score queries
export function getScores() {
  return db.scores.map(s => {
    const competitor = getCompetitor(s.competitor_id);
    const section = getSection(s.section_id);
    return {
      ...s,
      competitor_name: competitor?.name,
      competitor_number: competitor?.number,
      section_name: section?.name,
      section_type: section?.type
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getScoresBySection(sectionId) {
  const numId = parseInt(sectionId);
  return db.scores
    .filter(s => s.section_id === numId)
    .map(s => {
      const competitor = getCompetitor(s.competitor_id);
      const section = getSection(s.section_id);
      return {
        ...s,
        competitor_name: competitor?.name,
        competitor_number: competitor?.number,
        photo_url: competitor?.photo_url,
        section_name: section?.name
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getScoresByCompetitor(competitorId) {
  const numId = parseInt(competitorId);
  return db.scores
    .filter(s => s.competitor_id === numId)
    .map(s => {
      const section = getSection(s.section_id);
      return {
        ...s,
        section_name: section?.name,
        section_type: section?.type,
        section_order: section?.section_order
      };
    })
    .sort((a, b) => {
      if (a.section_type !== b.section_type) return a.section_type === 'main' ? -1 : 1;
      if (a.section_order !== b.section_order) return a.section_order - b.section_order;
      return a.lap - b.lap;
    });
}

export function getNextLap(competitorId, sectionId) {
  const numCompId = parseInt(competitorId);
  const numSecId = parseInt(sectionId);
  const scores = db.scores.filter(
    s => s.competitor_id === numCompId && s.section_id === numSecId
  );
  const maxLap = scores.reduce((max, s) => Math.max(max, s.lap), 0);
  return maxLap + 1;
}

// Check if a competitor can start a new lap
// Rule: must complete ALL sections of the same type in current lap before starting next lap
// Lap tracking is SEPARATE for: main sections, kids sections, and enduro sections
export function canStartNewLap(competitorId, sectionId) {
  const numCompId = parseInt(competitorId);
  const numSecId = sectionId ? parseInt(sectionId) : null;
  const competitor = getCompetitor(numCompId);
  if (!competitor) return { canScore: true, currentLap: 1, incompleteSections: [] };
  
  // Determine required sections based on the section being scored
  const allSections = getSections();
  const currentSection = numSecId ? getSection(numSecId) : null;
  let requiredSections;
  
  // If scoring an enduro section, only check enduro sections
  if (currentSection?.type === 'enduro') {
    requiredSections = allSections.filter(s => s.type === 'enduro');
  }
  // If scoring a kids section, only check kids sections
  else if (currentSection?.type === 'kids') {
    requiredSections = allSections.filter(s => s.type === 'kids');
  }
  // For main sections (or if no section specified), check based on primary class
  else if (competitor.primary_class === 'kids') {
    requiredSections = allSections.filter(s => s.type === 'kids');
  } else {
    requiredSections = allSections.filter(s => s.type === 'main');
  }
  
  // Get all scores for this competitor at required sections
  const competitorScores = db.scores.filter(s => 
    s.competitor_id === numCompId && 
    requiredSections.some(rs => rs.id === s.section_id)
  );
  
  // Find the maximum lap number at any required section
  let maxLap = 0;
  for (const section of requiredSections) {
    const sectionScores = competitorScores.filter(s => s.section_id === section.id);
    const sectionMaxLap = sectionScores.reduce((max, s) => Math.max(max, s.lap), 0);
    maxLap = Math.max(maxLap, sectionMaxLap);
  }
  
  if (maxLap === 0) {
    // No scores yet, can start lap 1
    return { canScore: true, currentLap: 1, incompleteSections: [] };
  }
  
  // Check if all required sections are completed for maxLap
  const incompleteSections = [];
  for (const section of requiredSections) {
    const sectionScore = competitorScores.find(
      s => s.section_id === section.id && s.lap === maxLap
    );
    if (!sectionScore) {
      incompleteSections.push(section.name);
    }
  }
  
  return {
    canScore: incompleteSections.length === 0,
    currentLap: maxLap,
    incompleteSections
  };
}

export function createScore(data) {
  const id = db.nextIds.score++;
  const score = {
    id,
    competitor_id: parseInt(data.competitor_id),
    section_id: parseInt(data.section_id),
    lap: data.lap,
    points: data.is_dnf ? null : data.points,
    is_dnf: data.is_dnf ? 1 : 0,
    created_at: new Date().toISOString(),
    updated_at: null
  };
  
  // Check for duplicate
  const exists = db.scores.some(
    s => s.competitor_id === score.competitor_id && 
         s.section_id === score.section_id && 
         s.lap === score.lap
  );
  if (exists) {
    throw new Error('Score already exists for this lap');
  }
  
  db.scores.push(score);
  saveDb(db);
  
  const competitor = getCompetitor(score.competitor_id);
  const section = getSection(score.section_id);
  return {
    ...score,
    competitor_name: competitor?.name,
    competitor_number: competitor?.number,
    competitor_class: competitor?.primary_class,
    competitor_enduro: competitor?.enduro_trial,
    section_name: section?.name,
    section_type: section?.type
  };
}

export function updateScore(id, data) {
  const numId = parseInt(id);
  const index = db.scores.findIndex(s => s.id === numId);
  if (index === -1) throw new Error('Score not found');
  
  db.scores[index] = {
    ...db.scores[index],
    points: data.is_dnf ? null : data.points,
    is_dnf: data.is_dnf ? 1 : 0,
    updated_at: new Date().toISOString()
  };
  saveDb(db);
  
  const score = db.scores[index];
  const competitor = getCompetitor(score.competitor_id);
  const section = getSection(score.section_id);
  return {
    ...score,
    competitor_name: competitor?.name,
    competitor_number: competitor?.number,
    competitor_class: competitor?.primary_class,
    competitor_enduro: competitor?.enduro_trial,
    section_name: section?.name,
    section_type: section?.type
  };
}

export function deleteScore(id) {
  db.scores = db.scores.filter(s => s.id !== parseInt(id));
  saveDb(db);
}

export function deleteAllScores() {
  db.scores = [];
  saveDb(db);
}

// Leaderboard query
export function getLeaderboard() {
  return db.competitors.map(c => {
    const competitorScores = db.scores.filter(s => s.competitor_id === c.id);
    
    let mainTotal = 0;
    let enduroTotal = 0;
    let mainSectionsDone = 0;
    let enduroSectionsDone = 0;
    let mainDnfCount = 0;
    let enduroDnfCount = 0;
    
    competitorScores.forEach(s => {
      const section = getSection(s.section_id);
      if (!section) return;
      
      // Main and kids sections count toward main total
      // (kids have separate sections but it's still their "main" competition)
      if (section.type === 'main' || section.type === 'kids') {
        mainSectionsDone++;
        if (s.is_dnf) {
          mainDnfCount++;
        } else if (s.points !== null) {
          mainTotal += s.points;
        }
      } else if (section.type === 'enduro') {
        enduroSectionsDone++;
        if (s.is_dnf) {
          enduroDnfCount++;
        } else if (s.points !== null) {
          enduroTotal += s.points;
        }
      }
    });
    
    return {
      ...c,
      main_total: mainTotal,
      enduro_total: enduroTotal,
      main_sections_done: mainSectionsDone,
      enduro_sections_done: enduroSectionsDone,
      main_dnf_count: mainDnfCount,
      enduro_dnf_count: enduroDnfCount
    };
  });
}

// Settings queries
export function getSettings() {
  return db.settings;
}

export function updateSettings(data) {
  db.settings = {
    ...db.settings,
    event_name: data.event_name,
    event_date: data.event_date,
    email_backup_address: data.email_backup_address,
    email_backup_enabled: data.email_backup_enabled
  };
  saveDb(db);
  return db.settings;
}

// Import data from JSON backup
export function importData({ settings, competitors, scores }) {
  // Update settings if provided
  if (settings) {
    db.settings = {
      ...db.settings,
      event_name: settings.event_name || db.settings.event_name,
      event_date: settings.event_date || db.settings.event_date,
      email_backup_address: settings.email_backup_address,
      email_backup_enabled: settings.email_backup_enabled
    };
  }
  
  // Replace competitors
  if (competitors && Array.isArray(competitors)) {
    db.competitors = competitors;
  }
  
  // Replace scores
  if (scores && Array.isArray(scores)) {
    db.scores = scores;
  }
  
  saveDb(db);
  
  return {
    competitors: db.competitors.length,
    scores: db.scores.length
  };
}

export default db;
