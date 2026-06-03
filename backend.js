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
const COMPETITOR_PRODUCTS_TABLE_ID = 'tbltrtUEkRnX3uLOh'; // Competitor's Products

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

    // Enrich records with competitor product names
    const enrichedRecords = await Promise.all(
      response.data.records.map(async (record) => {
        if (record.fields['Competitor\'s Products'] && Array.isArray(record.fields['Competitor\'s Products'])) {
          try {
            console.log(`Enriching record ${record.id} with products:`, record.fields['Competitor\'s Products']);
            // Fetch the linked competitor product records
            const productIds = record.fields['Competitor\'s Products'];
            const productNames = await Promise.all(
              productIds.map(async (productId) => {
                console.log(`Fetching product ${productId}...`);
                const linkedResponse = await axios.get(
                  `https://api.airtable.com/v0/${BASE_ID}/${COMPETITOR_PRODUCTS_TABLE_ID}/${productId}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                console.log(`Product ${productId} fields:`, linkedResponse.data.fields);
                return linkedResponse.data.fields['Competitor Product Request'] || 'Unknown Product';
              })
            );

            console.log(`Enriched product names for ${record.id}:`, productNames);
            // Add the product names to the record
            record.fields['Competitor Product Name'] = productNames.join(', ');
          } catch (err) {
            console.error(`Error enriching record ${record.id}:`, err.message);
            record.fields['Competitor Product Name'] = 'Error loading product name';
          }
        }
        return record;
      })
    );

    res.json(enrichedRecords);
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
