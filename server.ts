
import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const DATA_FILE = path.join(__dirname, 'inventory_data.json');

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/inventory', async (req, res) => {
    try {
      // Try to read from local file first as a reliable fallback
      let data = { items: [], users: [], lastUpdated: null };
      try {
        const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
        data = JSON.parse(fileContent);
      } catch (err) {
        // File doesn't exist yet, return empty
      }
      res.json(data);
    } catch (error) {
      console.error('API GET Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/inventory', async (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: 'Invalid data format' });
      }

      // Save to local file
      await fs.writeFile(DATA_FILE, JSON.stringify(body, null, 2));
      
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('API POST Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
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
