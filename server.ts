
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { kv } from '@vercel/kv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const KEY = 'inventory_system_v2_data';

  // API Routes
  app.get('/api/inventory', async (req, res) => {
    try {
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        throw new Error('KV environment variables are not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN in the Settings menu.');
      }
      const data = await kv.get(KEY);
      res.json(data || { items: [], lastUpdated: null });
    } catch (error: any) {
      console.error('KV GET Error:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  });

  app.post('/api/inventory', async (req, res) => {
    try {
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        throw new Error('KV environment variables are not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN in the Settings menu.');
      }
      const body = req.body;
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: 'Invalid data format' });
      }
      await kv.set(KEY, body);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error('KV POST Error:', error);
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
