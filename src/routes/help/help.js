const express = require('express');
const router = express.Router();

const fs = require("fs");

router.get('/', (req, res) => {
	res.sendFile("help.html", { root: __dirname });
});

module.exports = router;