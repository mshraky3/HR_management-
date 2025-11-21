# API Configuration Guide

## Quick Setup

The API URL is configured in `src/config/api.js`. You have three ways to set it:

### Method 1: Change CURRENT setting (Easiest)

Edit `src/config/api.js` and change:

```javascript
CURRENT: "LOCAL"; // Change to 'PRODUCTION' for production
```

### Method 2: Use Environment Variable (Recommended for production)

Create a `.env` file in `react-app/` directory:

```env
VITE_API_URL=https://your-production-api-url.com
```

### Method 3: Update PRODUCTION URL

Edit `src/config/api.js` and update:

```javascript
PRODUCTION: "https://your-production-api-url.com";
```

Then set `CURRENT: 'PRODUCTION'`

## Priority Order

1. **Environment Variable** (`VITE_API_URL` from `.env` file) - Highest priority
2. **CURRENT setting** in `api.js` config
3. **Default LOCAL** - Fallback

## Examples

### Local Development

```javascript
CURRENT: "LOCAL"; // Uses http://localhost:3000
```

### Production

```javascript
CURRENT: "PRODUCTION"; // Uses your PRODUCTION URL
```

Or use `.env`:

```env
VITE_API_URL=https://api.yourdomain.com
```

## Notes

- The config file is automatically imported by `src/utils/api.js`
- All API calls use this centralized URL
- No need to change URLs in multiple files
- Environment variables override the config file
