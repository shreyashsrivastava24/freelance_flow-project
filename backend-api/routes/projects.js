const express = require('express');
const Project = require('../models/Project');
const Client = require('../models/Client');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all projects for user
router.get('/', auth, async (req, res) => {
  const projects = await Project.find({ user: req.user.id }).populate('client');
  res.json(projects);
});

// Add project
router.post('/', auth, async (req, res) => {
  try {
    const { client, name, status, budget } = req.body;
    const clientRecord = await Client.findOne({ _id: client, user: req.user.id });
    if (!clientRecord) {
      return res.status(404).json({ msg: 'Client not found for this account.' });
    }

    const normalizedStatus = typeof status === 'string' ? status.toLowerCase().replace(/\s+/g, '_') : undefined;
    const project = new Project({
      user: req.user.id,
      client,
      name,
      status: normalizedStatus || undefined,
      budget: Number(budget) || 0,
    });
    await project.save();
    res.json(await project.populate('client'));
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to create project.' });
  }
});

// Update project
router.put('/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.client) {
      const clientRecord = await Client.findOne({ _id: updates.client, user: req.user.id });
      if (!clientRecord) {
        return res.status(404).json({ msg: 'Client not found for this account.' });
      }
    }
    if (typeof updates.status === 'string') {
      updates.status = updates.status.toLowerCase().replace(/\s+/g, '_');
    }
    if ('budget' in updates) {
      updates.budget = Number(updates.budget) || 0;
    }
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updates,
      { new: true }
    ).populate('client');

    if (!project) {
      return res.status(404).json({ msg: 'Project not found.' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to update project.' });
  }
});

// Delete project
router.delete('/:id', auth, async (req, res) => {
  await Project.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;
