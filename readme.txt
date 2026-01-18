# Moto Trials Scoring App

## Overview

A web-based scoring application for motorcycle trials competitions. The app provides separate interfaces for event managers, judges, and a public live scoreboard display.

---

## Competition Format

### Main Competition
- **Classes:** Kids, Clubman, Advanced
- **Sections:** 6 sections
- **Laps:** 3 laps per competitor
- **Scoring:** 0, 1, 2, 3, 5, or DNF per section attempt
- **Total attempts:** 18 per competitor (6 sections × 3 laps)

### Enduro Trial (Additional Class)
- **Sections:** 2 sections (separate from main 6)
- **Laps:** 3 laps per competitor
- **Total attempts:** 6 per competitor (2 sections × 3 laps)
- **Eligibility:** Any rider from Kids, Clubman, or Advanced can additionally register for Enduro Trial
- **Scoring:** Same as main competition (0, 1, 2, 3, 5, DNF)

Note: A competitor may have TWO class assignments - their main class AND optionally Enduro Trial.

---

## User Roles & Interfaces

### 1. Manager Interface (Registration)

Purpose: Register and manage competitors before and during the event.

Features:
- Add new competitor (name, number, contact info)
- Assign primary class (Kids, Clubman, or Advanced)
- Optionally add to Enduro Trial class
- Capture or upload competitor photo
- View list of all registered competitors
- Edit competitor details
- Delete competitor (with confirmation)

### 2. Judge Interface (Scoring)

Purpose: Enter scores as competitors complete sections.

Features:
- Select section (Main 1-6, or Enduro 1-2)
- See list of ALL competitors (filtered by section type)
- Enter score for competitor (0, 1, 2, 3, 5, or DNF)
- System tracks which lap this is for each competitor at this section
- View all scores entered at this section
- Edit/correct any score (with timestamp of correction)
- See competitor photo to verify identity

### 3. Live Display (Public Scoreboard)

Purpose: Show real-time standings on a large screen at the event venue.

Features:
- Leaderboard grouped by class (Kids, Clubman, Advanced, Enduro Trial)
- Shows competitor photo, number, name
- Shows total score (lower is better in trials)
- Shows sections completed count
- Auto-updates in real-time via WebSocket
- Highlights recent score entries
- Clean, readable from distance

---

## Technical Architecture

### Deployment
- Cloud-hosted (accessible from any device with internet)
- No authentication required (trusted devices on event network)

### Backend
- REST API for all data operations
- WebSocket server for real-time updates to display
- Database for persistent storage
- Photo upload and storage

### Frontend
- Three separate single-page applications:
  - /manager - Registration interface
  - /judge - Scoring interface  
  - /display - Live scoreboard

### Email Backup
- Sends email after EACH score entry
- Provides real-time redundancy and audit trail
- Configurable email recipient per event
- Email includes: competitor, section, lap, score, timestamp

---

## Technology Stack

- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** SQLite (simple file-based, easy backup)
- **Real-time:** Socket.io
- **Email:** Nodemailer
- **Hosting:** Railway or Render (single service)

---

## Project Structure (Simplified)

```
trial_score/
├── server/
│   ├── index.js          # Express + Socket.io server entry
│   ├── db.js             # SQLite database setup & queries
│   ├── routes/
│   │   ├── competitors.js
│   │   ├── scores.js
│   │   └── settings.js
│   ├── email.js          # Email sending logic
│   └── socket.js         # WebSocket event handlers
│
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Manager.tsx
│   │   │   ├── Judge.tsx
│   │   │   └── Display.tsx
│   │   ├── components/   # Shared UI components
│   │   ├── api.ts        # API client functions
│   │   ├── socket.ts     # Socket.io client
│   │   └── App.tsx       # Router setup
│   └── index.html
│
├── uploads/              # Competitor photos
├── data.db               # SQLite database file
├── package.json
└── readme.txt
```

### Design Principles
- Single `package.json` at root (monorepo-lite)
- Express serves both API and built React app
- SQLite = zero database setup, single file backup
- Minimal folders, flat where possible
- No ORMs - simple SQL queries

---

## Data Models

### Competitor
- id (auto-generated)
- number (bib number)
- name
- primary_class (Kids | Clubman | Advanced)
- enduro_trial (boolean - also competing in Enduro Trial)
- photo_url
- created_at

### Section
- id
- name (e.g., "Section 1", "Rock Garden", etc.)
- type (main | enduro)
- order (1-6 for main, 1-2 for enduro)

### Score
- id
- competitor_id
- section_id
- lap (1, 2, or 3)
- points (0, 1, 2, 3, 5, or null for DNF)
- is_dnf (boolean)
- judge_device_id (optional, for tracking)
- created_at
- updated_at (if corrected)
- email_sent (boolean)

### Event Settings
- event_name
- event_date
- email_backup_address
- email_backup_enabled (boolean)

---

## Scoring Rules

- Lower total score is better
- 0 = Clean (no mistakes)
- 1 = One dab (foot touch)
- 2 = Two dabs
- 3 = Three or more dabs
- 5 = Failure (stopped, went out of bounds, etc.)
- DNF = Did Not Finish (competitor did not attempt or complete)

---

## User Flows

### Manager Flow
1. Open /manager on tablet/laptop
2. Click "Add Competitor"
3. Enter number, name, select primary class (Kids/Clubman/Advanced)
4. Check "Also competing in Enduro Trial" if applicable
5. Take photo or upload from gallery
6. Save competitor
7. Repeat for all competitors

### Judge Flow
1. Open /judge on phone/tablet
2. Select section (Main 1-6 or Enduro 1-2)
3. See all eligible competitors for that section type
4. When competitor finishes, find them in list (by number or name)
5. Tap to enter score (0, 1, 2, 3, 5, or DNF)
6. Score saved immediately, email sent automatically
7. Can view "All Scores" to see history and make corrections

### Display Flow
1. Open /display on large screen/TV
2. Scoreboard auto-loads and updates
3. No interaction needed
4. Shows live standings as scores come in
5. Toggle between classes or show all

---

## Section Configuration

### Main Competition Sections (1-6)
- All Kids, Clubman, Advanced competitors ride these
- Judge selects "Main Section 1" through "Main Section 6"

### Enduro Trial Sections (1-2)
- Only competitors with enduro_trial=true ride these
- Judge selects "Enduro Section 1" or "Enduro Section 2"
- Scored separately, shown in separate leaderboard

---

## Running the App

### Development

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Run both server and client
npm run dev
```

- Backend runs on http://localhost:3000
- Frontend runs on http://localhost:5173

### Production

```bash
# Build the client
npm run build

# Start the server (serves built client)
npm start
```

### Environment Variables (for email backup)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## Future Considerations (Not in Initial Scope)

- Multiple events/competitions management
- Historical results archive
- Competitor self-registration
- SMS notifications to competitors
- Printable scorecards
- Offline mode with sync
