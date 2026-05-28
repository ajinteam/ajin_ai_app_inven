
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { kv } from '@vercel/kv';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALGORITHM = 'aes-256-cbc';

// Helper to encrypt text using process.env.ENCRYPTION_KEY
function encryptData(dataObj: any, secretKey: string): string {
  const text = JSON.stringify(dataObj);
  // Hash key to ensure it is exactly 32 bytes (256-bit key)
  const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();
  const ivBuffer = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, ivBuffer);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return formatted string with iv and ciphertext
  return `enc:${ivBuffer.toString('hex')}:${encrypted}`;
}

// Helper to decrypt text using process.env.ENCRYPTION_KEY
function decryptData(encryptedText: string, secretKey: string): any {
  if (!encryptedText.startsWith('enc:')) {
    throw new Error('Not encrypted in standard format');
  }
  
  const parts = encryptedText.split(':');
  if (parts.length < 3) {
    throw new Error('Invalid encrypted content parts');
  }
  
  const ivBuffer = Buffer.from(parts[1], 'hex');
  const encryptedStr = parts[2];
  const keyBuffer = crypto.createHash('sha256').update(secretKey).digest();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
  let decrypted = decipher.update(encryptedStr, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const KEY = 'inventory_system_v2_data';

  // API Routes
  app.get('/api/inventory', async (req, res) => {
    try {
      const isKvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
      let rawData: any = null;
      
      if (isKvConfigured) {
        rawData = await kv.get(KEY);
      } else {
        const localFilePath = path.join(process.cwd(), 'inventory_db.json');
        if (fs.existsSync(localFilePath)) {
          rawData = await fs.promises.readFile(localFilePath, 'utf8');
        }
      }
      
      let data: any = null;
      
      if (rawData) {
        if (typeof rawData === 'string' && rawData.startsWith('enc:')) {
          const secretKey = process.env.ENCRYPTION_KEY;
          if (secretKey) {
            try {
              data = decryptData(rawData, secretKey);
            } catch (decError: any) {
              console.error('Decryption failed, fallback or incorrect ENCRYPTION_KEY:', decError);
              return res.status(500).json({ error: 'Decryption failed. Please check if your ENCRYPTION_KEY is correct.' });
            }
          } else {
            console.error('Data is encrypted on server but ENCRYPTION_KEY is missing from environment variables.');
            return res.status(500).json({ error: 'Database is encrypted but server is missing ENCRYPTION_KEY.' });
          }
        } else if (typeof rawData === 'object' && rawData !== null) {
          data = rawData;
        } else if (typeof rawData === 'string' && rawData.trim() !== '') {
          try {
            data = JSON.parse(rawData);
          } catch {
            data = rawData;
          }
        }
      }
      
      // Always guarantee users: [] default structure
      const finalData = data || { items: [], users: [], lastUpdated: null };
      res.json({
        ...finalData,
        encryptionActive: !!process.env.ENCRYPTION_KEY
      });
    } catch (error: any) {
      console.error('Inventory GET Error:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  });

  app.post('/api/inventory', async (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: 'Invalid data format' });
      }
      
      const secretKey = process.env.ENCRYPTION_KEY;
      let dataToSave: any = body;
      
      if (secretKey) {
        // Securely encrypt the entire payload
        dataToSave = encryptData(body, secretKey);
      }
      
      const isKvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
      
      if (isKvConfigured) {
        await kv.set(KEY, dataToSave);
      } else {
        const localFilePath = path.join(process.cwd(), 'inventory_db.json');
        await fs.promises.writeFile(
          localFilePath, 
          typeof dataToSave === 'string' ? dataToSave : JSON.stringify(dataToSave), 
          'utf8'
        );
      }
      
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error('Inventory POST Error:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  });

  // Vite middleware for development
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
