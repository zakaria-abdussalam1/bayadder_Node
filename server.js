// backend/server.js
require('dotenv').config();
const express = require('express');
const pg = require('pg');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.bayadder.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new pg.Pool({
user: 'baydderc',
host: '127.0.0.1',
database: 'baydderc_bayadder',
password: 'DXtG9V2w4N',
port: 5432,
});

// Helper function to hash password
function hashPassword(password) {
return crypto.createHash('sha256').update(password).digest('hex');
}

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Helper function to get the full image URL
function getFullImageUrl(filename) {
    // In production, use the full domain
    if (process.env.NODE_ENV === 'production') {
        return `https://admin.bayadder.com/uploads/${filename}`;
    } else {
        // In development, you can keep the relative path or construct the full localhost URL
        // Since your frontend development code already handles localhost correctly, we can return the relative path
        return `/uploads/${filename}`;
    }
}

const upload = multer({ storage: storage });

// Authentication endpoint
app.post('/api/login', async (req, res) => {
try {
const { username, password } = req.body;

if (!username || !password) {
return res.status(400).json({ error: 'Username and password are required' });
}

const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);

if (result.rows.length === 0) {
return res.status(401).json({ error: 'Invalid username or password' });
}

const user = result.rows[0];
const hashedPassword = hashPassword(password);

if (user.password_hash !== hashedPassword) {
return res.status(401).json({ error: 'Invalid username or password' });
}

res.json({ success: true, message: 'Login successful' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Change password endpoint
app.post('/api/change-password', async (req, res) => {
try {
const { username, currentPassword, newPassword } = req.body;

if (!username || !currentPassword || !newPassword) {
return res.status(400).json({ error: 'Username, current password, and new password are required' });
}

const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);

if (result.rows.length === 0) {
return res.status(401).json({ error: 'Invalid username' });
}

const user = result.rows[0];
const hashedCurrentPassword = hashPassword(currentPassword);

if (user.password_hash !== hashedCurrentPassword) {
return res.status(401).json({ error: 'Current password is incorrect' });
}

const hashedNewPassword = hashPassword(newPassword);
await pool.query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hashedNewPassword, username]);

res.json({ success: true, message: 'Password changed successfully' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Sections API
app.get('/api/sections', async (req, res) => {
try {
const result = await pool.query('SELECT * FROM sections ORDER BY id');
res.json(result.rows);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.get('/api/sections/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const result = await pool.query('SELECT * FROM sections WHERE id = $1', [id]);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Section not found' });
}

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.post('/api/sections', upload.single('image'), async (req, res) => {
try {
const { title_en, title_ar, description_en, description_ar } = req.body;
const image = req.file ? getFullImageUrl(req.file.filename) : null;

if (!title_en && !title_ar) {
return res.status(400).json({ error: 'Title is required' });
}

const result = await pool.query(
'INSERT INTO sections (title_en, title_ar, description_en, description_ar, image) VALUES ($1, $2, $3, $4, $5) RETURNING *',
[title_en, title_ar, description_en, description_ar, image]
);

res.status(201).json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.put('/api/sections/:id', upload.single('image'), async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const { title_en, title_ar, description_en, description_ar } = req.body;

// Get current section to check if we need to update the image
const currentSection = await pool.query('SELECT * FROM sections WHERE id = $1', [id]);

if (currentSection.rows.length === 0) {
return res.status(404).json({ error: 'Section not found' });
}

let image = currentSection.rows[0].image;
if (req.file) {
image = getFullImageUrl(req.file.filename);
}

const result = await pool.query(
'UPDATE sections SET title_en = $1, title_ar = $2, description_en = $3, description_ar = $4, image = $5 WHERE id = $6 RETURNING *',
[title_en, title_ar, description_en, description_ar, image, id]
);

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.delete('/api/sections/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

// Check if section exists
const sectionCheck = await pool.query('SELECT * FROM sections WHERE id = $1', [id]);
if (sectionCheck.rows.length === 0) {
return res.status(404).json({ error: 'Section not found' });
}

await pool.query('DELETE FROM sections WHERE id = $1', [id]);
res.json({ success: true, message: 'Section deleted successfully' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Categories API
app.get('/api/categories', async (req, res) => {
try {
const result = await pool.query('SELECT * FROM categories ORDER BY id');
res.json(result.rows);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.get('/api/categories/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Category not found' });
}

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.post('/api/categories', upload.single('image'), async (req, res) => {
try {
const { title_en, title_ar, description_en, description_ar, section_id } = req.body;
const image = req.file ? getFullImageUrl(req.file.filename) : null;

if (!title_en && !title_ar) {
return res.status(400).json({ error: 'Title is required' });
}

if (!section_id) {
return res.status(400).json({ error: 'Section ID is required' });
}

const result = await pool.query(
'INSERT INTO categories (title_en, title_ar, description_en, description_ar, image, section_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
[title_en, title_ar, description_en, description_ar, image, section_id]
);

res.status(201).json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.put('/api/categories/:id', upload.single('image'), async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const { title_en, title_ar, description_en, description_ar, section_id } = req.body;

// Get current category to check if we need to update the image
const currentCategory = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);

if (currentCategory.rows.length === 0) {
return res.status(404).json({ error: 'Category not found' });
}

let image = currentCategory.rows[0].image;
if (req.file) {
image = getFullImageUrl(req.file.filename);
}

const result = await pool.query(
'UPDATE categories SET title_en = $1, title_ar = $2, description_en = $3, description_ar = $4, image = $5, section_id = $6 WHERE id = $7 RETURNING *',
[title_en, title_ar, description_en, description_ar, image, section_id, id]
);

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.delete('/api/categories/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

// Check if category exists
const categoryCheck = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
if (categoryCheck.rows.length === 0) {
return res.status(404).json({ error: 'Category not found' });
}

await pool.query('DELETE FROM categories WHERE id = $1', [id]);
res.json({ success: true, message: 'Category deleted successfully' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Products API
app.get('/api/products', async (req, res) => {
try {
const result = await pool.query('SELECT * FROM products ORDER BY id');
res.json(result.rows);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.get('/api/products/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Product not found' });
}

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.post('/api/products', upload.single('image'), async (req, res) => {
try {
const { title_en, title_ar, category_id } = req.body;
const image = req.file ? getFullImageUrl(req.file.filename) : null;

if (!title_en && !title_ar) {
return res.status(400).json({ error: 'Title is required' });
}

if (!category_id) {
return res.status(400).json({ error: 'Category ID is required' });
}

const result = await pool.query(
'INSERT INTO products (title_en, title_ar, image, category_id) VALUES ($1, $2, $3, $4) RETURNING *',
[title_en, title_ar, image, category_id]
);

res.status(201).json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const { title_en, title_ar, category_id } = req.body;

// Get current product to check if we need to update the image
const currentProduct = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

if (currentProduct.rows.length === 0) {
return res.status(404).json({ error: 'Product not found' });
}

let image = currentProduct.rows[0].image;
if (req.file) {
image = getFullImageUrl(req.file.filename);
}

const result = await pool.query(
'UPDATE products SET title_en = $1, title_ar = $2, image = $3, category_id = $4 WHERE id = $5 RETURNING *',
[title_en, title_ar, image, category_id, id]
);

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.delete('/api/products/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

// Check if product exists
const productCheck = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
if (productCheck.rows.length === 0) {
return res.status(404).json({ error: 'Product not found' });
}

await pool.query('DELETE FROM products WHERE id = $1', [id]);
res.json({ success: true, message: 'Product deleted successfully' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Company API
app.get('/api/company', async (req, res) => {
try {
const result = await pool.query('SELECT * FROM company ORDER BY id LIMIT 1');
if (result.rows.length === 0) {
// Return default company data if none exists
return res.json({
id: 1,
name_en: 'Bayaddrr',
name_ar: 'البيادر',
about_en: 'Leading the way in sustainable agriculture with innovative solutions for modern farming.',
about_ar: 'نقود الطريق نحو الزراعة المستدامة بحلول مبتكرة للزراعة الحديثة.',
about_paragraph1_en: 'Bayaddrr is a leading agricultural company dedicated to providing innovative solutions for modern farming. With years of experience in the industry, we understand the challenges faced by farmers and offer comprehensive solutions to enhance productivity and sustainability.',
about_paragraph1_ar: 'البيادر هي شركة زراعية رائدة مكرسة لتقديم حلول مبتكرة للزراعة الحديثة. مع سنوات من الخبرة في الصناعة، نفهم التحديات التي يواجهها المزارعون ونقدم حلولاً شاملة لتعزيز الإنتاجية والاستدامة.',
about_paragraph2_en: 'Our team of experts combines traditional farming knowledge with cutting-edge technology to deliver results that exceed expectations. We believe in building long-term relationships with our clients and supporting them throughout their agricultural journey.',
about_paragraph2_ar: 'يجمع فريقنا من الخبراء بين المعرفة الزراعية التقنية والتكنولوجيا المتطورة لتقديم نتائج تتجاوز التوقعات. نؤمن بإقامة علاقات طويلة الأمد مع عملائنا ودعمهم طوال رحلتهم الزراعية.',
email: 'info@bayadder.com',
phone: '+218 91-0029409',
address_en: 'Libya / Tripoli / Alnoufliyen',
address_ar: 'ليبيا / طرابلس / النوفليين'
});
}
res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.put('/api/company', async (req, res) => {
try {
const { name_en, name_ar, about_en, about_ar, about_paragraph1_en, about_paragraph1_ar, about_paragraph2_en, about_paragraph2_ar, email, phone, address_en, address_ar } = req.body;

// Check if company record exists
const companyCheck = await pool.query('SELECT * FROM company ORDER BY id LIMIT 1');

if (companyCheck.rows.length === 0) {
// Create new company record
const result = await pool.query(
'INSERT INTO company (name_en, name_ar, about_en, about_ar, about_paragraph1_en, about_paragraph1_ar, about_paragraph2_en, about_paragraph2_ar, email, phone, address_en, address_ar) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
[name_en, name_ar, about_en, about_ar, about_paragraph1_en, about_paragraph1_ar, about_paragraph2_en, about_paragraph2_ar, email, phone, address_en, address_ar]
);
res.json(result.rows[0]);
} else {
// Update existing company record
const id = companyCheck.rows[0].id;
const result = await pool.query(
'UPDATE company SET name_en = $1, name_ar = $2, about_en = $3, about_ar = $4, about_paragraph1_en = $5, about_paragraph1_ar = $6, about_paragraph2_en = $7, about_paragraph2_ar = $8, email = $9, phone = $10, address_en = $11, address_ar = $12 WHERE id = $13 RETURNING *',
[name_en, name_ar, about_en, about_ar, about_paragraph1_en, about_paragraph1_ar, about_paragraph2_en, about_paragraph2_ar, email, phone, address_en, address_ar, id]
);
res.json(result.rows[0]);
}
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Services API
app.get('/api/services', async (req, res) => {
try {
const result = await pool.query('SELECT * FROM services ORDER BY id');
res.json(result.rows);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.get('/api/services/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const result = await pool.query('SELECT * FROM services WHERE id = $1', [id]);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Service not found' });
}

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.post('/api/services', upload.single('image'), async (req, res) => {
try {
const { title_en, title_ar, description_en, description_ar } = req.body;
const image = req.file ? getFullImageUrl(req.file.filename) : null;

if (!title_en && !title_ar) {
return res.status(400).json({ error: 'Title is required' });
}

const result = await pool.query(
'INSERT INTO services (title_en, title_ar, description_en, description_ar, image) VALUES ($1, $2, $3, $4, $5) RETURNING *',
[title_en, title_ar, description_en, description_ar, image]
);

res.status(201).json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.put('/api/services/:id', upload.single('image'), async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

const { title_en, title_ar, description_en, description_ar } = req.body;

// Get current service to check if we need to update the image
const currentService = await pool.query('SELECT * FROM services WHERE id = $1', [id]);

if (currentService.rows.length === 0) {
return res.status(404).json({ error: 'Service not found' });
}

let image = currentService.rows[0].image;
if (req.file) {
image = getFullImageUrl(req.file.filename);
}

const result = await pool.query(
'UPDATE services SET title_en = $1, title_ar = $2, description_en = $3, description_ar = $4, image = $5 WHERE id = $6 RETURNING *',
[title_en, title_ar, description_en, description_ar, image, id]
);

res.json(result.rows[0]);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

app.delete('/api/services/:id', async (req, res) => {
try {
const id = parseInt(req.params.id);
if (isNaN(id)) {
return res.status(400).json({ error: 'Invalid ID' });
}

// Check if service exists
const serviceCheck = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
if (serviceCheck.rows.length === 0) {
return res.status(404).json({ error: 'Service not found' });
}

await pool.query('DELETE FROM services WHERE id = $1', [id]);
res.json({ success: true, message: 'Service deleted successfully' });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Server error' });
}
});

// Contact Form API
app.post('/api/contact', async (req, res) => {
  try {
    const { fullName, email, company, phone, message } = req.body;

    // Validate required fields
    if (!fullName || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and message are required'
      });
    }

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: 'info@bayadder.com',
      subject: `New Contact Form Submission from ${fullName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Full Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${company || 'Not provided'}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Message:</strong></p>
            <div style="background-color: white; padding: 15px; border-radius: 3px; border-left: 4px solid #007bff;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
          <p style="color: #666; font-size: 12px;">This message was sent from the Bayaddrr website contact form.</p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon!'
    });

  } catch (error) {
    console.error('Error sending contact email:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, there was an error sending your message. Please try again later.'
    });
  }
});

// Serve uploaded images
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));