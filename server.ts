import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import svgCaptcha from 'svg-captcha';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';

// --- Types & Interfaces ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const natural = require('natural') as typeof import('natural');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'darkscan_secret_key';
const DB_PATH = process.env.DB_PATH || 'darkscan.db';
const DATA_DIR = path.join(__dirname, 'data');

// --- Database Setup ---
const db = new Database(DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS threats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    platform TEXT,
    content TEXT,
    risk_score INTEGER,
    severity TEXT,
    prediction TEXT,
    links TEXT,
    is_false_positive INTEGER DEFAULT 0,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS monitoring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    keyword TEXT,
    interval_hours INTEGER,
    last_run DATETIME,
    status TEXT DEFAULT 'active',
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip_address TEXT,
    status TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Admin if not exists
const adminEmail = process.env.ADMIN_EMAIL || 'admin@darkscan.ai';
console.log(`[System] Admin Email configured as: ${adminEmail}`);

const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail) as any;
if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(adminEmail, hashedPassword, 'admin');
  console.log(`[System] Admin account seeded successfully: ${adminEmail}`);
}

// Seed initial threats if none exist
const threatCount = db.prepare('SELECT COUNT(*) as count FROM threats').get() as any;
if (threatCount.count === 0) {
  const adminId = existingAdmin ? existingAdmin.id : 1;
  const initialThreats = [
    {
      platform: 'http://malware-test.darkscan.ai',
      content: 'Phishing page detected targeting banking credentials. Contains obfuscated javascript and credential harvesting forms.',
      risk_score: 95,
      severity: 'HIGH',
      prediction: 'Threat',
      links: JSON.stringify(['http://bank-secure-login.bit.ly/login', 'http://192.168.1.100/payload.exe'])
    },
    {
      platform: 'Telegram @DarkMarket_Leaks',
      content: 'Database dump from recent e-commerce breach. Contains 50k+ user records including emails and hashed passwords.',
      risk_score: 88,
      severity: 'HIGH',
      prediction: 'Threat',
      links: JSON.stringify(['https://mega.nz/file/leak_data_v1'])
    },
    {
      platform: 'http://crypto-scam-alert.com',
      content: 'Fake crypto wallet giveaway. Prompts users to enter their seed phrase to "verify" their account.',
      risk_score: 75,
      severity: 'HIGH',
      prediction: 'Threat',
      links: JSON.stringify(['http://wallet-connect-verify.io'])
    },
    {
      platform: 'Dark Web Forum: Dread',
      content: 'New exploit kit for CVE-2024-XXXX being sold for 2 BTC. Includes automated payload delivery system.',
      risk_score: 92,
      severity: 'HIGH',
      prediction: 'Threat',
      links: JSON.stringify(['http://dread_forum_onion_link/exploit-kit'])
    }
  ];

  const insertThreat = db.prepare(`
    INSERT INTO threats (user_id, platform, content, risk_score, severity, prediction, links)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  initialThreats.forEach(t => {
    insertThreat.run(adminId, t.platform, t.content, t.risk_score, t.severity, t.prediction, t.links);
  });
  console.log('[System] Initial threat data seeded.');
}

// --- AI Logic (Simplified TF-IDF + Keyword Analysis) ---
// In a real app, we'd use ml-random-forest, but for this demo we'll use a robust heuristic + keyword scoring
const THREAT_KEYWORDS = [
  'phishing', 'malware', 'exploit', 'hacked', 'leak', 'credential', 'scam', 
  'darkweb', 'onion', 'crypto', 'wallet', 'bypass', 'ransomware', 'trojan',
  'backdoor', 'spyware', 'botnet', 'ddos', 'injection', 'zero-day', 'vulnerability',
  'breach', 'dump', 'stealer', 'keylogger', 'rootkit', 'cve-2024', 'payload'
];

type TrainingSample = {
  text: string;
  label: 'threat' | 'safe';
};

type UrlTrainingSample = {
  value: string;
  label: 'threat' | 'safe';
};

type ThreatIntel = {
  maliciousDomains: string[];
  suspiciousTlds: string[];
  brandTargets: string[];
  suspiciousHostKeywords: string[];
  trustedDomains: string[];
};

function loadJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    console.error(`[System] Failed to parse ${fileName}:`, error);
    return fallback;
  }
}

function loadCsvTrainingFile(fileName: string): UrlTrainingSample[] {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];

  try {
    const [headerLine, ...rows] = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    if (!headerLine) return [];

    return rows.map((row): UrlTrainingSample => {
      const [value, label] = row.split(',').map(cell => cell.trim());
      return {
        value,
        label: label === 'threat' ? 'threat' : 'safe'
      };
    }).filter((sample): sample is UrlTrainingSample => Boolean(sample.value && sample.label));
  } catch (error) {
    console.error(`[System] Failed to parse ${fileName}:`, error);
    return [];
  }
}

const trainingSamples = loadJsonFile<TrainingSample[]>('threat-training-data.json', []);
const urlTrainingSamples = loadCsvTrainingFile('url-training-data.csv');
const threatIntel = loadJsonFile<ThreatIntel>('threat-intel.json', {
  maliciousDomains: [],
  suspiciousTlds: [],
  brandTargets: [],
  suspiciousHostKeywords: [],
  trustedDomains: []
});

const classifier = new natural.BayesClassifier();
const urlClassifier = new natural.BayesClassifier();
const tokenizer = new natural.WordTokenizer();

trainingSamples.forEach(sample => {
  classifier.addDocument(sample.text, sample.label);
});

urlTrainingSamples.forEach(sample => {
  urlClassifier.addDocument(sample.value.toLowerCase(), sample.label);
});

if (trainingSamples.length > 0) {
  classifier.train();
}

if (urlTrainingSamples.length > 0) {
  urlClassifier.train();
}

if (trainingSamples.length > 0 || urlTrainingSamples.length > 0) {
  console.log(
    `[AI] Trained local classifiers on ${trainingSamples.length} text samples and ${urlTrainingSamples.length} URL samples.`
  );
}

function extractHost(target: string) {
  try {
    return new URL(normalizeTarget(target)).hostname.toLowerCase();
  } catch {
    return target.trim().toLowerCase();
  }
}

function getThreatProbability(text: string, links: string[]) {
  if (trainingSamples.length === 0) return 0;

  const combinedText = tokenizer.tokenize(`${text} ${links.join(' ')}`.toLowerCase()).join(' ');
  const classifications = classifier.getClassifications(combinedText);
  const threatEntry = classifications.find((entry: any) => entry.label === 'threat');
  const total = classifications.reduce((sum: number, entry: any) => sum + entry.value, 0) || 1;
  return threatEntry ? threatEntry.value / total : 0;
}

function getUrlThreatProbability(targets: string[]) {
  if (urlTrainingSamples.length === 0 || targets.length === 0) return 0;

  const probabilities = targets.map(target => {
    const normalized = extractHost(target);
    const classifications = urlClassifier.getClassifications(normalized);
    const threatEntry = classifications.find((entry: any) => entry.label === 'threat');
    const total = classifications.reduce((sum: number, entry: any) => sum + entry.value, 0) || 1;
    return threatEntry ? threatEntry.value / total : 0;
  });

  return Math.max(...probabilities, 0);
}

function scoreThreatIntel(text: string, links: string[]) {
  const lowerText = text.toLowerCase();
  const normalizedLinks = links.map(normalizeTarget);
  const hosts = normalizedLinks.map(extractHost).filter(Boolean);
  let score = 0;

  const foundMaliciousDomain = hosts.some(host =>
    threatIntel.maliciousDomains.some(domain => host.includes(domain.toLowerCase()))
  );
  if (foundMaliciousDomain) score += 35;

  const foundSuspiciousHostKeyword = hosts.some(host =>
    threatIntel.suspiciousHostKeywords.some(keyword => host.includes(keyword.toLowerCase()))
  );
  if (foundSuspiciousHostKeyword) score += 20;

  const foundBrandTarget = hosts.some(host =>
    threatIntel.brandTargets.some(brand => host.includes(brand.toLowerCase()))
  ) && (
    hosts.some(host =>
      threatIntel.suspiciousHostKeywords.some(keyword => host.includes(keyword.toLowerCase()))
    ) ||
    lowerText.includes('verify') ||
    lowerText.includes('login')
  );
  if (foundBrandTarget) score += 15;

  const foundSuspiciousTld = hosts.some(host => {
    const segments = host.split('.');
    const tld = segments[segments.length - 1];
    return threatIntel.suspiciousTlds.some(item => item.toLowerCase() === tld);
  });
  if (foundSuspiciousTld) score += 15;

  const trustedHost = hosts.length > 0 && hosts.every(host =>
    threatIntel.trustedDomains.some(domain => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`))
  );
  if (trustedHost) score -= 10;

  return score;
}

function analyzeThreat(text: string, links: string[]) {
  let score = 0;
  const lowerText = text.toLowerCase();
  const normalizedLinks = links.map(normalizeTarget);
  
  THREAT_KEYWORDS.forEach(kw => {
    if (lowerText.includes(kw)) score += 15;
  });

  // Link analysis
  normalizedLinks.forEach(link => {
    if (link.includes('bit.ly') || link.includes('tinyurl') || link.includes('t.co')) score += 10;
    if (link.includes('hxxp') || link.includes('[.]')) score += 20;
    if (link.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) score += 15; // IP links
  });

  score += scoreThreatIntel(text, normalizedLinks);

  const threatProbability = getThreatProbability(text, normalizedLinks);
  score += Math.round(threatProbability * 40);

  const urlThreatProbability = getUrlThreatProbability(normalizedLinks);
  score += Math.round(urlThreatProbability * 25);

  score = Math.min(score, 100);
  
  let severity = 'LOW';
  if (score > 70) severity = 'HIGH';
  else if (score > 30) severity = 'MEDIUM';

  return {
    prediction: score > 30 ? 'Threat' : 'Safe',
    risk_score: score,
    severity
  };
}

function normalizeTarget(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function toIsoTimestamp(value: string | null | undefined) {
  if (!value) return value;
  if (value.includes('T')) return value;
  return `${value.replace(' ', 'T')}Z`;
}

function formatThreatRecord(threat: any) {
  if (!threat) return threat;
  return {
    ...threat,
    detected_at: toIsoTimestamp(threat.detected_at)
  };
}

function formatMonitoringTask(task: any) {
  if (!task) return task;
  return {
    ...task,
    last_run: toIsoTimestamp(task.last_run)
  };
}

// --- Scraper Logic ---
async function scrapeUrl(url: string) {
  try {
    const normalizedUrl = normalizeTarget(url);
    const response = await axios.get(normalizedUrl, { timeout: 5000 });
    const $ = cheerio.load(response.data);
    const links: string[] = [];
    
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });

    // Detect hidden links
    $('*').each((_, el) => {
      const style = $(el).attr('style');
      if (style && (style.includes('display:none') || style.includes('visibility:hidden'))) {
        const hiddenLink = $(el).find('a').attr('href');
        if (hiddenLink) links.push(hiddenLink + ' [HIDDEN]');
      }
    });

    return {
      text: $('body').text().substring(0, 1000),
      links: [...new Set(links)]
    };
  } catch (error) {
    console.error(`Scraping failed for ${url}:`, error);
    return null;
  }
}

// --- Express App ---
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());
  app.use(cors());

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  };

  // --- Socket.io ---
  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);
    
    socket.on('subscribe', (userId) => {
      socket.join(`user:${userId}`);
      console.log(`[Socket] Client ${socket.id} subscribed to user:${userId}`);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected:', socket.id);
    });
  });

  const createThreatRecord = (
    userId: number,
    platform: string,
    content: string,
    analysis: { prediction: string; risk_score: number; severity: string; },
    links: string[]
  ) => {
    const result = db.prepare(`
      INSERT INTO threats (user_id, platform, content, risk_score, severity, prediction, links)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      platform,
      content.substring(0, 500),
      analysis.risk_score,
      analysis.severity,
      analysis.prediction,
      JSON.stringify(links)
    );

    const threat = db.prepare('SELECT * FROM threats WHERE id = ?').get(result.lastInsertRowid);
    return formatThreatRecord(threat);
  };

  const emitThreat = (userId: number, threat: any) => {
    io.to(`user:${userId}`).emit('new_threat', threat);
    io.to('user:admin').emit('new_threat', threat);
  };

  const runMonitoringTask = async (task: any) => {
    const target = normalizeTarget(task.keyword);
    let content = task.keyword;
    let links: string[] = [];
    const scraped = await scrapeUrl(target);

    if (scraped) {
      content = scraped.text || task.keyword;
      links = scraped.links;
    } else {
      links = target.match(/https?:\/\/[^\s]+/g) || [];
    }

    const analysis = analyzeThreat(content, links);
    const threat = createThreatRecord(task.user_id, target, content, analysis, links);

    db.prepare('UPDATE monitoring_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(task.id);
    emitThreat(task.user_id, threat);

    return threat;
  };

  // --- API Routes ---

  // Captcha
  app.get('/api/auth/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 2,
      color: true,
      background: '#1a1a1a'
    });
    res.json({ data: captcha.data, text: captcha.text });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hashedPassword);
      res.status(201).json({ message: 'User registered' });
    } catch (err) {
      res.status(400).json({ error: 'Email already exists' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      db.prepare('INSERT INTO login_logs (user_id, ip_address, status) VALUES (?, ?, ?)').run(user.id, req.ip, 'success');
      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // Threats
  app.get('/api/threats', authenticateToken, (req: any, res) => {
    const threats = req.user.role === 'admin' 
      ? db.prepare('SELECT * FROM threats ORDER BY detected_at DESC').all()
      : db.prepare('SELECT * FROM threats WHERE user_id = ? ORDER BY detected_at DESC').all(req.user.id);
    res.json(threats.map(formatThreatRecord));
  });

  app.patch('/api/threats/:id/flag', authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const { is_false_positive } = req.body;
      
      db.prepare('UPDATE threats SET is_false_positive = ? WHERE id = ?').run(is_false_positive ? 1 : 0, id);
      
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to flag threat' });
    }
  });

  app.delete('/api/threats/:id', authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const threat = db.prepare('SELECT * FROM threats WHERE id = ?').get(id) as any;
    
    if (!threat) return res.status(404).json({ error: 'Threat not found' });
    if (req.user.role !== 'admin' && threat.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.prepare('DELETE FROM threats WHERE id = ?').run(id);
    res.json({ message: 'Threat deleted' });
  });

  app.post('/api/analyze', authenticateToken, async (req: any, res) => {
    const { text, url } = req.body;
    let content = text || '';
    let links: string[] = [];
    const normalizedUrl = url ? normalizeTarget(url) : '';

    if (normalizedUrl) {
      const scraped = await scrapeUrl(normalizedUrl);
      if (scraped) {
        content += ' ' + scraped.text;
        links = scraped.links;
      } else {
        links = [normalizedUrl];
      }
    }

    const textLinks = content.match(/https?:\/\/[^\s]+/g) || [];
    links = [...new Set([...links, ...textLinks])];

    const analysis = analyzeThreat(content, links);
    
    const newThreat = createThreatRecord(req.user.id, normalizedUrl || 'Manual Input', content, analysis, links);
    
    emitThreat(req.user.id, newThreat);

    res.json({ id: newThreat.id, detected_at: newThreat.detected_at, ...analysis, links });
  });

  // Monitoring
  app.get('/api/tasks', authenticateToken, (req: any, res) => {
    const tasks = db.prepare('SELECT * FROM monitoring_tasks WHERE user_id = ?').all(req.user.id);
    res.json(tasks.map(formatMonitoringTask));
  });

  app.post('/api/tasks', authenticateToken, async (req: any, res) => {
    const { keyword, interval_hours } = req.body;
    const normalizedKeyword = normalizeTarget(keyword);
    const result = db.prepare('INSERT INTO monitoring_tasks (user_id, keyword, interval_hours) VALUES (?, ?, ?)').run(
      req.user.id,
      normalizedKeyword,
      interval_hours
    );
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(result.lastInsertRowid) as any;

    let latestThreat = null;
    try {
      latestThreat = await runMonitoringTask(task);
    } catch (error) {
      console.error(`Initial monitoring scan failed for ${normalizedKeyword}:`, error);
    }

    const updatedTask = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Task created', task: formatMonitoringTask(updatedTask), latestThreat });
  });

  app.delete('/api/tasks/:id', authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    db.prepare('DELETE FROM monitoring_tasks WHERE id = ?').run(id);
    res.json({ message: 'Task deleted' });
  });

  app.patch('/api/tasks/:id/status', authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    db.prepare('UPDATE monitoring_tasks SET status = ? WHERE id = ?').run(status, id);
    const updatedTask = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id);
    res.json({ message: 'Status updated', task: formatMonitoringTask(updatedTask) });
  });

  // Admin
  app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare('SELECT id, email, role, created_at FROM users').all();
    res.json(users);
  });

  app.delete('/api/admin/users/:id', authenticateToken, isAdmin, (req: any, res) => {
    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    db.prepare('DELETE FROM threats WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM login_logs WHERE user_id = ?').run(id);
    res.json({ message: 'User deleted' });
  });

  app.patch('/api/admin/users/:id/role', authenticateToken, isAdmin, (req: any, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
    
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    res.json({ message: 'Role updated' });
  });

  app.get('/api/admin/logs', authenticateToken, isAdmin, (req, res) => {
    const logs = db.prepare(`
      SELECT l.*, u.email 
      FROM login_logs l 
      JOIN users u ON l.user_id = u.id 
      ORDER BY timestamp DESC LIMIT 100
    `).all();
    res.json(logs);
  });

  // --- Scheduler ---
  cron.schedule('* * * * *', async () => {
    console.log('Running background monitoring tasks...');
    const tasks = db.prepare("SELECT * FROM monitoring_tasks WHERE status = 'active'").all() as any[];
    
    for (const task of tasks) {
      const lastRun = task.last_run ? new Date(toIsoTimestamp(task.last_run)!) : new Date(0);
      const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
      
      if (hoursSince >= task.interval_hours) {
        console.log(`Monitoring keyword: ${task.keyword}`);
        const newThreat = await runMonitoringTask(task);
        
        
        if (newThreat.severity === 'HIGH') {
          console.log(`🚨 ALERT: High risk detected for keyword "${task.keyword}"!`);
        }
      }
    }
  });

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DarkScan AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
