/**
 * Phone Number Validation and Normalization Utilities
 * Formats Indian mobile numbers to canonical E.164 (+91XXXXXXXXXX)
 */

const validateAndNormalizeIndianPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Phone number is required.' };
  }
  // Remove whitespace, hyphens, parentheses, dots
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, '');
  const indianMobileRegex = /^(?:\+91|91|0)?([6-9]\d{9})$/;
  const match = stripped.match(indianMobileRegex);
  if (!match) {
    return {
      valid: false,
      error: 'Please enter a valid 10-digit Indian mobile number (e.g., 9845012345 or +91 98450 12345).'
    };
  }
  const tenDigit = match[1];
  const normalized = `+91${tenDigit}`;
  return { valid: true, normalized };
};

module.exports = {
  validateAndNormalizeIndianPhone
};
