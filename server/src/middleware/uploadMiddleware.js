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
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || '.jpg';
    const randomName = `complaint-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, randomName);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    const error = new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are permitted.`);
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

// Middleware wrapper that returns friendly HTTP 400 errors for file issues
const handlePhotoUpload = (fieldName = 'photo') => {
  const uploadSingle = upload.single(fieldName);

  return (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'Photo evidence exceeds maximum allowed size of 5MB.'
          });
        }
        if (err.code === 'INVALID_FILE_TYPE' || err.status === 400) {
          return res.status(400).json({
            success: false,
            error: err.message
          });
        }
        return res.status(400).json({
          success: false,
          error: `File upload error: ${err.message}`
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
