const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const store = require('../devStore');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    if (req.useDevStore) {
      const state = store.read();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (state.users.some((item) => item.email === normalizedEmail)) {
        return res.status(400).json({ msg: 'User already exists' });
      }
      const hashed = await bcrypt.hash(password, 10);
      state.users.push({
        _id: store.id(),
        id: undefined,
        email: normalizedEmail,
        password: hashed,
        name,
        tier: 'free',
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      });
      store.write(state);
      return res.json({ msg: 'Registered successfully' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });
    const hashed = await bcrypt.hash(password, 10);
    user = new User({ email, password: hashed, name });
    await user.save();
    res.json({ msg: 'Registered successfully' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (req.useDevStore) {
      const state = store.read();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const user = state.users.find((item) => item.email === normalizedEmail);
      if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).json({ msg: 'Invalid credentials' });
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
      return res.json({
        token,
        user: { id: user._id, email: user.email, name: user.name, tier: user.tier },
      });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name, tier: user.tier } });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Toggle Tier
router.post('/toggle-tier', auth, async (req, res) => {
  try {
    if (req.useDevStore) {
      const state = store.read();
      const user = state.users.find((item) => item._id === req.user.id);
      if (!user) return res.status(404).json({ msg: 'User not found' });
      user.tier = user.tier === 'pro' ? 'free' : 'pro';
      user.updatedAt = store.nowIso();
      store.write(state);
      return res.json({ user: { id: user._id, email: user.email, name: user.name, tier: user.tier } });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    user.tier = user.tier === 'pro' ? 'free' : 'pro';
    await user.save();
    res.json({ user: { id: user._id, email: user.email, name: user.name, tier: user.tier } });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
