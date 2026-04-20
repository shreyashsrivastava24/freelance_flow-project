const express = require('express');
const Client = require('../models/Client');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all clients for user
router.get('/', auth, async (req, res) => {
  const clients = await Client.find({ user: req.user.id });
  res.json(clients);
});

// Add client
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, company, defaultHourlyRate } = req.body;
    
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
  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    req.body,
    { new: true }
  );
  res.json(client);
});

// Delete client
router.delete('/:id', auth, async (req, res) => {
  await Client.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;

