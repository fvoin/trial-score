import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, '..');
const dbPath = path.join(dataDir, 'data.json');
console.log('Database path:', dbPath);

const defaultDb = {
  competitors: [],
  scores: [],
  settings: {
    id: 1,
    event_name: 'Moto Trial Event',
    event_date: null,
    sections: [],
    classes: []
  },
  nextIds: {
    competitor: 1,
    score: 1,
    section: 1,
    class: 1
  }
};

function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      return migrateIfNeeded(data);
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
  return JSON.parse(JSON.stringify(defaultDb));
}

function migrateIfNeeded(data) {
  const hasOldSections = Array.isArray(data.sections) && data.sections.length > 0 && data.sections[0]?.type;
  const hasOldCompetitors = data.competitors?.length > 0 && data.competitors[0]?.primary_class !== undefined;

  if (!hasOldSections && !hasOldCompetitors) return data;

  console.log('Migrating database to dynamic classes format...');

  if (!data.settings) data.settings = {};
  if (!data.nextIds) data.nextIds = {};

  // Migrate sections from db.sections to settings.sections
  if (hasOldSections) {
    const oldSections = data.sections;
    data.settings.sections = oldSections.map(s => ({ id: s.id, name: s.name }));

    const mainIds = oldSections.filter(s => s.type === 'main').map(s => s.id);
    const kidsIds = oldSections.filter(s => s.type === 'kids').map(s => s.id);
    const enduroIds = oldSections.filter(s => s.type === 'enduro').map(s => s.id);

    const classes = [];
    if (mainIds.length > 0) {
      classes.push({ id: 'cls_advanced', name: 'Advanced', laps: 3, section_ids: [...mainIds], color: '#ef4444' });
      classes.push({ id: 'cls_clubman', name: 'Clubman', laps: 3, section_ids: [...mainIds], color: '#10b981' });
    }
    if (kidsIds.length > 0) {
      classes.push({ id: 'cls_kids', name: 'Kids', laps: 3, section_ids: kidsIds, color: '#facc15' });
    }
    if (enduroIds.length > 0) {
      classes.push({ id: 'cls_enduro', name: 'Enduro Trial', laps: 3, section_ids: enduroIds, color: '#9ca3af' });
    }
    data.settings.classes = classes;

    const maxSecId = Math.max(0, ...oldSections.map(s => s.id));
    data.nextIds.section = maxSecId + 1;
    data.nextIds.class = 1;
    delete data.sections;
  }

  // Migrate competitors
  if (hasOldCompetitors) {
    data.competitors = data.competitors.map(c => {
      const newClasses = [];
      if (c.primary_class === 'kids') newClasses.push('cls_kids');
      else if (c.primary_class === 'clubman') newClasses.push('cls_clubman');
      else if (c.primary_class === 'advanced') newClasses.push('cls_advanced');
      else if (c.primary_class === 'enduro-trial') newClasses.push('cls_enduro');

      if (c.enduro_trial === 1 && !newClasses.includes('cls_enduro')) {
        newClasses.push('cls_enduro');
      }

      const { primary_class, enduro_trial, ...rest } = c;
      return { ...rest, classes: newClasses };
    });
  }

  saveDb(data);
  console.log('Migration complete.');
  return data;
}

function saveDb(database) {
  fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
}

let db = loadDb();

export function initDb() {
  if (!db.settings.sections) db.settings.sections = [];
  if (!db.settings.classes) db.settings.classes = [];
  if (!db.nextIds.section) db.nextIds.section = 1;
  if (!db.nextIds.class) db.nextIds.class = 1;

  if (db.settings.sections.length === 0 && db.settings.classes.length === 0) {
    const sections = [];
    let sid = 1;
    for (let i = 1; i <= 6; i++) sections.push({ id: sid++, name: `Section ${i}` });
    for (let i = 1; i <= 3; i++) sections.push({ id: sid++, name: `Kids ${i}` });

    db.settings.sections = sections;
    db.nextIds.section = sid;

    db.settings.classes = [
      { id: 'cls_1', name: 'Advanced', laps: 3, section_ids: [1,2,3,4,5,6], color: '#ef4444' },
      { id: 'cls_2', name: 'Clubman', laps: 3, section_ids: [1,2,3,4,5,6], color: '#10b981' },
      { id: 'cls_3', name: 'Kids', laps: 3, section_ids: [7,8,9], color: '#facc15' },
    ];
    db.nextIds.class = 4;

    saveDb(db);
  }

  // Remove legacy db.sections if it still exists
  if (db.sections) {
    delete db.sections;
    saveDb(db);
  }

  console.log('Database initialized');
}

// --- Competitors ---

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
    classes: Array.isArray(data.classes) ? data.classes : [],
    photo_url: data.photo_url,
    created_at: new Date().toISOString()
  };

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

  if (db.competitors.some(c => c.number === data.number && c.id !== parseInt(id))) {
    throw new Error('Competitor number already exists');
  }

  db.competitors[index] = {
    ...db.competitors[index],
    number: data.number,
    name: data.name,
    classes: Array.isArray(data.classes) ? data.classes : db.competitors[index].classes,
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

// --- Sections (from settings) ---

export function getSections() {
  return db.settings.sections || [];
}

export function getSection(id) {
  return (db.settings.sections || []).find(s => s.id === parseInt(id));
}

// --- Classes (from settings) ---

export function getClasses() {
  return db.settings.classes || [];
}

// --- Scores ---

export function getScores() {
  return db.scores.map(s => {
    const competitor = getCompetitor(s.competitor_id);
    const section = getSection(s.section_id);
    return {
      ...s,
      competitor_name: competitor?.name,
      competitor_number: competitor?.number,
      section_name: section?.name
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
        section_name: section?.name
      };
    })
    .sort((a, b) => {
      if (a.section_id !== b.section_id) return a.section_id - b.section_id;
      return a.lap - b.lap;
    });
}

export function getNextLap(competitorId, sectionId) {
  const numCompId = parseInt(competitorId);
  const numSecId = parseInt(sectionId);
  const scores = db.scores.filter(
    s => s.competitor_id === numCompId && s.section_id === numSecId
  );
  return scores.reduce((max, s) => Math.max(max, s.lap), 0) + 1;
}

// Lap restriction: per-class. Must complete all sections of the relevant class(es)
// in the current lap before advancing.
export function canStartNewLap(competitorId, sectionId) {
  const numCompId = parseInt(competitorId);
  const numSecId = sectionId ? parseInt(sectionId) : null;
  const competitor = getCompetitor(numCompId);
  if (!competitor) return { canScore: true, currentLap: 1, incompleteSections: [], maxLap: 3 };

  const classes = getClasses();
  const competitorClasses = competitor.classes || [];

  // Find classes this competitor is in that include the target section
  const relevantClasses = classes.filter(cls =>
    competitorClasses.includes(cls.id) && cls.section_ids.includes(numSecId)
  );

  if (relevantClasses.length === 0) {
    return { canScore: true, currentLap: 1, incompleteSections: [], maxLap: 3 };
  }

  // Check each relevant class; all must allow advancement
  let worstIncompleteSections = [];
  let currentLap = 1;
  let maxAllowedLap = Math.max(...relevantClasses.map(cls => cls.laps));

  for (const cls of relevantClasses) {
    const classSectionIds = cls.section_ids;

    const competitorScores = db.scores.filter(s =>
      s.competitor_id === numCompId && classSectionIds.includes(s.section_id)
    );

    let classMaxLap = 0;
    for (const secId of classSectionIds) {
      const secScores = competitorScores.filter(s => s.section_id === secId);
      const secMaxLap = secScores.reduce((max, s) => Math.max(max, s.lap), 0);
      classMaxLap = Math.max(classMaxLap, secMaxLap);
    }

    if (classMaxLap === 0) continue;

    currentLap = Math.max(currentLap, classMaxLap);

    const sections = getSections();
    for (const secId of classSectionIds) {
      const hasScore = competitorScores.some(s => s.section_id === secId && s.lap === classMaxLap);
      if (!hasScore) {
        const sec = sections.find(s => s.id === secId);
        if (sec && !worstIncompleteSections.includes(sec.name)) {
          worstIncompleteSections.push(sec.name);
        }
      }
    }
  }

  return {
    canScore: worstIncompleteSections.length === 0,
    currentLap,
    incompleteSections: worstIncompleteSections,
    maxLap: maxAllowedLap
  };
}

export function createScore(data) {
  const id = db.nextIds.score++;
  const score = {
    id,
    competitor_id: parseInt(data.competitor_id),
    section_id: parseInt(data.section_id),
    lap: data.lap,
    points: data.points,
    is_dnf: data.is_dnf ? 1 : 0,
    created_at: new Date().toISOString(),
    updated_at: null
  };

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
    competitor_classes: competitor?.classes || [],
    section_name: section?.name
  };
}

export function updateScore(id, data) {
  const numId = parseInt(id);
  const index = db.scores.findIndex(s => s.id === numId);
  if (index === -1) throw new Error('Score not found');

  db.scores[index] = {
    ...db.scores[index],
    points: data.points,
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
    competitor_classes: competitor?.classes || [],
    section_name: section?.name
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

export function deleteAllData() {
  db.competitors = [];
  db.scores = [];
  saveDb(db);
}

// --- Leaderboard ---

export function getLeaderboard() {
  const classes = getClasses();
  const sections = getSections();

  return db.competitors.map(c => {
    const competitorScores = db.scores.filter(s => s.competitor_id === c.id);
    const classTotals = {};

    for (const cls of classes) {
      if (!(c.classes || []).includes(cls.id)) continue;

      let total = 0;
      let sectionsDone = 0;
      let dnfCount = 0;
      let lastScoredAt = '';

      for (const s of competitorScores) {
        if (!cls.section_ids.includes(s.section_id)) continue;
        sectionsDone++;
        if (s.is_dnf) dnfCount++;
        if (s.points !== null) total += s.points;
        if (s.created_at > lastScoredAt) lastScoredAt = s.created_at;
      }

      classTotals[cls.id] = { total, sections_done: sectionsDone, dnf_count: dnfCount, last_scored_at: lastScoredAt };
    }

    return { ...c, class_totals: classTotals };
  });
}

// --- Settings ---

export function getSettings() {
  return db.settings;
}

export function updateSettings(data) {
  db.settings = {
    ...db.settings,
    event_name: data.event_name ?? db.settings.event_name,
    event_date: data.event_date ?? db.settings.event_date,
  };

  if (data.sections !== undefined) {
    db.settings.sections = data.sections;
    const maxId = data.sections.reduce((m, s) => Math.max(m, s.id), 0);
    db.nextIds.section = maxId + 1;
  }

  if (data.classes !== undefined) {
    db.settings.classes = data.classes;
  }

  saveDb(db);
  return db.settings;
}

// --- Import ---

export function importData({ settings, competitors, scores }) {
  if (settings) {
    db.settings = {
      ...db.settings,
      event_name: settings.event_name || db.settings.event_name,
      event_date: settings.event_date || db.settings.event_date,
    };
    if (settings.sections) db.settings.sections = settings.sections;
    if (settings.classes) db.settings.classes = settings.classes;
  }

  if (competitors && Array.isArray(competitors)) {
    db.competitors = competitors;
  }

  if (scores && Array.isArray(scores)) {
    db.scores = scores;
  }

  // Recalculate nextIds
  db.nextIds.competitor = db.competitors.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  db.nextIds.score = db.scores.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  if (db.settings.sections) {
    db.nextIds.section = db.settings.sections.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  }

  saveDb(db);

  return {
    competitors: db.competitors.length,
    scores: db.scores.length
  };
}

export default db;
