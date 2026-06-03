const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const BASE_ID = 'appLZ8hWsuUjHL2z9';
const TABLE_ID = 'tbl7IAdi7m8mV7KOU'; // My Product Suggestions

// Serve the dashboard HTML
app.use(express.static('.'));

// Fetch products from Airtable, filtered by project
app.get('/api/products', async (req, res) => {
  try {
    const projectName = req.query.project;
    
    // Build filter formula if project is specified
    let filterFormula = '';
    if (projectName) {
      filterFormula = `?filterByFormula={Project}="${projectName}"`;
    }
    
    const response = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}${filterFormula}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data.records);
  } catch (error) {
    console.error('Error fetching from Airtable:', error.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Fetch all projects for the dropdown
app.get('/api/projects', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/Projects`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const projects = response.data.records
      .map(record => record.fields['Project Name'])
      .filter(Boolean);
    
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
