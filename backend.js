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
const CONTACTS_TABLE_ID = 'tblSPtl75lcRjeLuP'; // My Contacts

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
            const productData = await Promise.all(
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
                return {
                  name: linkedResponse.data.fields['Competitor Product Name'] || 'Unknown Product',
                  quantity: linkedResponse.data.fields['Quantity'] || 1
                };
              })
            );

            console.log(`Enriched product data for ${record.id}:`, productData);
            // Add the product names and quantities to the record
            record.fields['Competitor Product Name'] = productData[0].name;
            record.fields['Competitor Product Quantity'] = productData[0].quantity;
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

// Authenticate client by email
app.get('/api/authenticate', async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Search for the contact in My Contacts table
    const response = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        },
        params: {
          filterByFormula: `{Email} = "${email}"`
        }
      }
    );

    const records = response.data.records;

    if (records.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const contact = records[0].fields;
    res.json({
      contactName: contact['Contact Name'] || 'User',
      company: contact['Company'] || 'Unknown',
      email: email
    });

  } catch (error) {
    console.error('Error authenticating:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get all projects for a client
app.get('/api/client-projects', async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find the contact by email
    const contactResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        },
        params: {
          filterByFormula: `{Email} = "${email}"`
        }
      }
    );

    const contacts = contactResponse.data.records;
    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const contactId = contacts[0].id;
    const company = contacts[0].fields['Company'];

    console.log(`Looking for projects for contact ${contactId} (${company})`);

    // Get all Competitor's Products records where requesting person includes this contact
    const productsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${COMPETITOR_PRODUCTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    // Filter by requesting person and get unique projects
    const projectMap = {};

    productsResponse.data.records.forEach(record => {
      const requestingPersons = record.fields['requesting person'] || [];

      // Check if this contact is in the requesting person field
      const isCompanyProduct = requestingPersons.includes(contactId);

      if (isCompanyProduct) {
        const project = record.fields['Project'];
        if (project) {
          if (!projectMap[project]) {
            projectMap[project] = { name: project, productCount: 0, isCompleted: false };
          }
          projectMap[project].productCount++;
        }
      }
    });

    // Convert to array and sort
    const projects = Object.values(projectMap).sort((a, b) => a.name.localeCompare(b.name));
    console.log(`Found ${projects.length} projects for ${company}`);

    res.json(projects);

  } catch (error) {
    console.error('Error fetching client projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
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
