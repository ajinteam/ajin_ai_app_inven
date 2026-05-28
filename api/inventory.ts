
import { kv } from '@vercel/kv';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY = 'inventory_system_v2_data';

// Helper to encrypt text using secretKey
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

// Helper to decrypt text using secretKey
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

export default async function handler(req: any, res: any) {
  try {
    // GET: Retrieve inventory data
    if (req.method === 'GET') {
      const rawData = await kv.get(KEY);
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
            console.error('Data is encrypted on server but ENCRYPTION_KEY is missing.');
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
      return res.status(200).json({
        ...finalData,
        encryptionActive: !!process.env.ENCRYPTION_KEY
      });
    }

    // POST: Save inventory data
    if (req.method === 'POST') {
      const body = req.body;
      
      // Basic validation
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: 'Invalid data format' });
      }

      const secretKey = process.env.ENCRYPTION_KEY;
      let dataToSave: any = body;
      
      if (secretKey) {
        // Securely encrypt the entire payload
        dataToSave = encryptData(body, secretKey);
      }
      
      await kv.set(KEY, dataToSave);
      
      return res.status(200).json({ success: true, timestamp: new Date().toISOString() });
    }

    return res.status(405).send('Method not allowed');
  } catch (error: any) {
    console.error('KV Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

