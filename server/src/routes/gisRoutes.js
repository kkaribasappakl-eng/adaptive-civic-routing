const express = require('express');
const router = express.Router();
const { testPointInPolygon } = require('../controllers/gisController');

router.get('/test', testPointInPolygon);

module.exports = router;
