const express = require('express');
const router = express.Router();
const { getDatabaseStatus } = require('../controllers/systemController');

router.get('/database', getDatabaseStatus);

module.exports = router;
