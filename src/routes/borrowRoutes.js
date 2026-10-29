const express = require('express');
const {
  borrowBook, returnBook, myBorrows, allBorrows,
} = require('../controllers/borrowController');
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/my', auth, myBorrows);
router.get('/', auth, role('admin'), allBorrows);
router.post('/:bookId', auth, borrowBook);
router.patch('/:id/return', auth, returnBook);

module.exports = router;