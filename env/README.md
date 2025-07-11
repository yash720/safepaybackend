# Environment Configuration

This folder contains all the environment configuration for the SafePay backend.

## Files

- `config.js` - Main configuration file that exports all environment variables
- `.env.example` - Example environment file template

## How to Use

1. **Copy the example file**: Copy `.env.example` to `.env` in the backend root directory
2. **Update values**: Modify the values in `.env` according to your environment
3. **Install dotenv**: Make sure you have the `dotenv` package installed

## Configuration Variables

### Server Configuration
- `PORT` - Backend server port (default: 6900)
- `FRONTEND_ORIGIN` - Frontend URL for CORS (default: http://localhost:5173)
- `CORS_ALLOW_ALL` - Set to 'true' to allow all origins (for production)

### External Services
- `VOICE_ANALYSIS_SERVICE` - AI voice analysis service URL (default: http://localhost:8082)
- `FLASK_SERVICE` - Flask OCR and text analysis service URL (default: http://localhost:5000)
- `FASTAPI_SERVICE` - FastAPI video and WhatsApp analysis service URL (default: http://localhost:8083)

### Database
- `MONGODB_URI` - MongoDB connection string

### API Keys
- `ASSEMBLY_API_KEY` - AssemblyAI API key for voice transcription

### Session Configuration
- `SESSION_SECRET` - Secret key for session encryption
- `SESSION_COOKIE_NAME` - Name of the session cookie
- `SESSION_TTL` - Session time-to-live in milliseconds

### File Upload
- `MAX_FILE_SIZE` - Maximum file size in bytes
- `UPLOADS_DIR` - Directory for file uploads

## Benefits

1. **Centralized Configuration**: All ports and URLs are in one place
2. **Environment Flexibility**: Easy to switch between development, staging, and production
3. **Security**: Sensitive data can be kept in environment variables
4. **Maintainability**: Easy to update service URLs without touching code

## Usage in Code

```javascript
const config = require('./env/config');

// Use configuration values
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
```

## CORS Configuration

For production, you can allow all origins by setting:
```
CORS_ALLOW_ALL=true
```

This will allow requests from any domain, which is useful for production deployments where you might have multiple frontend domains or mobile apps accessing the API. 