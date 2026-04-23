const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const store = require('../devStore');
const router = express.Router();

// Get all tasks for user
router.get('/', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    return res.json(
      state.tasks
        .filter((task) => task.user === req.user.id)
        .map((task) => store.populateProject(task, state))
    );
  }

  const tasks = await Task.find({ user: req.user.id }).populate('project');
  res.json(tasks);
});

// Add task
router.post('/', auth, async (req, res) => {
  try {
    const { project, title, dueDate, completed } = req.body;
    if (req.useDevStore) {
      const state = store.read();
      const projectRecord = state.projects.find((item) => item._id === project && item.user === req.user.id);
      if (!projectRecord) {
        return res.status(404).json({ msg: 'Project not found for this account.' });
      }
      const task = {
        _id: store.id(),
        user: req.user.id,
        project,
        title,
        dueDate: dueDate || null,
        completed: Boolean(completed),
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      state.tasks.push(task);
      store.write(state);
      return res.json(store.populateProject(task, state));
    }

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
    if (req.useDevStore) {
      const state = store.read();
      const task = state.tasks.find((item) => item._id === req.params.id && item.user === req.user.id);
      if (!task) return res.status(404).json({ msg: 'Task not found.' });
      if (updates.project) {
        const projectRecord = state.projects.find((item) => item._id === updates.project && item.user === req.user.id);
        if (!projectRecord) {
          return res.status(404).json({ msg: 'Project not found for this account.' });
        }
      }
      Object.assign(task, updates, { updatedAt: store.nowIso() });
      if ('completed' in updates) task.completed = Boolean(updates.completed);
      store.write(state);
      return res.json(store.populateProject(task, state));
    }

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
  if (req.useDevStore) {
    const state = store.read();
    state.tasks = state.tasks.filter((item) => !(item._id === req.params.id && item.user === req.user.id));
    store.write(state);
    return res.json({ msg: 'Deleted' });
  }

  await Task.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;
