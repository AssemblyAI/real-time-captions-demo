require('dotenv').config()
const express = require('express');
const PORT = process.env.PORT || 8000
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', async (req, res) => {
  try {
    const response = await axios.post('https://api.assemblyai.com/v2/realtime/token', // use account token to get a temp user token
      { expires_in: 3600 }, // can set a TTL timer in seconds.
      { headers: { authorization: process.env.API_KEY } }); // AssemblyAI API Key goes here
    const { data } = response; 
    res.json(data); 
  } catch (error) {
    const {response: {status, data}} = error;    
    res.status(status).json(data);
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))