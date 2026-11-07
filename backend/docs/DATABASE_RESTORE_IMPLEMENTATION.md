# Database Restore Implementation

## Overview
Database restore functionality has been successfully implemented to complement the existing backup system. Users can now restore their database from Google Drive backups or from uploaded backup files.

---

## What Was Implemented

### 1. Backend Implementation

#### **Google Drive Client Enhancement** (`utils/googleDrive.js`)
- Added `downloadFile(fileId)` method to download backup files from Google Drive
- Returns file contents as a Buffer for processing

#### **Backup Service** (`services/backup.service.js`)
Added three new functions:

1. **`restoreWithPsql(sqlBuffer)`**
   - Uses PostgreSQL's `psql` command to restore from a SQL dump
   - Executes restore in a single transaction for data integrity
   - Primary restoration method (fast and reliable)

2. **`restoreFromBuffer(buffer)`**
   - Handles both compressed (.gz) and uncompressed (.sql) backup files
   - Automatically detects gzip compression and decompresses if needed
   - Falls back to JavaScript-based restoration if psql is unavailable
   - Returns restoration status and method used

3. **`restoreFromDrive({ driveFileId, userId })`**
   - Downloads backup file from Google Drive
   - Restores the database
   - Logs the restoration action
   - Sends notifications to all stores
   - Returns success status with file details

#### **Backup Controller** (`controllers/backup.controller.js`)
Added two new endpoints:

1. **`POST /api/backups/restore/drive/:driveFileId`**
   - Restores database from a Google Drive backup
   - Requires Owner or Manager role
   - Runs restoration in the background (returns 202 Accepted)
   - Parameters: `driveFileId` in URL path

2. **`POST /api/backups/restore/upload`**
   - Restores database from an uploaded backup file
   - Accepts .sql, .sql.gz, or .gz files (max 500MB)
   - Uses multer for file upload handling
   - Requires Owner or Manager role
   - Runs restoration in the background (returns 202 Accepted)
   - Parameters: `backup_file` as multipart/form-data

#### **Routes** (`routes/backup.routes.js`)
- Added restore routes for both Drive and upload methods
- Both routes protected by authentication middleware

#### **Translations**
Added new translation keys in both English and Swahili:
- `restore_started` - Confirmation message when restore begins
- `drive_file_id_required` - Error when file ID is missing
- `backup_file_required` - Error when upload file is missing
- `database_restore_completed_msg` - Success notification
- `database_restore_failed_msg` - Failure notification

---

### 2. Frontend Implementation

#### **Integration Service** (`services/IntegrationsService.js`)
Added two new API functions:

1. **`restoreFromDrive(driveFileId)`**
   - Calls the restore endpoint for Google Drive backups
   - Returns API response with restoration status

2. **`restoreFromUpload(file)`**
   - Creates FormData and uploads backup file
   - Sets proper Content-Type headers for multipart upload
   - Returns API response with restoration status

#### **Integrations Page** (`pages/settings/IntegrationsPage.jsx`)
Enhanced the Google Drive Backup Card with:

**New State Variables:**
- `showRestoreDialog` - Controls restore dialog visibility
- `restoreMode` - Tracks restore type ('drive' or 'upload')
- `selectedBackup` - Stores selected backup for Drive restore
- `uploadFile` - Stores uploaded file for file restore
- `restoreConfirm` - Tracks user confirmation checkbox
- `restoring` - Tracks restoration progress

**New Functions:**
- `handleOpenRestoreDialog(mode)` - Opens restore dialog
- `handleCloseRestoreDialog()` - Closes and resets dialog
- `handleFileChange(e)` - Handles file selection
- `handleRestore()` - Executes the restoration process

**UI Enhancements:**
1. **Two Restore Buttons:**
   - "Restore from Google Drive" - Opens dialog to select from backup history
   - "Restore from File" - Opens dialog to upload a backup file
   - Both styled with orange theme to indicate caution

2. **Restore Dialog Modal:**
   - Warning message about data replacement
   - Dropdown to select backup (Drive mode) or file upload input (Upload mode)
   - Confirmation checkbox: "I understand that this will replace all data"
   - Cancel and Restore buttons
   - Shows file size for uploads
   - Prevents accidental restoration with multiple safeguards

#### **Translations**
Added frontend translations in both languages:
- `restore_database` - Dialog title
- `restore_from_drive` - Button text
- `restore_from_file` - Button text
- `restore_warning` - Warning message
- `restore_confirm` - Confirmation checkbox text
- `restore_started` - Success toast message
- `restore_failed` - Error toast message
- `restoring` - Loading state text
- `select_backup_file` - Selection prompt

---

## How to Use

### Restore from Google Drive
1. Navigate to **Settings → Integrations**
2. Scroll to the **Google Drive Backup** section
3. Click **"Restore from Google Drive"**
4. Select a backup from the dropdown (only successful backups are shown)
5. Check the confirmation checkbox
6. Click **"Restore Database"**
7. Wait for the restoration to complete (runs in background)

### Restore from File Upload
1. Navigate to **Settings → Integrations**
2. Scroll to the **Google Drive Backup** section
3. Click **"Restore from File"**
4. Click to select a backup file (.sql, .sql.gz, or .gz)
5. Check the confirmation checkbox
6. Click **"Restore Database"**
7. Wait for the restoration to complete (runs in background)

---

## Security & Permissions

- **Role Requirements:** Only Owner and Manager roles can restore databases
- **Authentication:** All restore endpoints require valid authentication token
- **File Validation:** 
  - File upload accepts only .sql, .sql.gz, and .gz files
  - Maximum file size: 500MB
  - Validates file exists before processing

---

## Technical Details

### Restoration Process
1. **Download/Receive:** File is downloaded from Drive or uploaded by user
2. **Decompression:** Automatically detects and decompresses gzipped files
3. **Validation:** Checks file format and integrity
4. **Execution:** Runs restoration using psql (or JavaScript fallback)
5. **Transaction:** All changes occur in a single transaction
6. **Logging:** Records restoration action in system logs
7. **Notification:** Sends success/failure notifications to all stores

### Error Handling
- Validates credentials and permissions before starting
- Uses transactions to ensure data integrity (rollback on failure)
- Logs all errors with detailed messages
- Provides user-friendly error messages via toast notifications
- Falls back to JavaScript-based restoration if psql is unavailable

### Background Processing
- Restorations run asynchronously to avoid request timeouts
- Returns 202 Accepted immediately
- User receives notification when restoration completes
- System logs track restoration progress and results

---

## Dependencies

### Already Installed
- **multer** (v2.1.1) - File upload handling (already in package.json)
- **pg** - PostgreSQL client
- **zlib** - Compression/decompression (Node.js built-in)

### System Requirements
- **psql** command-line tool (optional, falls back to JavaScript if not available)
- PostgreSQL database with connection string in `DATABASE_URL`
- Google Drive API credentials (for Drive restore)

---

## Testing Recommendations

1. **Test Restore from Google Drive:**
   - Create a test backup
   - Modify some data
   - Restore from the backup
   - Verify data is restored correctly

2. **Test Restore from File Upload:**
   - Download a backup file
   - Modify some data
   - Upload and restore the backup file
   - Verify data is restored correctly

3. **Test Error Scenarios:**
   - Try to restore without confirmation checkbox
   - Try to restore invalid file format
   - Test with missing permissions
   - Test with corrupted backup file

4. **Test Role Permissions:**
   - Verify only Owner/Manager can access restore
   - Test with other roles (should be blocked)

---

## Maintenance Notes

- Backup files in Google Drive are retained according to `BACKUP_RETENTION_DAYS` setting (default: 30 days)
- System logs track all restoration activities for audit purposes
- Notifications are sent to all stores on restore completion/failure
- Failed restorations are rolled back automatically (no partial data)

---

## Files Modified/Created

### Backend
- ✅ `utils/googleDrive.js` - Added downloadFile method
- ✅ `services/backup.service.js` - Added restore functions
- ✅ `controllers/backup.controller.js` - Added restore controllers
- ✅ `routes/backup.routes.js` - Added restore routes
- ✅ `locales/en.json` - Added English translations
- ✅ `locales/sw.json` - Added Swahili translations

### Frontend
- ✅ `services/IntegrationsService.js` - Added restore API calls
- ✅ `pages/settings/IntegrationsPage.jsx` - Added restore UI
- ✅ `lang/en.json` - Added English translations
- ✅ `lang/sw.json` - Added Swahili translations

---

## Summary

The database restore functionality is now fully operational and integrated with your existing backup system. Users can easily restore their database from either Google Drive backups or uploaded files through an intuitive interface with proper safeguards against accidental data loss.

All code follows the existing patterns in your codebase, includes proper error handling, and supports both English and Swahili languages. The implementation is secure, role-based, and logs all activities for audit purposes.
