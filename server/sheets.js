// Google Sheets backup via Apps Script webhook

import { getClasses, getSection, getCompetitor } from './db.js';

export async function sendScoreToSheet(score) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  
  if (!webhookUrl) return null;
  
  console.log('Sending score to Google Sheet...');

  // Determine class labels for the sheet
  const classes = getClasses();
  const competitor = getCompetitor(score.competitor_id);
  const competitorClasses = competitor?.classes || [];
  const section = getSection(score.section_id);

  // Find classes that include this section AND the competitor is enrolled in
  const matchingClasses = classes.filter(cls =>
    competitorClasses.includes(cls.id) && cls.section_ids.includes(score.section_id)
  );
  const classLabel = matchingClasses.map(c => c.name).join(', ') || 'unknown';
  
  const data = {
    competitor_number: score.competitor_number || competitor?.number,
    competitor_name: score.competitor_name || competitor?.name,
    section_name: score.section_name || section?.name,
    lap: score.lap,
    points: score.points,
    is_dnf: score.is_dnf ? true : false,
    created_at: score.created_at,
    competitor_class: classLabel
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Google Sheet webhook error:', text);
      return null;
    }
    
    console.log('Score sent to Google Sheet');
    return { success: true };
  } catch (error) {
    console.error('Failed to send score to sheet:', error.message);
    return null;
  }
}
