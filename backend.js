const express = require('express');
const cors = require('cors');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const BASE_ID = 'appLZ8hWsuUjHL2z9';
const TABLE_ID = 'tbl7IAdi7m8mV7KOU'; // My Product Suggestions
const COMPETITOR_PRODUCTS_TABLE_ID = 'tbltrtUEkRnX3uLOh'; // Competitor's Products
const CONTACTS_TABLE_ID = 'tblSPtl75lcRjeLuP'; // My Contacts
const PROJECTS_TABLE_ID = 'tblyWGaaUBCnXJKeu'; // Projects

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
                  quantity: linkedResponse.data.fields['Quantity'] || 1,
                  notes: linkedResponse.data.fields['Notes'] || '',
                  size: linkedResponse.data.fields['Size'] || ''
                };
              })
            );

            console.log(`Enriched product data for ${record.id}:`, productData);
            // Add the product names, quantities, notes, and size to the record (use different field name to avoid conflict with lookup field)
            record.fields['Competitor_Product_Name_Text'] = productData[0].name;
            record.fields['Competitor Product Quantity'] = productData[0].quantity;
            record.fields['Competitor_Product_Notes'] = productData[0].notes;
            record.fields['Competitor_Product_Size'] = productData[0].size;
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

    // Fetch all projects to map IDs to names
    const projectsTableResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/Projects`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    const projectMap = {};
    projectsTableResponse.data.records.forEach(proj => {
      projectMap[proj.id] = proj.fields['Project Name'] || proj.id;
    });
    console.log(`Loaded ${Object.keys(projectMap).length} projects`);

    // Get all Competitor's Products records
    const productsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${COMPETITOR_PRODUCTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    // Get unique projects for this contact
    const clientProjectMap = {};

    console.log(`DEBUG: Looking for products where Requesting Company = ${contactId}`);
    let matchCount = 0;

    productsResponse.data.records.forEach((record, index) => {
      const requestingCompanyIds = record.fields['Requesting Company'] || [];

      // Only include if this contact is the requesting company (linked field)
      const isContactMatch = requestingCompanyIds.includes(contactId);

      if (isContactMatch) {
        matchCount++;
        const projectIds = record.fields['Project'] || [];
        projectIds.forEach(projectId => {
          const projectName = projectMap[projectId] || projectId;
          if (!clientProjectMap[projectId]) {
            clientProjectMap[projectId] = { name: projectName, productCount: 0, isCompleted: false };
          }
          clientProjectMap[projectId].productCount++;
        });
      }
    });

    console.log(`DEBUG: Total matches for ${contactId}: ${matchCount}`);

    // Convert to array and sort
    const projects = Object.values(clientProjectMap).sort((a, b) => a.name.localeCompare(b.name));
    console.log(`Found ${projects.length} projects for ${company}`);

    res.json(projects);

  } catch (error) {
    console.error('Error fetching client projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get all projects with types (admin view)
app.get('/api/all-projects-with-types', async (req, res) => {
  try {
    // Fetch all projects to map IDs to names and types
    const projectsTableResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/Projects`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    const projects = projectsTableResponse.data.records.map(proj => ({
      name: proj.fields['Project Name'] || proj.id,
      projectType: proj.fields['Project Type'] || 'Comparison'
    })).sort((a, b) => a.name.localeCompare(b.name));

    res.json(projects);

  } catch (error) {
    console.error('Error fetching all projects with types:', error.message);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get client projects with their types (for routing to correct dashboard)
app.get('/api/client-projects-with-types', async (req, res) => {
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

    // Fetch all projects to map IDs to names and types
    const projectsTableResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    const projectMap = {};
    projectsTableResponse.data.records.forEach(proj => {
      projectMap[proj.id] = {
        name: proj.fields['Project Name'] || proj.id,
        type: proj.fields['Project Type'] || 'Comparison'
      };
    });

    // Get projects associated with this contact from Projects table
    const clientProjects = [];

    projectsTableResponse.data.records.forEach((proj) => {
      const contactPersonIds = proj.fields['Contact Person'] || [];
      const isContactMatch = contactPersonIds.includes(contactId);

      if (isContactMatch) {
        clientProjects.push({
          name: proj.fields['Project Name'] || proj.id,
          projectType: proj.fields['Project Type'] || 'Comparison'
        });
      }
    });

    // Sort by project name
    const projects = clientProjects.sort((a, b) => a.name.localeCompare(b.name));

    res.json(projects);

  } catch (error) {
    console.error('Error fetching client projects with types:', error.message);
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

    // Fetch projects to map IDs to names
    const projectsResponse = await axios.get(
      `https://api.airtable.com/v0/${BASE_ID}/Projects`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`
        }
      }
    );

    const projectIdToName = {};
    projectsResponse.data.records.forEach(proj => {
      projectIdToName[proj.id] = proj.fields['Project Name'] || proj.id;
    });

    // Assign products to contacts
    productsResponse.data.records.forEach(product => {
      const requestingCompanyIds = product.fields['Requesting Company'] || [];
      const projectIds = product.fields['Project'] || [];

      requestingCompanyIds.forEach(contactId => {
        // Contact ID directly matches the key in clientProjects
        if (clientProjects[contactId]) {
          projectIds.forEach(projectId => {
            const projectName = projectIdToName[projectId] || projectId;
            if (!clientProjects[contactId].projects.includes(projectName)) {
              clientProjects[contactId].projects.push(projectName);
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

// Generate summary PDF and send emails
app.post('/api/generate-summary', async (req, res) => {
  try {
    const { project, selectedProducts, contactName, company, email, totals } = req.body;

    if (!selectedProducts || selectedProducts.length === 0) {
      return res.status(400).json({ error: 'No products selected' });
    }

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);

      // Send emails
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        });

        const emailContent = `
Hello ${contactName},

Your product comparison summary for project "${project}" is attached.

Selected Products: ${selectedProducts.length}
Your Total: $${totals.yourTotal.toFixed(2)}
Competitor Total: $${totals.competitorTotal.toFixed(2)}
Total Savings: $${totals.savings.toFixed(2)} (${totals.savingsPercent}%)

Thank you for using our service.

Best regards,
Benard Chedid
Construction Collection
        `;

        // Email to client
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: `Product Summary - ${project}`,
          text: emailContent,
          attachments: [{
            filename: `summary_${project}.pdf`,
            content: pdfBuffer
          }]
        });

        // Email to Benard
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: `[NEW] Product Summary from ${contactName} - ${company}`,
          text: `${contactName} from ${company} (${email}) has submitted a product summary for project: ${project}\n\n${emailContent}`,
          attachments: [{
            filename: `summary_${project}_${contactName}.pdf`,
            content: pdfBuffer
          }]
        });

        console.log(`Summary emails sent for ${project} to ${email} and benard@constructioncollection.com.au`);
      } catch (emailError) {
        console.error('Email error:', emailError.message);
        // Don't fail the request if email fails - PDF is still valid
      }

      // Return PDF for download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="summary_${project}.pdf"`);
      res.send(pdfBuffer);
    });

    // Build PDF content
    doc.fontSize(24).font('Helvetica-Bold').text('Product Summary', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).font('Helvetica').text(`Project: ${project}`, { underline: true });
    doc.text(`Contact: ${contactName}`);
    doc.text(`Company: ${company}`);
    doc.text(`Email: ${email}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    doc.fontSize(14).font('Helvetica-Bold').text('Selected Products', { underline: true });
    doc.moveDown(0.5);

    selectedProducts.forEach((product, idx) => {
      doc.fontSize(11).font('Helvetica-Bold').text(`${idx + 1}. ${product.name}`);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Group: ${product.groupName}`);
      if (product.room) doc.text(`Room: ${product.room}`);
      doc.text(`Quantity: ${product.quantity}`);
      doc.text(`Your Price per Unit: $${product.myPrice.toFixed(2)}`);
      doc.text(`Competitor Price per Unit: $${product.competitorPrice.toFixed(2)}`);
      doc.text(`Your Total: $${product.myTotal.toFixed(2)}`);
      doc.text(`Competitor Total: $${product.competitorTotal.toFixed(2)}`);
      if (product.myNotes) doc.text(`My Notes: ${product.myNotes}`);
      if (product.competitorNotes) doc.text(`Notes: ${product.competitorNotes}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Summary Totals', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Your Total: $${totals.yourTotal.toFixed(2)}`);
    doc.text(`Competitor Total: $${totals.competitorTotal.toFixed(2)}`);
    doc.text(`Total Savings: $${totals.savings.toFixed(2)} (${totals.savingsPercent}%)`);

    doc.end();
  } catch (error) {
    console.error('Error generating summary:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
