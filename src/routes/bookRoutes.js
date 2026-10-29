const express = require('express');
const {
  getBooks, getBook, createBook, updateBook, deleteBook,
} = require('../controllers/bookController');
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/', auth, getBooks);
router.get('/:id', auth, getBook);

router.post('/', auth, role('admin'), createBook);
router.put('/:id', auth, role('admin'), updateBook);
router.delete('/:id', auth, role('admin'), deleteBook);

module.exports = router;