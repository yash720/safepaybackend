// Load environment variables from .env file
require('dotenv').config();

// Environment Configuration for SafePay Backend
// All ports and URLs are centralized here for easy management

module.exports = {
  // Backend server port
  PORT: process.env.PORT || 6900,
  
  // Frontend origin for CORS
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  
  // CORS Configuration - Allow all origins in production
  CORS_ALLOW_ALL: process.env.CORS_ALLOW_ALL === 'true' || false,
  
  // AI Voice Analysis Service
  VOICE_ANALYSIS_SERVICE: process.env.VOICE_ANALYSIS_SERVICE || 'http://localhost:8082',
  
  // Flask OCR and Text Analysis Service
  FLASK_SERVICE: process.env.FLASK_SERVICE || 'http://localhost:5000',
  
  // FastAPI Video and WhatsApp Analysis Service
  FASTAPI_SERVICE: process.env.FASTAPI_SERVICE || 'http://localhost:8083',
  
  // MongoDB Connection String
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://yashsajwan2004:1NV2Y7QwL6YU8nEF@cluster0.ycb55bx.mongodb.net/',
  
  // AssemblyAI API Key
  ASSEMBLY_API_KEY: process.env.ASSEMBLY_API_KEY || 'd328086b73264cd39534ba4e82a1046f',
  
  // Session Configuration
  SESSION_SECRET: process.env.SESSION_SECRET || 'd01c0b3a3c9b7e7a7f4a2b9d8e6c5a4f3b2c1d0e9a8f7b6a5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3d3b2c1d0e9a8f7b6a5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3',
  
  // Session Cookie Name
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'safepay.sid',
  
  // Session TTL (24 hours in milliseconds)
  SESSION_TTL: process.env.SESSION_TTL || 1000 * 60 * 60 * 24,
  
  // File Upload Configuration
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024, // 5MB
  UPLOADS_DIR: process.env.UPLOADS_DIR || 'uploads'
}; 