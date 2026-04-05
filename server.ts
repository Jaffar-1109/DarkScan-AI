import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dns from 'dns/promises';
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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';

// --- Types & Interfaces ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const natural = require('natural') as typeof import('natural');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'darkscan_secret_key';
const DB_PATH = process.env.DB_PATH || 'darkscan.db';
const DATA_DIR = path.join(__dirname, 'data');
const APP_URL = process.env.APP_URL || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jaffar.def1109@gmail.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin_DarkScan.AI';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Jaffar_1109';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || ADMIN_EMAIL;
const LOCKOUT_WINDOW_MINUTES = Number(process.env.LOCKOUT_WINDOW_MINUTES || 15);
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5);
const LOCKOUT_DURATION_MINUTES = Number(process.env.LOCKOUT_DURATION_MINUTES || 15);
const ALLOWED_MONITOR_INTERVALS = new Set([8, 12, 24]);

// --- Database Setup ---
const db = new Database(DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    alert_email TEXT,
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
    ip_address TEXT,
    is_false_positive INTEGER DEFAULT 0,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS monitoring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    keyword TEXT,
    alert_email TEXT,
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

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER,
    action TEXT,
    target_user_id INTEGER,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_user_id) REFERENCES users(id)
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const hasColumn = columns.some(col => col.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

ensureColumn('users', 'username', 'username TEXT');
ensureColumn('users', 'alert_email', 'alert_email TEXT');
ensureColumn('threats', 'ip_address', 'ip_address TEXT');
ensureColumn('monitoring_tasks', 'alert_email', 'alert_email TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username)');
db.exec(`
  UPDATE monitoring_tasks
  SET interval_hours = 8
  WHERE interval_hours IS NULL
    OR interval_hours NOT IN (8, 12, 24);
`);
db.exec(`
  UPDATE monitoring_tasks
  SET alert_email = COALESCE((
    SELECT COALESCE(NULLIF(TRIM(u.alert_email), ''), u.email)
    FROM users u
    WHERE u.id = monitoring_tasks.user_id
  ), '${ADMIN_EMAIL}')
  WHERE alert_email IS NULL
    OR TRIM(alert_email) = ''
    OR LOWER(alert_email) = 'alerts@example.com';
`);
db.exec(`
  UPDATE threats
  SET ip_address = COALESCE((
    SELECT l.ip_address
    FROM login_logs l
    WHERE l.user_id = threats.user_id
      AND l.status = 'success'
      AND l.ip_address IS NOT NULL
      AND TRIM(l.ip_address) != ''
      AND LOWER(l.ip_address) NOT IN ('unknown', 'system')
    ORDER BY l.timestamp DESC
    LIMIT 1
  ), '127.0.0.1')
  WHERE ip_address IS NULL
    OR TRIM(ip_address) = ''
    OR LOWER(ip_address) IN ('unknown', 'system');
`);

const mailTransport = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      },
      tls: {
        rejectUnauthorized: !(SMTP_HOST === '127.0.0.1' || SMTP_HOST === 'localhost')
      }
    })
  : null;

// Seed Admin if not exists
console.log(`[System] Admin account configured as: ${ADMIN_USERNAME} / ${ADMIN_EMAIL} - server.ts:172`);

const hashedAdminPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const matchedAdmin =
  db.prepare('SELECT * FROM users WHERE username = ?').get(ADMIN_USERNAME) as any ||
  db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL) as any ||
  db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get() as any;

if (matchedAdmin) {
  db.prepare(`
    UPDATE users
    SET username = ?, email = ?, password = ?, role = 'admin', alert_email = ?
    WHERE id = ?
  `).run(ADMIN_USERNAME, ADMIN_EMAIL, hashedAdminPassword, ADMIN_EMAIL, matchedAdmin.id);
  console.log(`[System] Admin account updated successfully: ${ADMIN_EMAIL} - server.ts:186`);
} else {
  db.prepare('INSERT INTO users (username, email, password, role, alert_email) VALUES (?, ?, ?, ?, ?)').run(
    ADMIN_USERNAME,
    ADMIN_EMAIL,
    hashedAdminPassword,
    'admin',
    ADMIN_EMAIL
  );
  console.log(`[System] Admin account seeded successfully: ${ADMIN_EMAIL} - server.ts:195`);
}

// Seed initial threats if none exist
const threatCount = db.prepare('SELECT COUNT(*) as count FROM threats').get() as any;
if (threatCount.count === 0) {
  const adminRecord = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL) as any;
  const adminId = adminRecord ? adminRecord.id : 1;
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
      INSERT INTO threats (user_id, platform, content, risk_score, severity, prediction, links, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  initialThreats.forEach(t => {
    insertThreat.run(adminId, t.platform, t.content, t.risk_score, t.severity, t.prediction, t.links, '127.0.0.1');
  });
  console.log('[System] Initial threat data seeded. - server.ts:246');
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
    console.error(`[System] Failed to parse ${fileName}: - server.ts:283`, error);
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
    console.error(`[System] Failed to parse ${fileName}: - server.ts:304`, error);
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

function validatePasswordStrength(password: string) {
  return /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const emailDomainValidationCache = new Map<string, { valid: boolean; checkedAt: number }>();
const EMAIL_DOMAIN_CACHE_TTL_MS = 1000 * 60 * 30;
const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'mail.com'
]);
const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'invalid',
  'localhost',
  'local',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com'
]);

function getLevenshteinDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function isSuspiciousTypoOfCommonEmailDomain(domain: string) {
  const normalized = sanitizeInput(domain).toLowerCase();
  if (COMMON_EMAIL_DOMAINS.has(normalized)) return false;

  for (const trustedDomain of COMMON_EMAIL_DOMAINS) {
    const distance = getLevenshteinDistance(normalized, trustedDomain);
    if (distance <= 2) {
      return true;
    }
  }

  return false;
}

function isClearlyBlockedEmailDomain(domain: string) {
  const normalized = sanitizeInput(domain).toLowerCase();
  return (
    !normalized ||
    BLOCKED_EMAIL_DOMAINS.has(normalized) ||
    isSuspiciousTypoOfCommonEmailDomain(normalized) ||
    normalized.endsWith('.invalid') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.test') ||
    normalized.endsWith('.example')
  );
}

async function hasResolvableMailDomain(domain: string) {
  const normalizedDomain = sanitizeInput(domain).toLowerCase();
  if (!normalizedDomain) return false;
  if (COMMON_EMAIL_DOMAINS.has(normalizedDomain)) return true;
  if (isClearlyBlockedEmailDomain(normalizedDomain)) return false;

  const cached = emailDomainValidationCache.get(normalizedDomain);
  if (cached && (Date.now() - cached.checkedAt) < EMAIL_DOMAIN_CACHE_TTL_MS) {
    return cached.valid;
  }

  let valid = false;

  try {
    const mxRecords = await dns.resolveMx(normalizedDomain);
    valid = Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (mxError: any) {
    try {
      const [aRecords, aaaaRecords] = await Promise.allSettled([
        dns.resolve4(normalizedDomain),
        dns.resolve6(normalizedDomain)
      ]);

      valid =
        (aRecords.status === 'fulfilled' && aRecords.value.length > 0) ||
        (aaaaRecords.status === 'fulfilled' && aaaaRecords.value.length > 0);
    } catch {
      valid = false;
    }

  }

  emailDomainValidationCache.set(normalizedDomain, {
    valid,
    checkedAt: Date.now()
  });

  return valid;
}

async function validateAuthenticEmail(email: string) {
  if (!isValidEmail(email)) return false;
  const [, domain = ''] = email.split('@');
  return hasResolvableMailDomain(domain);
}

function sanitizeInput(value: string) {
  return value.replace(/\0/g, '').trim();
}

function normalizeIpAddress(value: string | null | undefined) {
  const raw = sanitizeInput(String(value || ''));
  if (!raw) return '127.0.0.1';

  const first = raw.split(',')[0].trim();
  const withoutPort = first.startsWith('[')
    ? first.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1')
    : first.replace(/:\d+$/, '');

  let normalized = withoutPort.replace(/^::ffff:/i, '');
  if (normalized === '::1' || normalized === '::') {
    normalized = '127.0.0.1';
  }

  return normalized || '127.0.0.1';
}

function getBaseUsername(email: string) {
  return sanitizeInput(email.split('@')[0]).replace(/[^A-Za-z0-9._-]/g, '.') || 'user';
}

function generateUniqueUsername(seed: string) {
  const base = sanitizeInput(seed).replace(/[^A-Za-z0-9._-]/g, '.') || 'user';
  let candidate = base;
  let counter = 1;

  while (db.prepare('SELECT id FROM users WHERE username = ?').get(candidate)) {
    candidate = `${base}.${counter}`;
    counter += 1;
  }

  return candidate;
}

function getClientIp(req: any) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return normalizeIpAddress(forwarded);
  }
  return normalizeIpAddress(req.ip || req.socket?.remoteAddress);
}

function getLatestUserIp(userId: number) {
  const row = db.prepare(`
    SELECT ip_address
    FROM login_logs
    WHERE user_id = ? AND status = 'success'
      AND ip_address IS NOT NULL
      AND TRIM(ip_address) != ''
      AND LOWER(ip_address) NOT IN ('unknown', 'system')
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(userId) as any;

  return normalizeIpAddress(row?.ip_address);
}

function hasTooManyRecentFailedLogins(userId: number) {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM login_logs
    WHERE user_id = ?
      AND status = 'failed'
      AND timestamp >= datetime('now', ?)
  `).get(userId, `-${LOCKOUT_WINDOW_MINUTES} minutes`) as any;

  return Number(row?.count || 0) >= MAX_FAILED_LOGIN_ATTEMPTS;
}

function getLockoutMessage() {
  return `Too many failed login attempts. Please wait ${LOCKOUT_DURATION_MINUTES} minutes before trying again.`;
}

function validateStatus(value: string) {
  return value === 'active' || value === 'paused';
}

function validateRole(value: string) {
  return value === 'admin' || value === 'user';
}

function validateMonitorInterval(value: number) {
  return ALLOWED_MONITOR_INTERVALS.has(value);
}

function validateSeverity(value: string) {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH';
}

function severityRank(value: string) {
  switch (value) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
}

function severityMeetsThreshold(actual: string, minimum: string) {
  return severityRank(actual) >= severityRank(minimum);
}

function isAllowedBrowserOrigin(origin: string | undefined) {
  if (!origin || !APP_URL) return true;
  return (
    origin === APP_URL ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('edge-extension://')
  );
}

function logAdminAction(adminUserId: number, action: string, targetUserId: number | null, details: Record<string, unknown>, ipAddress: string) {
  db.prepare(`
    INSERT INTO admin_audit_logs (admin_user_id, action, target_user_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    adminUserId,
    action,
    targetUserId,
    JSON.stringify(details),
    normalizeIpAddress(ipAddress)
  );
}

async function sendThreatEmail(recipients: string[], threat: any, links: string[]) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean).map(value => sanitizeInput(value).toLowerCase()))];
  if (uniqueRecipients.length === 0) {
    console.log('[Email] Skipping send because no recipients were provided. - server.ts:694');
    return false;
  }
  if (!mailTransport) {
    console.log('[Email] Skipping send because SMTP is not configured. - server.ts:698');
    return false;
  }

  const lines = [
    `DarkScan AI Alert`,
    `Source: ${threat.platform}`,
    `Risk Score: ${threat.risk_score}`,
    `Severity: ${threat.severity}`,
    `Prediction: ${threat.prediction}`,
    `IP Address: ${threat.ip_address}`,
    `Detected At: ${threat.detected_at}`,
    `Content: ${threat.content}`,
    `Links: ${links.join(', ') || 'None'}`
  ];

  try {
    await mailTransport.sendMail({
      from: SMTP_FROM,
      to: uniqueRecipients.join(', '),
      subject: `[DarkScan AI] ${threat.severity} alert for ${threat.platform}`,
      text: lines.join('\n')
    });
    console.log(`[Email] Alert delivered to ${uniqueRecipients.join(', ')} for ${threat.platform} - server.ts:721`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send alert email: - server.ts:724', error);
    return false;
  }
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
    ip_address: normalizeIpAddress(threat.ip_address),
    detected_at: toIsoTimestamp(threat.detected_at)
  };
}

function formatMonitoringTask(task: any) {
  if (!task) return task;
  const lastRunIso = toIsoTimestamp(task.last_run);
  const nextRunIso = lastRunIso && Number.isFinite(Number(task.interval_hours))
    ? new Date(new Date(lastRunIso).getTime() + Number(task.interval_hours) * 60 * 60 * 1000).toISOString()
    : null;

  return {
    ...task,
    last_run: lastRunIso,
    next_run_at: nextRunIso
  };
}

function parseThreatLinks(linksValue: string | null | undefined) {
  if (!linksValue) return [] as string[];
  try {
    const parsed = JSON.parse(linksValue);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function findLatestThreatForTask(task: any) {
  const normalizedKeyword = normalizeTarget(task.keyword);
  const threats = db.prepare(`
    SELECT *
    FROM threats
    WHERE user_id = ?
    ORDER BY detected_at DESC, id DESC
    LIMIT 100
  `).all(task.user_id) as any[];

  return threats.find((threat) => normalizeTarget(String(threat.platform || '')) === normalizedKeyword) || null;
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
    console.error(`Scraping failed for ${url}: - server.ts:855`, error);
    return null;
  }
}

// --- Express App ---
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isAllowedBrowserOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed'));
    }
  };

  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginHandler,
      methods: ["GET", "POST"],
      credentials: true
    },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (isAllowedBrowserOrigin(origin)) {
        callback(null, true);
      } else {
        callback('Origin not allowed', false);
      }
    }
  });

  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", APP_URL || "'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    } : false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({
    origin: corsOriginHandler,
    credentials: true
  }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
  });

  const emailValidationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { valid: false, error: 'Too many email validation checks. Please wait a moment and try again.' }
  });

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again.' }
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/validate-email', emailValidationLimiter);

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'darkscan-ai'
    }, (err: any, user: any) => {
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
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Unauthorized'));
    }

    jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'darkscan-ai'
    }, (err: any, user: any) => {
      if (err) return next(new Error('Unauthorized'));
      (socket.data as any).user = user;
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected: - server.ts:981', socket.id);
    
    socket.on('subscribe', (userId) => {
      const sessionUser = (socket.data as any).user;
      if (String(userId) === String(sessionUser?.id)) {
        socket.join(`user:${sessionUser.id}`);
        console.log(`[Socket] Client ${socket.id} subscribed to user:${sessionUser.id} - server.ts:987`);
      } else if (String(userId) === 'admin' && sessionUser?.role === 'admin') {
        socket.join('user:admin');
        console.log(`[Socket] Client ${socket.id} subscribed to user:admin - server.ts:990`);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected: - server.ts:995', socket.id);
    });
  });

  const createThreatRecord = (
    userId: number,
    platform: string,
    content: string,
    analysis: { prediction: string; risk_score: number; severity: string; },
    links: string[],
    ipAddress: string
  ) => {
    const result = db.prepare(`
      INSERT INTO threats (user_id, platform, content, risk_score, severity, prediction, links, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      platform,
      content.substring(0, 500),
      analysis.risk_score,
      analysis.severity,
      analysis.prediction,
      JSON.stringify(links),
      ipAddress
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
    const ipAddress = getLatestUserIp(task.user_id);

    if (scraped) {
      content = scraped.text || task.keyword;
      links = scraped.links;
    } else {
      links = target.match(/https?:\/\/[^\s]+/g) || [];
    }

    const analysis = analyzeThreat(content, links);
    const threat = createThreatRecord(task.user_id, target, content, analysis, links, ipAddress);

    db.prepare('UPDATE monitoring_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(task.id);
    emitThreat(task.user_id, threat);
    const emailSent = await sendThreatEmail(
      [task.alert_email],
      threat,
      links
    );

    return { threat, emailSent };
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

  app.post('/api/auth/validate-email', async (req, res) => {
    const email = sanitizeInput(req.body.email || '');

    if (!email) {
      return res.status(400).json({ valid: false, error: 'Email is required.' });
    }

    if (!isValidEmail(email)) {
      return res.json({ valid: false, error: 'Invalid email format.' });
    }

    const valid = await validateAuthenticEmail(email);
    if (!valid) {
      return res.json({
        valid: false,
        error: 'This email domain could not be verified. Please use a real email address.'
      });
    }

    return res.json({ valid: true });
  });

  app.post('/api/auth/register', async (req, res) => {
    const email = sanitizeInput(req.body.email || '');
    const password = String(req.body.password || '');
    const requestedUsername = sanitizeInput(req.body.username || '');
    const alertEmail = sanitizeInput(req.body.alert_email || email);

    if (!isValidEmail(email) || !isValidEmail(alertEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format.' });
    }

    const [isPrimaryEmailAuthentic, isAlertEmailAuthentic] = await Promise.all([
      validateAuthenticEmail(email),
      email === alertEmail ? Promise.resolve(true) : validateAuthenticEmail(alertEmail)
    ]);

    if (!isPrimaryEmailAuthentic || !isAlertEmailAuthentic) {
      return res.status(400).json({ error: 'The email address could not be verified. Please use a real email domain that can receive mail.' });
    }

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'Password must contain one uppercase letter, one number, and one special character.' });
    }

    try {
      const username = requestedUsername
        ? generateUniqueUsername(requestedUsername)
        : generateUniqueUsername(getBaseUsername(email));
      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (username, email, password, alert_email) VALUES (?, ?, ?, ?)').run(
        username,
        email,
        hashedPassword,
        alertEmail
      );
      res.status(201).json({ message: 'User registered', username });
    } catch (err) {
      res.status(400).json({ error: 'Email or user id already exists' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const identifier = sanitizeInput(req.body.identifier || req.body.email || '');
    const password = String(req.body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier, identifier) as any;

    if (user && hasTooManyRecentFailedLogins(user.id)) {
      return res.status(429).json({ error: getLockoutMessage() });
    }

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        {
          expiresIn: '24h',
          issuer: 'darkscan-ai'
        }
      );
      db.prepare('INSERT INTO login_logs (user_id, ip_address, status) VALUES (?, ?, ?)').run(user.id, getClientIp(req), 'success');
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          alert_email: user.alert_email,
          role: user.role
        }
      });
    } else {
      if (user) {
        db.prepare('INSERT INTO login_logs (user_id, ip_address, status) VALUES (?, ?, ?)').run(user.id, getClientIp(req), 'failed');
      }
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    const user = db.prepare('SELECT id, username, email, alert_email, role FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });

  app.post('/api/extension/scan-visit', authenticateToken, async (req: any, res) => {
    const url = sanitizeInput(req.body.url || '');
    const pageTitle = String(req.body.page_title || '').trim().slice(0, 200);
    const emailReports = Boolean(req.body.email_reports);
    const minimumSeverity = String(req.body.minimum_severity || 'HIGH').toUpperCase();

    if (!url) {
      return res.status(400).json({ error: 'Visited URL is required.' });
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Only http and https URLs can be scanned.' });
    }

    if (!validateSeverity(minimumSeverity)) {
      return res.status(400).json({ error: 'Invalid severity threshold.' });
    }

    const normalizedUrl = normalizeTarget(url);
    let content = pageTitle ? `Browser visit detected: ${pageTitle}` : 'Browser visit detected';
    let links: string[] = [];

    const scraped = await scrapeUrl(normalizedUrl);
    if (scraped) {
      content = `${content}\n${scraped.text}`.trim();
      links = scraped.links;
    } else {
      links = [normalizedUrl];
    }

    const textLinks = content.match(/https?:\/\/[^\s]+/g) || [];
    links = [...new Set([...links, ...textLinks, normalizedUrl])];

    const analysis = analyzeThreat(content, links);
    const newThreat = createThreatRecord(req.user.id, normalizedUrl, content, analysis, links, getClientIp(req));

    emitThreat(req.user.id, newThreat);

    let emailSent = false;
    if (emailReports && severityMeetsThreshold(analysis.severity, minimumSeverity)) {
      const currentUser = db.prepare('SELECT email, alert_email FROM users WHERE id = ?').get(req.user.id) as any;
      const recipient = sanitizeInput(currentUser?.alert_email || currentUser?.email || '');
      emailSent = await sendThreatEmail(recipient ? [recipient] : [], newThreat, links);
    }

    res.json({
      message: 'Visited URL scanned successfully.',
      threat: newThreat,
      analysis,
      email_sent: emailSent,
      minimum_severity: minimumSeverity
    });
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

      const threat = db.prepare('SELECT * FROM threats WHERE id = ?').get(id) as any;
      if (!threat) return res.status(404).json({ error: 'Threat not found' });
      if (req.user.role !== 'admin' && threat.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

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
    const text = String(req.body.text || '').slice(0, 10000);
    const url = sanitizeInput(req.body.url || '');
    let content = text || '';
    let links: string[] = [];
    const normalizedUrl = url ? normalizeTarget(url) : '';

    if (!content && !normalizedUrl) {
      return res.status(400).json({ error: 'Text or URL is required.' });
    }

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
    
    const newThreat = createThreatRecord(req.user.id, normalizedUrl || 'Manual Input', content, analysis, links, getClientIp(req));
    
    emitThreat(req.user.id, newThreat);

    res.json({ id: newThreat.id, detected_at: newThreat.detected_at, ip_address: newThreat.ip_address, ...analysis, links });
  });

  // Monitoring
  app.get('/api/tasks', authenticateToken, (req: any, res) => {
    const tasks = db.prepare('SELECT * FROM monitoring_tasks WHERE user_id = ?').all(req.user.id);
    res.json(tasks.map(formatMonitoringTask));
  });

  app.post('/api/tasks', authenticateToken, async (req: any, res) => {
    const keyword = sanitizeInput(req.body.keyword || '');
    const intervalHours = Number(req.body.interval_hours);
    const alertEmail = sanitizeInput(req.body.alert_email || '');

    if (!keyword) {
      return res.status(400).json({ error: 'Target is required.' });
    }

    if (!isValidEmail(alertEmail)) {
      return res.status(400).json({ error: 'A valid alert email address is required.' });
    }

    if (!Number.isFinite(intervalHours) || !validateMonitorInterval(intervalHours)) {
      return res.status(400).json({ error: 'Monitoring interval must be 8, 12, or 24 hours.' });
    }

    const normalizedKeyword = normalizeTarget(keyword);
    const result = db.prepare('INSERT INTO monitoring_tasks (user_id, keyword, alert_email, interval_hours) VALUES (?, ?, ?, ?)').run(
      req.user.id,
      normalizedKeyword,
      alertEmail,
      intervalHours
    );
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(result.lastInsertRowid) as any;

    let latestThreat = null;
    let initialEmailSent = false;
    try {
      const initialRun = await runMonitoringTask(task);
      latestThreat = initialRun.threat;
      initialEmailSent = initialRun.emailSent;
    } catch (error) {
      console.error(`Initial monitoring scan failed for ${normalizedKeyword}: - server.ts:1289`, error);
    }

    const updatedTask = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      message: 'Task created',
      task: formatMonitoringTask(updatedTask),
      latestThreat,
      initial_email_sent: initialEmailSent
    });
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
    const status = sanitizeInput(req.body.status || '');
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    if (!validateStatus(status)) {
      return res.status(400).json({ error: 'Invalid task status' });
    }

    db.prepare('UPDATE monitoring_tasks SET status = ? WHERE id = ?').run(status, id);
    const updatedTask = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id);
    res.json({ message: 'Status updated', task: formatMonitoringTask(updatedTask) });
  });

  app.post('/api/tasks/:id/share-report', authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM monitoring_tasks WHERE id = ?').get(id) as any;

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const latestThreat = findLatestThreatForTask(task);
    if (!latestThreat) {
      return res.status(404).json({ error: 'No monitoring report is available to share yet.' });
    }

    const formattedThreat = formatThreatRecord(latestThreat);
    const emailSent = await sendThreatEmail([task.alert_email], formattedThreat, parseThreatLinks(latestThreat.links));

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to share the monitoring report by email.' });
    }

    res.json({
      message: `Monitoring report shared to ${task.alert_email}.`,
      recipient: task.alert_email,
      report: formattedThreat
    });
  });

  // Admin
  app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, email, alert_email, role, created_at FROM users').all();
    res.json(users);
  });

  app.get('/api/admin/users/:id/activity', authenticateToken, isAdmin, (req: any, res) => {
    const { id } = req.params;
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = db.prepare(`
      SELECT id, username, email, alert_email, role, created_at
      FROM users
      WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const scans = db.prepare(`
      SELECT *
      FROM threats
      WHERE user_id = ?
      ORDER BY detected_at DESC
      LIMIT 50
    `).all(userId).map(formatThreatRecord);

    const monitoringTasks = db.prepare(`
      SELECT *
      FROM monitoring_tasks
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(userId).map(formatMonitoringTask);

    const loginHistory = db.prepare(`
      SELECT *
      FROM login_logs
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(userId) as any[];

    const summary = {
      totalScans: scans.length,
      activeMonitors: monitoringTasks.filter((task: any) => task.status === 'active').length,
      totalMonitors: monitoringTasks.length,
      lastLoginAt: loginHistory.find((log: any) => log.status === 'success')?.timestamp || null
    };

    res.json({
      user,
      summary,
      scans,
      monitoringTasks,
      loginHistory
    });
  });

  app.delete('/api/admin/users/:id', authenticateToken, isAdmin, (req: any, res) => {
    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    const targetUser = db.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(id) as any;
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    db.prepare('DELETE FROM threats WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM monitoring_tasks WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM login_logs WHERE user_id = ?').run(id);
    logAdminAction(req.user.id, 'delete_user', Number(id), {
      email: targetUser.email,
      username: targetUser.username,
      role: targetUser.role
    }, getClientIp(req));
    res.json({ message: 'User deleted' });
  });

  app.patch('/api/admin/users/:id/role', authenticateToken, isAdmin, (req: any, res) => {
    const { id } = req.params;
    const role = sanitizeInput(req.body.role || '');
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });

    if (!validateRole(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const targetUser = db.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(id) as any;
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    logAdminAction(req.user.id, 'change_role', Number(id), {
      email: targetUser.email,
      username: targetUser.username,
      previousRole: targetUser.role,
      newRole: role
    }, getClientIp(req));
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
    console.log('Running background monitoring tasks... - server.ts:1469');
    const tasks = db.prepare("SELECT * FROM monitoring_tasks WHERE status = 'active'").all() as any[];
    
    for (const task of tasks) {
      const lastRun = task.last_run ? new Date(toIsoTimestamp(task.last_run)!) : new Date(0);
      const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
      
      if (hoursSince >= task.interval_hours) {
        console.log(`Monitoring keyword: ${task.keyword} - server.ts:1477`);
        const { threat: newThreat } = await runMonitoringTask(task);
        
        
        if (newThreat.severity === 'HIGH') {
          console.log(`🚨 ALERT: High risk detected for keyword "${task.keyword}"! - server.ts:1482`);
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
    app.get('*', async (req, res, next) => {
      try {
        const indexPath = path.join(__dirname, 'index.html');
        const template = fs.readFileSync(indexPath, 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DarkScan AI Server running on http://localhost:${PORT} - server.ts:1515`);
  });
}

startServer();
