import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {createAskMapHandler} from './ask-map.js';
import {loadTrafficRows} from './traffic-analysis.js';

dotenv.config();

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const csvPath = path.join(projectRoot, 'public', 'data', 'aadf_2000_2025_clean.csv');
const trafficRows = loadTrafficRows(csvPath);
const app = express();

app.disable('x-powered-by');
app.use(express.json({limit: '1mb'}));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    records: trafficRows.length,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim())
  });
});

app.post('/api/ask-map', createAskMapHandler(trafficRows));

const port = Number(process.env.PORT) || 3001;
app.listen(port, '127.0.0.1', () => {
  console.log(`Traffic AI API listening at http://127.0.0.1:${port}`);
  console.log(process.env.OPENAI_API_KEY ? 'OpenAI mode enabled.' : 'Data-only mode enabled (no API key yet).');
});

