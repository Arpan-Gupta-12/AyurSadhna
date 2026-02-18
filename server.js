const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasKey: !!GEMINI_API_KEY });
});

// Proxy endpoint
app.post('/api/analyze', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set on server' });
  }

  try {
    const { imageBase64, mediaType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const prompt = `You are an expert Ayurvedic nutritionist with deep knowledge of Charaka Samhita, Ashtanga Hridayam, and Sushruta Samhita. Analyze the food items in this image.

Respond ONLY with valid JSON and nothing else (no markdown, no code blocks, no extra text):
{
  "identified_foods": ["food1","food2"],
  "compatibility": "compatible",
  "compatibility_score": 75,
  "verdict_title": "4-6 word verdict",
  "verdict_subtitle": "One sentence explanation",
  "dosha_effects": {"vata":"increases","pitta":"neutral","kapha":"decreases"},
  "dosha_notes": "1-2 sentence dosha note",
  "ayurveda_analysis": "3-5 sentence Ayurvedic analysis based on Viruddha Ahara, Rasa, Virya, Vipaka principles",
  "cautions": ["caution1","caution2"],
  "suggestions": ["tip1","tip2","tip3"]
}

compatibility must be exactly one of: "compatible", "incompatible", or "moderate".
Score 0-100. If you cannot clearly see food, do your best based on what is visible.`;

    // Gemini 1.5 Flash — free tier
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mediaType || 'image/jpeg',
                data: imageBase64
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || 'Gemini API error';
      return res.status(response.status).json({ error: errMsg });
    }

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }

    // Clean and parse JSON
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ AyurScan running at http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY is not set!');
  }
});
