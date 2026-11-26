require('dotenv').config()
const express = require('express');
const PORT = process.env.PORT || 8000
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'Set API_KEY on the demo server.' });
  }

  try {
    const { data } = await axios.post('https://token.assemblyai.com/v1/token',
      { product: 'streaming', expires_in_seconds: 60 },
      { headers: { authorization: process.env.API_KEY }, timeout: 10_000 });
    if (typeof data?.token !== 'string' || !data.token) {
      return res.status(502).json({ error: 'AssemblyAI did not return a streaming token.' });
    }
    res.json({ token: data.token });
  } catch (error) {
    res.status(error.response?.status ?? 502).json({ error: 'Could not get an AssemblyAI streaming token.' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
