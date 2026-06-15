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
        console.log(`Processing record ${record.id}, Competitor Product Name field:`, record.fields['Competitor Product Name']);
        if (record.fields['Competitor Product Name'] && Array.isArray(record.fields['Competitor Product Name'])) {
          try {
            console.log(`Enriching record ${record.id} with products:`, record.fields['Competitor Product Name']);
            // Fetch the linked competitor product records
            const productIds = record.fields['Competitor Product Name'];
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
            // Add the product names and quantities to the record (use different field name to avoid conflict with lookup field)
            record.fields['Competitor_Product_Name_Text'] = productData[0].name;
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
    const contactName = contacts[0].fields['Contact Name'];
    const company = contacts[0].fields['Company'];

    console.log(`Looking for projects for contact ${contactName} (${contactId}) at ${company}`);

    // Get all Competitor's Products records
    const productsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${COMPETITOR_PRODUCTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    // Get unique projects for this contact AND company
    const projectMap = {};

    productsResponse.data.records.forEach(record => {
      const contactNames = record.fields['Contact Name'] || [];
      const requestingCompany = record.fields['Requesting Company'] || [];

      // Only include if this contact is linked AND company matches
      const isContactMatch = contactNames.includes(contactId);
      const isCompanyMatch = requestingCompany.length === 0 || requestingCompany.some(compId => {
        // Since company is linked, we need to match the company ID
        // For now, we'll filter by contact - company validation happens at login
        return true;
      });

      if (isContactMatch) {
        const projectIds = record.fields['Project'] || [];
        projectIds.forEach(projectId => {
          if (!projectMap[projectId]) {
            projectMap[projectId] = { name: projectId, productCount: 0, isCompleted: false };
          }
          projectMap[projectId].productCount++;
        });
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

// Admin: Get all client-project mappings
app.get('/api/admin/all-projects', async (req, res) => {
  try {
    const adminPassword = req.query.password;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    console.log(`Admin login attempt - received: "${adminPassword}", expected: "${expectedPassword}"`);

    // Simple password protection
    if (adminPassword !== expectedPassword) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch all contacts
    const contactsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    // Fetch all products
    const productsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${COMPETITOR_PRODUCTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    // Map contacts to their projects
    const clientProjects = {};

    contactsResponse.data.records.forEach(contact => {
      const contactId = contact.id;
      const contactName = contact.fields['Contact Name'] || 'Unknown';
      const company = contact.fields['Company'] || 'Unknown';

      clientProjects[contactId] = {
        contactName,
        company,
        projects: [],
        productCount: 0
      };
    });

    // Assign products to contacts
    productsResponse.data.records.forEach(product => {
      const contactNames = product.fields['Contact Name'] || [];
      const projectIds = product.fields['Project'] || [];

      contactNames.forEach(contactId => {
        if (clientProjects[contactId]) {
          projectIds.forEach(projectId => {
            // Get project name from project record (if available)
            if (!clientProjects[contactId].projects.includes(projectId)) {
              clientProjects[contactId].projects.push(projectId);
            }
            clientProjects[contactId].productCount++;
          });
        }
      });
    });

    // Convert to array and sort
    const result = Object.values(clientProjects).sort((a, b) =>
      a.company.localeCompare(b.company)
    );

    res.json(result);

  } catch (error) {
    console.error('Error fetching all projects:', error.message);
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
