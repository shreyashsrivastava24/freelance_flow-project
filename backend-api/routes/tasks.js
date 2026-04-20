const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all tasks for user
router.get('/', auth, async (req, res) => {
  const tasks = await Task.find({ user: req.user.id }).populate('project');
  res.json(tasks);
});

// Add task
router.post('/', auth, async (req, res) => {
  try {
    const { project, title, dueDate, completed } = req.body;
    const projectRecord = await Project.findOne({ _id: project, user: req.user.id });
    if (!projectRecord) {
      return res.status(404).json({ msg: 'Project not found for this account.' });
    }

    const task = new Task({
      user: req.user.id,
      project,
      title,
      dueDate,
      completed,
    });
    await task.save();
    res.json(await task.populate('project'));
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to create task.' });
  }
});

// Update task
router.put('/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.project) {
      const projectRecord = await Project.findOne({ _id: updates.project, user: req.user.id });
      if (!projectRecord) {
        return res.status(404).json({ msg: 'Project not found for this account.' });
      }
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updates,
      { new: true }
    ).populate('project');
    if (!task) {
      return res.status(404).json({ msg: 'Task not found.' });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to update task.' });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  await Task.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;
