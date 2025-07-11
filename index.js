const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const User = require('./models/User');
const PaymentMethod = require('./models/PaymentMethod');
const ScamReport = require('./models/ScamReport');
const Transaction = require('./models/Transaction');
const MongoStore = require('connect-mongo');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const config = require('./env/config');

const app = express();

// --- BEGIN CORE MIDDLEWARE CONFIGURATION ---

// 1. CORS Middleware (MUST come before session middleware when using credentials)
app.use(cors({
  origin: config.CORS_ALLOW_ALL ? true : config.FRONTEND_ORIGIN, // Allow all origins in production
  credentials: true // Crucial: Allows cookies to be sent with cross-origin requests
}));

// 2. JSON Body Parser
app.use(express.json());

// 3. File Upload Middleware
// app.use(fileUpload({
//   limits: { fileSize: config.MAX_FILE_SIZE }, // Use config for file size
//   abortOnLimit: true,
//   responseOnLimit: 'File size limit has been reached',
//   useTempFiles: true,
//   tempFileDir: '/tmp/'
// }));

// MongoDB connection (moved up to be available for session store)
mongoose.connect(config.MONGODB_URI, {
})
.then(() => console.log('MongoDB connected successfully.'))
.catch(err => console.error('MongoDB connection error:', err));

// 3. Express Session Middleware
app.use(session({
  name: config.SESSION_COOKIE_NAME, // Use config for cookie name
  secret: config.SESSION_SECRET, // Use config for session secret
  resave: false,
  saveUninitialized: false,
  proxy: true,
  store: MongoStore.create({
    mongoUrl: config.MONGODB_URI, // Use config for MongoDB URI
    collectionName: 'sessions',
    ttl: config.SESSION_TTL // Use config for session TTL
  }),
  cookie: {
    maxAge: Number(config.SESSION_TTL) || 86400000, // Use config for cookie maxAge
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  }
}));

// Add a test middleware to confirm session is initialized
app.use((req, res, next) => {
  console.log('Middleware: Session ID on incoming request:', req.sessionID);
  console.log('Middleware: req.session initialized:', !!req.session);
  if (req.session && req.session.userId) {
    console.log('Middleware: req.session.userId:', req.session.userId);
  }
  next();
});

// --- END CORE MIDDLEWARE CONFIGURATION ---

// Login route
app.post('/login', async (req, res) => {
  const { phone } = req.body;
  console.log('Login attempt for phone:', phone);
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const user = await User.findOne({ phone });
    console.log('User found (null if not found): ', user);
    if (user) {
      req.session.userId = user._id; // Set user ID in session
      console.log('Login Success: Session userId set to: ', req.session.userId);
      res.json({ success: true, user });

    } else {
      // User not found, instruct frontend to redirect to signup
      console.log('User not found, redirecting to signup...');
      res.json({ exists: false, redirect: 'signup' });
    }
  } catch (err) {
    console.error('DB error during login:', err);
    res.status(500).json({ error: 'DB error', details: err.message });
  }
});

// Signup route
app.post('/signup', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'Phone and name required' });
  try {
    const newUser = await User.create({ phone, name });
    req.session.userId = newUser._id; // Set user ID in session
    console.log('Signup Success: Session userId set to: ', req.session.userId);
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error('Error during signup:', err); // Log the full error for debugging
    if (err.code === 11000) {
      // Duplicate key error (e.g., phone number already exists)
      res.status(400).json({ error: 'User with this phone number already exists.', details: err.message });
    } else {
      // Other database errors
      res.status(500).json({ error: 'Failed to create user due to a database error.', details: err.message });
    }
  }
});

// Profile route (protected)
app.get('/profile/:userId', async (req, res) => {
  console.log('Profile request received. Session userId: ', req.session.userId, 'Requested userId:', req.params.userId);
  
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    console.log('Profile: Session userId mismatch or missing.');
    return res.status(401).json({ error: 'Unauthorized', message: 'You are not authorized to view this profile or your session has expired.' });
  }

  try {
    const user = await User.findById(req.params.userId)
      .populate('paymentMethods') // Populate payment methods
      .populate('scamReports'); // Populate scam reports

    if (!user) {
      console.log('Profile: User not found for userId:', req.params.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('Profile: User data fetched successfully.');
    res.json({ user });
  } catch (err) {
    console.error('DB error during profile fetch:', err);
    res.status(500).json({ error: 'DB error', details: err.message });
  }
});

// Logout route
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('safepay.sid'); // Clear the specific session cookie name
    res.json({ success: true });
  });
});

// Update Profile route
app.put('/profile/:userId', async (req, res) => {
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { name, email, address, dob } = req.body;

  if (!name && !email && !address && !dob) {
    return res.status(400).json({ error: 'No fields to update provided' });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { name, email, address, dob } }, // Use $set to update specific fields
      { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('DB error during profile update:', err);
    res.status(500).json({ error: 'DB error', details: err.message });
  }
});

// Add Payment Method route
app.post('/api/payment-methods', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { type, name, upiId, cardNumber, expiryDate, accountNumber, ifscCode } = req.body;

  // --- DEBUG LOGS START ---
  console.log('--- Receiving Payment Method POST Request ---');
  console.log('Session User ID:', req.session.userId);
  console.log('Received Body:', req.body);
  // --- DEBUG LOGS END ---

  try {
    const newPaymentMethod = new PaymentMethod({
      userId: req.session.userId,
      type,
      name,
      upiId,
      cardNumber,
      expiryDate,
      accountNumber,
      ifscCode,
    });

    // --- DEBUG LOGS START ---
    console.log('PaymentMethod object before save:', newPaymentMethod);
    // --- DEBUG LOGS END ---

    await newPaymentMethod.save();

    // Update the User document with the new payment method reference
    await User.findByIdAndUpdate(
      req.session.userId,
      { $push: { paymentMethods: newPaymentMethod._id } },
      { new: true } // Return the updated user document (optional, but good practice)
    );

    // --- DEBUG LOGS START ---
    console.log('PaymentMethod saved successfully:', newPaymentMethod);
    // --- DEBUG LOGS END ---

    res.status(201).json({ success: true, method: newPaymentMethod });
  } catch (err) {
    console.error('Error adding payment method:', err);
    res.status(500).json({ error: 'Failed to add payment method', details: err.message });
  }
});

// Get Payment Methods for a user
app.get('/api/payment-methods/:userId', async (req, res) => {
  // Convert userId to string for proper comparison and security
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const paymentMethods = await PaymentMethod.find({ userId: req.params.userId });
    console.log(`Fetched ${paymentMethods.length} payment methods for user ${req.params.userId}`);
    res.json(paymentMethods);
  } catch (err) {
    console.error('Error fetching payment methods:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods', details: err.message });
  }
});

// Delete Payment Method
app.delete('/api/payment-methods/:methodId', async (req, res) => {
  try {
    const method = await PaymentMethod.findById(req.params.methodId);
    if (!method) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    // Ensure the method belongs to the logged-in user
    if (!req.session.userId || method.userId.toString() !== req.session.userId.toString()) {
      return res.status(401).json({ error: 'Unauthorized to delete this method' });
    }
    await PaymentMethod.findByIdAndDelete(req.params.methodId);
    res.json({ success: true, message: 'Payment method deleted successfully' });
  } catch (err) {
    console.error('Error deleting payment method:', err);
    res.status(500).json({ error: 'Failed to delete payment method', details: err.message });
  }
});

// Set Default Payment Method
app.post('/api/payment-methods/:userId/set-default/:methodId', async (req, res) => {
  // Convert userId to string for proper comparison
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // Unset current default for this user
    await PaymentMethod.updateMany({ userId: req.params.userId, isDefault: true }, { isDefault: false });

    // Set new default
    const updatedMethod = await PaymentMethod.findByIdAndUpdate(
      req.params.methodId,
      { isDefault: true },
      { new: true }
    );

    if (!updatedMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    res.json({ success: true, method: updatedMethod });
  } catch (err) {
    console.error('Error setting default payment method:', err);
    res.status(500).json({ error: 'Failed to set default payment method', details: err.message });
  }
});

// Add Scam Report route
app.post('/api/scam-reports', async (req, res) => {
  // Ensure user is logged in
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  // Validate required fields
  const { reportType, scamContact, scamPlatform, scamDetails } = req.body;
  if (!reportType || !scamDetails) {
    return res.status(400).json({ error: 'Missing required fields: reportType and scamDetails are required.' });
  }
  if (reportType !== 'other' && !scamContact) {
    return res.status(400).json({ error: 'Scam contact is required for this report type.' });
  }

  try {
    // Prepare new scam report
    const newScamReport = new ScamReport({
      userId: req.session.userId,
      reportType,
      scamContact: scamContact || null,
      scamPlatform: scamPlatform || null,
      scamDetails,
      // screenshot: not implemented yet
    });

    await newScamReport.save();

    // Link report to user
    await User.findByIdAndUpdate(
      req.session.userId,
      { $push: { scamReports: newScamReport._id } },
      { new: true }
    );

    res.status(201).json({ success: true, report: newScamReport });
  } catch (err) {
    console.error('Error adding scam report:', err);
    res.status(500).json({ error: 'Failed to add scam report', details: err.message });
  }
});

// Get Scam Reports for a user
app.get('/api/scam-reports/:userId', async (req, res) => {
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const scamReports = await ScamReport.find({ userId: req.params.userId }).sort({ createdAt: -1 }); // Sort by newest first
    res.json(scamReports);
  } catch (err) {
    console.error('Error fetching scam reports:', err);
    res.status(500).json({ error: 'Failed to fetch scam reports', details: err.message });
  }
});

// Process audio for voice analysis
const ASSEMBLY_API_KEY = config.ASSEMBLY_API_KEY;
app.post('/api/process-audio', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  // If transcript is sent directly (JSON)
  if (req.body && req.body.transcript) {
    try {
      // Call your AI service with the transcript
      const response = await axios.post(`${config.VOICE_ANALYSIS_SERVICE}/analyze-voice`, {
        transcript: req.body.transcript
      });
      
      // Return both transcript and analysis results
      return res.json({
        transcript: req.body.transcript,
        analysis: response.data
      });
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      return res.status(500).json({ error: 'Failed to analyze transcript', details: error.message });
    }
  }

  // AssemblyAI audio transcription
  const audioFile = req.files?.audio;
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, config.UPLOADS_DIR);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  // Save the audio file temporarily
  const uploadPath = path.join(uploadsDir, `${Date.now()}-${audioFile.name}`);
  await audioFile.mv(uploadPath);

  try {
    // 1. Upload audio to AssemblyAI
    const audioData = fs.readFileSync(uploadPath);
    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioData,
      {
        headers: {
          'authorization': ASSEMBLY_API_KEY,
          'transfer-encoding': 'chunked'
        }
      }
    );
    const audioUrl = uploadRes.data.upload_url;

    // 2. Request transcription
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url: audioUrl },
      { headers: { 'authorization': ASSEMBLY_API_KEY } }
    );
    const transcriptId = transcriptRes.data.id;

    // 3. Poll for completion
    let transcript;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollingRes = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { 'authorization': ASSEMBLY_API_KEY } }
      );
      if (pollingRes.data.status === 'completed') {
        transcript = pollingRes.data.text;
        break;
      } else if (pollingRes.data.status === 'failed') {
        throw new Error('Transcription failed');
      }
    }

    // Clean up temp file
    fs.unlinkSync(uploadPath);

    if (!transcript) {
      return res.status(500).json({ error: 'Transcription timed out' });
    }

    // 4. Run scam analysis on the transcribed text
    try {
      const analysisResponse = await axios.post(`${config.VOICE_ANALYSIS_SERVICE}/analyze-voice`, {
        transcript: transcript
      });
      
      // Return both transcript and analysis results
      return res.json({
        transcript: transcript,
        analysis: analysisResponse.data
      });
    } catch (analysisError) {
      console.error('Error analyzing transcribed text:', analysisError);
      // Return transcript even if analysis fails
      return res.json({
        transcript: transcript,
        analysis: {
          is_scam: false,
          confidence: 0,
          risk_score: 0,
          scam_type: null,
          scam_indicators: [],
          analysis_method: 'transcription_only'
        }
      });
    }

  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
    console.error('AssemblyAI error:', error);
    return res.status(500).json({ error: 'Failed to transcribe audio', details: error.message });
  }
});

// Process a new payment transaction
app.post('/api/transactions/process', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { fromUpiId, toUpiId, amount, status = 'success' } = req.body; // Default status to 'success' for now

  if (!fromUpiId || !toUpiId || !amount) {
    return res.status(400).json({ error: 'From UPI ID, To UPI ID, and Amount are required' });
  }

  try {
    // Generate a 12-digit random alphanumeric transaction ID
    const randomPart = (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)).substring(0, 12).toUpperCase();
    const transactionId = `TXN-${randomPart}`;

    const newTransaction = new Transaction({
      userId: req.session.userId,
      fromUpiId,
      toUpiId,
      amount,
      status,
      transactionId,
    });

    await newTransaction.save();
    console.log('Transaction saved successfully:', newTransaction);

    res.status(201).json({ success: true, transaction: newTransaction });
  } catch (err) {
    console.error('Error processing transaction:', err);
    res.status(500).json({ error: 'Failed to process transaction', details: err.message });
  }
});

// Get transaction history for a user
app.get('/api/transactions/:userId', async (req, res) => {
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ transactionDate: -1 });
    console.log(`Fetched ${transactions.length} transactions for user ${req.params.userId}`);
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions', details: err.message });
  }
});

// Test session routes (temporary for debugging)
app.get('/set-session', (req, res) => {
  req.session.test = 'Session is working!';
  res.json({ message: 'Session variable set' });
});

app.get('/get-session', (req, res) => {
  if (req.session.test) {
    res.json({ message: `Session variable: ${req.session.test}` });
  } else {
    res.status(404).json({ message: 'Session variable not found or session expired' });
  }
});

// Get MFA/SIM Swap settings for a user
app.get('/api/security/mfa-settings/:userId', async (req, res) => {
  if (!req.session.userId || req.session.userId.toString() !== req.params.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Dummy response for now (customize as needed)
  res.json({
    simSwapEnabled: false,
    lastChecked: null,
    mfaEnabled: false,
    mfaMethods: []
  });
});

// Proxy OCR Extract to Flask
app.post('/api/ocr-extract', multer().single('image'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('image', req.file.buffer, req.file.originalname);
    const flaskRes = await fetch(`${config.FLASK_SERVICE}/ocr-extract`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    const data = await flaskRes.json();
    res.status(flaskRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy OCR failed', details: err.message });
  }
});

// Proxy Analyze Text to Flask
app.post('/api/analyze-text', express.json(), async (req, res) => {
  try {
    const flaskRes = await fetch(`${config.FLASK_SERVICE}/predict-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await flaskRes.json();
    res.status(flaskRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy analyze failed', details: err.message });
  }
});

// Proxy Analyze Video to FastAPI video detection service
app.post('/api/analyze-video', multer().single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    const form = new FormData();
    // Send as 'video_file' to FastAPI
    form.append('video_file', req.file.buffer, req.file.originalname);
    const fastapiRes = await fetch(`${config.FASTAPI_SERVICE}/analyze-video`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    const data = await fastapiRes.json();
    res.status(fastapiRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy video analysis failed', details: err.message });
  }
});

const upload = multer();

app.post('/api/analyze-whatsapp', upload.single('screenshot'), async (req, res) => {
  try {
    const formData = new FormData();
    formData.append('screenshot', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    const response = await axios.post(`${config.FASTAPI_SERVICE}/analyze-whatsapp`, formData, {
      headers: formData.getHeaders(),
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze WhatsApp screenshot.' });
  }
});

// --- BEGIN UPI RISK CHECK ENDPOINT ---
/**
 * GET /api/upi/check/:upiId
 * Returns a dummy UPI risk analysis for the given UPI ID.
 * TODO: Connect to real risk analysis logic or database.
 */
app.get('/api/upi/check/:upiId', async (req, res) => {
  const { upiId } = req.params;
  // Dummy logic: mark as suspicious if contains 'fraud', else safe
  let riskLevel = 'Low';
  let riskPercentage = 10;
  let reports = 0;
  let reason = 'No suspicious activity detected.';
  let status = 'SAFE';

  if (upiId.toLowerCase().includes('fraud')) {
    riskLevel = 'High';
    riskPercentage = 90;
    reports = 5;
    reason = 'Reported for scam activity.';
    status = 'SCAM';
  } else if (upiId.toLowerCase().includes('test')) {
    riskLevel = 'Medium';
    riskPercentage = 50;
    reports = 1;
    reason = 'UPI ID flagged for review.';
    status = 'SUSPICIOUS';
  }

  res.json({
    upiId,
    riskPercentage,
    riskLevel,
    reports,
    reason,
    status
  });
});
// --- END UPI RISK CHECK ENDPOINT ---

// --- BEGIN DUMMY AI VALIDATE UPI ENDPOINT ---
app.post('/api/ai/validate-upi', async (req, res) => {
  // Always return safe for now
  res.json({
    is_suspicious: false,
    confidence: 0.1,
    flags: [],
    recommendation: 'Safe UPI ID'
  });
});
// --- END DUMMY AI VALIDATE UPI ENDPOINT ---

// --- BEGIN DUMMY ENHANCED FRAUD DETECTION ENDPOINT ---
app.post('/api/enhanced-fraud-detection', async (req, res) => {
  // Always return safe for now
  res.json({
    prediction: false,
    confidence: 0.1,
    message: 'No fraud detected',
    features: {},
    live_data: {},
    meta: { service: 'dummy-enhanced-fraud', latency_ms: 10 }
  });
});
// --- END DUMMY ENHANCED FRAUD DETECTION ENDPOINT ---

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Node.js backend running on port ${PORT}`);
});
