import { getSettings } from './db.js';

// Use Resend HTTP API (works on cloud platforms that block SMTP)
// Set RESEND_API_KEY in environment variables
// Get your API key from https://resend.com

export async function sendScoreEmail(score) {
  const settings = getSettings();
  
  console.log('Email check:', {
    email_backup_enabled: settings.email_backup_enabled,
    email_backup_address: settings.email_backup_address,
    resend_key_set: !!process.env.RESEND_API_KEY
  });
  
  if (!settings.email_backup_enabled || !settings.email_backup_address) {
    console.log('Email skipped: backup not enabled or no address');
    return null;
  }

  if (!process.env.RESEND_API_KEY) {
    console.log('Email skipped: RESEND_API_KEY not configured');
    return null;
  }
  
  console.log('Sending email to:', settings.email_backup_address);

  const pointsDisplay = score.is_dnf ? 'DNF' : score.points;
  
  const emailData = {
    from: 'Trial Score <onboarding@resend.dev>',
    to: settings.email_backup_address,
    subject: `[Trial Score] ${score.competitor_name} - ${score.section_name} Lap ${score.lap}`,
    html: `
      <h2>Score Entry</h2>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 8px; font-weight: bold;">Competitor:</td><td style="padding: 4px 8px;">#${score.competitor_number} ${score.competitor_name}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: bold;">Section:</td><td style="padding: 4px 8px;">${score.section_name}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: bold;">Lap:</td><td style="padding: 4px 8px;">${score.lap}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: bold;">Points:</td><td style="padding: 4px 8px; font-size: 18px; font-weight: bold;">${pointsDisplay}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: bold;">Time:</td><td style="padding: 4px 8px;">${score.created_at}</td></tr>
        ${score.updated_at ? `<tr><td style="padding: 4px 8px; font-weight: bold;">Updated:</td><td style="padding: 4px 8px;">${score.updated_at}</td></tr>` : ''}
      </table>
    `
  };

  try {
    console.log('Sending via Resend API...');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Resend API error:', result);
      return null;
    }
    
    console.log('Score email sent:', result.id);
    return result;
  } catch (error) {
    console.error('Failed to send score email:', error.message);
    return null;
  }
}
