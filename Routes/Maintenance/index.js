const express = require("express");
const router = express.Router();


router.get('/', (req, res) => {
  res.json({ 
    maintenance: false,
    message: 'We are currently under maintenance. Please check back later.'
  });
});


module.exports = router;