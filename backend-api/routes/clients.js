const express = require('express');
const Client = require('../models/Client');
const User = require('../models/User');
const auth = require('../middleware/auth');
const store = require('../devStore');
const router = express.Router();

// Get all clients for user
router.get('/', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    return res.json(state.clients.filter((client) => client.user === req.user.id));
  }

  const clients = await Client.find({ user: req.user.id });
  res.json(clients);
});

// Add client
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, company, defaultHourlyRate } = req.body;

    if (req.useDevStore) {
      const state = store.read();
      const user = state.users.find((item) => item._id === req.user.id);
      if (!user) return res.status(401).json({ msg: 'User account not found.' });
      if (user.tier !== 'pro') {
        const clientCount = state.clients.filter((client) => client.user === req.user.id).length;
        if (clientCount >= 2) {
          return res.status(403).json({ msg: 'Free tier limit reached. Max 2 clients allowed. Upgrade to Pro for unlimited clients.' });
        }
      }
      const client = {
        _id: store.id(),
        user: req.user.id,
        name,
        email,
        phone,
        company,
        defaultHourlyRate: Number(defaultHourlyRate) || 0,
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      state.clients.push(client);
      store.write(state);
      return res.json(client);
    }
    
    // Check freemium limit
    const user = await User.findById(req.user.id);
    if (user.tier !== 'pro') {
      const clientCount = await Client.countDocuments({ user: req.user.id });
      if (clientCount >= 2) {
        return res.status(403).json({ msg: 'Free tier limit reached. Max 2 clients allowed. Upgrade to Pro for unlimited clients.' });
      }
    }

    const client = new Client({
      user: req.user.id,
      name,
      email,
      phone,
      company,
      defaultHourlyRate: Number(defaultHourlyRate) || 0,
    });
    await client.save();
    res.json(client);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to create client.' });
  }
});

// Update client
router.put('/:id', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    const client = state.clients.find((item) => item._id === req.params.id && item.user === req.user.id);
    if (!client) return res.status(404).json({ msg: 'Client not found.' });
    Object.assign(client, req.body, { updatedAt: store.nowIso() });
    if ('defaultHourlyRate' in client) client.defaultHourlyRate = Number(client.defaultHourlyRate) || 0;
    store.write(state);
    return res.json(client);
  }

  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    req.body,
    { new: true }
  );
  res.json(client);
});

// Delete client
router.delete('/:id', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    state.clients = state.clients.filter((item) => !(item._id === req.params.id && item.user === req.user.id));
    store.write(state);
    return res.json({ msg: 'Deleted' });
  }

  await Client.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;
