
import { kv } from '@vercel/kv';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const KEY = 'inventory_system_v2_data';

  try {
    // GET: Retrieve inventory data
    if (req.method === 'GET') {
      const data = await kv.get(KEY);
      return new Response(JSON.stringify(data || { items: [], lastUpdated: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST: Save inventory data
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Basic validation
      if (!body || !Array.isArray(body.items)) {
        return new Response(JSON.stringify({ error: 'Invalid data format' }), {
          status: 400,
        });
      }

      await kv.set(KEY, body);
      
      return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('KV Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
