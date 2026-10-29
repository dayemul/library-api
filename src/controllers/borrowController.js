const pool = require('../config/db');

exports.borrowBook = async (req, res) => {
  const bookId = parseInt(req.params.bookId);
  if (isNaN(bookId)) return res.status(400).json({ message: 'Invalid book id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // row lock: ek shathe duijon borrow korle stock minus e jabe na
    const book = await client.query('SELECT * FROM books WHERE id = $1 FOR UPDATE', [bookId]);
    if (book.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Book not found' });
    }
    if (book.rows[0].stock <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Book is out of stock' });
    }

    const active = await client.query(
      'SELECT id FROM borrows WHERE user_id = $1 AND book_id = $2 AND returned_at IS NULL',
      [req.user.id, bookId]
    );
    if (active.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already borrowed this book' });
    }

    await client.query('UPDATE books SET stock = stock - 1 WHERE id = $1', [bookId]);
    const borrow = await client.query(
      'INSERT INTO borrows (user_id, book_id) VALUES ($1, $2) RETURNING *',
      [req.user.id, bookId]
    );

    await client.query('COMMIT');
    res.status(201).json(borrow.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

exports.returnBook = async (req, res) => {
  const borrowId = parseInt(req.params.id);
  if (isNaN(borrowId)) return res.status(400).json({ message: 'Invalid borrow id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const borrow = await client.query('SELECT * FROM borrows WHERE id = $1 FOR UPDATE', [borrowId]);
    const record = borrow.rows[0];

    if (!record) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Borrow record not found' });
    }
    if (record.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'This is not your borrow record' });
    }
    if (record.returned_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Book already returned' });
    }

    const updated = await client.query(
      'UPDATE borrows SET returned_at = NOW() WHERE id = $1 RETURNING *',
      [borrowId]
    );
    await client.query('UPDATE books SET stock = stock + 1 WHERE id = $1', [record.book_id]);

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

exports.myBorrows = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT br.id, br.borrowed_at, br.returned_at, b.id AS book_id, b.title, b.author
       FROM borrows br
       JOIN books b ON b.id = br.book_id
       WHERE br.user_id = $1
       ORDER BY br.borrowed_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.allBorrows = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const total = parseInt((await pool.query('SELECT COUNT(*) FROM borrows')).rows[0].count);
    const result = await pool.query(
      `SELECT br.id, br.borrowed_at, br.returned_at,
              u.id AS user_id, u.name AS user_name, u.email,
              b.id AS book_id, b.title
       FROM borrows br
       JOIN users u ON u.id = br.user_id
       JOIN books b ON b.id = br.book_id
       ORDER BY br.borrowed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};