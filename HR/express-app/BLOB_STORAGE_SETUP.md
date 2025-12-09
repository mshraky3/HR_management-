# Vercel Blob Storage Setup Guide

This document explains how to set up and verify Vercel Blob Storage for the document system.

## Prerequisites

1. A Vercel account
2. A Vercel project with Blob Storage enabled
3. `@vercel/blob` package installed (already in package.json)

## Setup Steps

### 1. Create Blob Store in Vercel

1. Go to your Vercel project dashboard
2. Navigate to the **Storage** tab
3. Click **Create New** under **Blob**
4. Give your Blob store a name (e.g., "hr-documents")
5. Select the environments where you want the read-write token included (Production, Preview, Development)
6. Click **Create**

Vercel will automatically add the `BLOB_READ_WRITE_TOKEN` environment variable to your project.

### 2. Configure Local Development

For local development, you need to pull the environment variables from Vercel:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Link your project (if not already linked)
vercel link

# Pull environment variables (including BLOB_READ_WRITE_TOKEN)
vercel env pull
```

This will create/update a `.env` file in your `express-app` directory with all environment variables, including `BLOB_READ_WRITE_TOKEN`.

### 3. Verify Configuration

The system will automatically check for `BLOB_READ_WRITE_TOKEN` when uploading files. If it's missing, you'll get a clear error message.

To manually verify:

```javascript
import { isBlobStorageConfigured } from './utils/blobStorage.js';

if (isBlobStorageConfigured()) {
  console.log('✅ Blob Storage is configured');
} else {
  console.error('❌ BLOB_READ_WRITE_TOKEN is not set');
}
```

## How It Works

### Automatic Token Detection

The `@vercel/blob` package automatically reads `BLOB_READ_WRITE_TOKEN` from `process.env`. Our code explicitly passes it for clarity and better error handling.

### File Upload Flow

1. File is received via multer (memory storage)
2. File buffer is validated
3. Unique filename is generated
4. File is uploaded to Vercel Blob Storage using `put()`
5. Blob URL is returned and stored in database

### File Access

- All files are uploaded with `access: 'public'` for easy access
- Files can be accessed directly via their blob URLs
- No additional authentication needed for public files

## File Organization

Files are organized in Blob Storage as follows:

- **Employee Documents**: `employees/{employeeId}/{documentType}/{filename}`
- **Branch Documents**: `branches/{branchId}/{documentType}/{filename}`
- **Notification Attachments**: `notifications/{notificationId}/attachments/{filename}`

## Error Handling

The system includes comprehensive error handling:

- **Configuration Errors**: Clear messages if `BLOB_READ_WRITE_TOKEN` is missing
- **Upload Errors**: Detailed error messages with context
- **Validation Errors**: Input validation before upload attempts

## Testing

To test the Blob Storage setup:

1. Ensure `BLOB_READ_WRITE_TOKEN` is set in your environment
2. Try uploading a document through the application
3. Check the console for any errors
4. Verify the file is accessible via the returned blob URL

## Troubleshooting

### Error: "BLOB_READ_WRITE_TOKEN is not configured"

**Solution**: 
- Run `vercel env pull` to get environment variables
- Or manually add `BLOB_READ_WRITE_TOKEN=your_token_here` to your `.env` file

### Error: "Failed to upload file to Blob"

**Possible Causes**:
- Invalid token
- Network issues
- File size exceeds limits
- Invalid file type

**Solution**:
- Verify token is correct
- Check network connection
- Verify file size and type restrictions

### Files not accessible

**Solution**:
- Ensure files are uploaded with `access: 'public'`
- Check blob URL is correctly stored in database
- Verify blob URL format is correct

## Environment Variables

Required environment variable:

- `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob Storage read-write token

This is automatically set in Vercel deployments. For local development, use `vercel env pull` to get it.

## Security Notes

- The `BLOB_READ_WRITE_TOKEN` provides full read/write access to your Blob store
- Keep it secure and never commit it to version control
- Use different tokens for different environments if needed
- Public files are accessible to anyone with the URL (by design for this use case)

