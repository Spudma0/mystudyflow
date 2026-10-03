import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { timetableRouter } from './routes/timetable.js';
import { subjectRouter } from './routes/subject.js';
import { accountRouter } from './routes/account.js';
import { chemRouter } from './routes/chem.js';

const app = express();

app.use(cors());
// Base64 images are large — allow big request bodies.
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * The privacy policy is served from here so it has a public URL the moment the
 * backend is deployed — the App Store listing needs one, and this avoids
 * standing up separate hosting just to serve a single page.
 */
const publicDir = path.join(__dirname, '..', 'public');
app.get('/privacy', (_req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));

app.use('/api/timetable', timetableRouter);
app.use('/api/subject', subjectRouter);
app.use('/api/account', accountRouter);
app.use('/api/chem', chemRouter);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`MyStudyFlow backend listening on http://localhost:${port}`);
});
