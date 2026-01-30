import nodemailer from 'nodemailer';
import { getSettings } from './db.js';

// Create transporter - configure with your SMTP settings
// For production, use environment variables
let transporter = null;

function getTransporter() {
  if (!transporter) {
    // Default to a test account or configure via env vars
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

export async function sendScoreEmail(score) {
  const settings = getSettings();
  
  console.log('Email check:', {
    email_backup_enabled: settings.email_backup_enabled,
    email_backup_address: settings.email_backup_address,
    smtp_user_set: !!process.env.SMTP_USER,
    smtp_pass_set: !!process.env.SMTP_PASS
  });
  
  if (!settings.email_backup_enabled || !settings.email_backup_address) {
    console.log('Email skipped: backup not enabled or no address');
    return null;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('Email skipped: SMTP credentials not configured');
    return null;
  }
  
  console.log('Sending email to:', settings.email_backup_address);

  const pointsDisplay = score.is_dnf ? 'DNF' : score.points;
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: settings.email_backup_address,
    subject: `[Trial Score] ${score.competitor_name} - ${score.section_name} Lap ${score.lap}`,
    text: `
Score Entry:
------------
Competitor: #${score.competitor_number} ${score.competitor_name}
Section: ${score.section_name}
Lap: ${score.lap}
Points: ${pointsDisplay}
Time: ${score.created_at}
${score.updated_at ? `Updated: ${score.updated_at}` : ''}
    `.trim(),
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
    const result = await getTransporter().sendMail(mailOptions);
    console.log('Score email sent:', result.messageId);
    return result;
  } catch (error) {
    console.error('Failed to send score email:', error.message);
    return null;
  }
}
