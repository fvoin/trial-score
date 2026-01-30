// Google Sheets backup via Apps Script webhook
// Set GOOGLE_SHEET_WEBHOOK_URL in environment variables

export async function sendScoreToSheet(score) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  
  if (!webhookUrl) {
    // Silently skip if not configured
    return null;
  }
  
  console.log('Sending score to Google Sheet...');

  // Determine class label for the sheet
  let classLabel = score.competitor_class || 'unknown';
  if (score.section_type === 'enduro') {
    classLabel = 'enduro-trial';
  }
  
  const data = {
    competitor_number: score.competitor_number,
    competitor_name: score.competitor_name,
    section_name: score.section_name,
    lap: score.lap,
    points: score.points,
    is_dnf: score.is_dnf ? true : false,
    created_at: score.created_at,
    competitor_class: classLabel
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
