const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Controlled uploads directory for MVP prototype infrastructure
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/complaints');

// Ensure directory exists safely
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Permitted MIME types and mapped extensions
const ALLOWED_MIME_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const randomName = `complaint-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, randomName);
  }
});

const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Validate both MIME type and file extension
  const allowedExtensionsForMime = ALLOWED_MIME_TYPES[mime];
  const isMimeValid = Boolean(allowedExtensionsForMime);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);
  const isMatch = isMimeValid && isExtValid && allowedExtensionsForMime.includes(ext);

  if (isMimeValid && isExtValid && isMatch) {
    cb(null, true);
  } else {
    const detail = !isMimeValid
      ? `Unsupported file type: ${file.mimetype || 'unknown'}. Only JPEG, PNG, and WebP images are permitted.`
      : `File extension '${ext}' does not match content type '${file.mimetype}'. Only JPEG, PNG, and WebP images are permitted.`;
    const error = new Error(detail);
    error.status = 400;
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter
});

// Middleware wrapper that returns friendly HTTP 400 VALIDATION_ERROR for file issues
const handlePhotoUpload = (fieldName = 'photo') => {
  const uploadSingle = upload.single(fieldName);

  return (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const msg = 'Photo evidence exceeds maximum allowed size of 5MB.';
          return res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            error: msg,
            message: msg,
            details: [msg]
          });
        }
        if (err.code === 'INVALID_FILE_TYPE' || err.status === 400) {
          return res.status(400).json({
            success: false,
            code: 'VALIDATION_ERROR',
            error: err.message,
            message: err.message,
            details: [err.message]
          });
        }
        const errorMsg = `File upload error: ${err.message}`;
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          error: errorMsg,
          message: errorMsg,
          details: [errorMsg]
        });
      }
      next();
    });
  };
};

module.exports = {
  handlePhotoUpload,
  UPLOADS_DIR,
  ALLOWED_MIME_TYPES
};
