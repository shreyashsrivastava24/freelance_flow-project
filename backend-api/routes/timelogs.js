const express = require('express');
const TimeLog = require('../models/TimeLog');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const store = require('../devStore');
const router = express.Router();

const parseFlexibleDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  // Accept YYYY-MM-DD (ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const d = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Accept DD-MM-YYYY
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Fallback: try Date parse
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
};

const toValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Get all time logs for user
router.get('/', auth, async (req, res) => {
  try {
    if (req.useDevStore) {
      const state = store.read();
      const logs = state.timelogs
        .filter((log) => log.user === req.user.id)
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        .map((log) => store.populateProject(log, state));
      return res.json(logs);
    }

    const logs = await TimeLog.find({ user: req.user.id }).sort({ startTime: -1 }).lean();
    const projectIds = [...new Set(
      logs
        .map((log) => log.project?.toString?.() || log.project)
        .filter(Boolean)
    )];
    const projects = await Project.find({
      _id: { $in: projectIds },
      user: req.user.id,
    }).lean();
    const projectMap = new Map(projects.map((project) => [project._id.toString(), project]));
    const hydratedLogs = logs.map((log) => ({
      ...log,
      project: projectMap.get(log.project?.toString?.() || log.project) || null,
    }));
    res.json(hydratedLogs);
  } catch (err) {
    console.error('Time log fetch failed:', err);
    res.status(500).json({ msg: err.message || 'Unable to load time logs.' });
  }
});

// Add time log (manual or stopwatch)
router.post('/', auth, async (req, res) => {
  try {
    const { project, startTime, endTime, duration, manual, date, description } = req.body;
    const explicitStartTime = toValidDate(startTime);
    const explicitEndTime = toValidDate(endTime);
    const parsedStartTime = explicitStartTime || parseFlexibleDate(startTime || date);
    let durationInMinutes = Number(duration) || 0;

    if (!project) {
      return res.status(400).json({ msg: 'Project is required.' });
    }

    if (req.useDevStore) {
      const state = store.read();
      const projectRecord = state.projects.find((item) => item._id === project && item.user === req.user.id);
      if (!projectRecord) {
        return res.status(404).json({ msg: 'Selected project was not found for this account.' });
      }
      if (!parsedStartTime) {
        return res.status(400).json({ msg: 'Use a valid date like 2026-04-17.' });
      }
      if (durationInMinutes <= 0 && explicitStartTime && explicitEndTime) {
        durationInMinutes = Math.round((explicitEndTime.getTime() - explicitStartTime.getTime()) / 60000);
      }
      if (durationInMinutes <= 0) {
        return res.status(400).json({ msg: 'Duration must be greater than 0 minutes.' });
      }

      const parsedEndTime = explicitEndTime || (endTime ? parseFlexibleDate(endTime) : null);
      const resolvedEndTime = parsedEndTime || new Date(
        parsedStartTime.getTime() + durationInMinutes * 60 * 1000
      );
      const log = {
        _id: store.id(),
        user: req.user.id,
        project,
        startTime: parsedStartTime.toISOString(),
        endTime: resolvedEndTime.toISOString(),
        duration: durationInMinutes,
        description: description || '',
        manual: typeof manual === 'boolean' ? manual : !explicitStartTime || Boolean(date || manual),
        billed: false,
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      state.timelogs.push(log);
      store.write(state);
      return res.json(store.populateProject(log, state));
    }

    const projectRecord = await Project.findOne({ _id: project, user: req.user.id });
    if (!projectRecord) {
      return res.status(404).json({ msg: 'Selected project was not found for this account.' });
    }
    if (!parsedStartTime) {
      return res.status(400).json({ msg: 'Use a valid date like 2026-04-17.' });
    }
    if (durationInMinutes <= 0 && explicitStartTime && explicitEndTime) {
      durationInMinutes = Math.round((explicitEndTime.getTime() - explicitStartTime.getTime()) / 60000);
    }
    if (durationInMinutes <= 0) {
      return res.status(400).json({ msg: 'Duration must be greater than 0 minutes.' });
    }

    const parsedEndTime = explicitEndTime || (endTime ? parseFlexibleDate(endTime) : null);
    const resolvedEndTime = parsedEndTime || new Date(
      parsedStartTime.getTime() + durationInMinutes * 60 * 1000
    );

    const log = new TimeLog({
      user: req.user.id,
      project,
      startTime: parsedStartTime,
      endTime: resolvedEndTime,
      duration: durationInMinutes,
      description: description || '',
      manual: typeof manual === 'boolean' ? manual : !explicitStartTime || Boolean(date || manual),
    });
    await log.save();
    res.json(await log.populate('project'));
  } catch (err) {
    console.error('Time log creation failed:', err);
    res.status(500).json({ msg: err.message || 'Unable to create time log.' });
  }
});

// Update time log
router.put('/:id', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    const log = state.timelogs.find((item) => item._id === req.params.id && item.user === req.user.id);
    if (!log) return res.status(404).json({ msg: 'Time log not found.' });
    Object.assign(log, req.body, { updatedAt: store.nowIso() });
    store.write(state);
    return res.json(store.populateProject(log, state));
  }

  const log = await TimeLog.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    req.body,
    { new: true }
  );
  res.json(log);
});

// Delete time log
router.delete('/:id', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    state.timelogs = state.timelogs.filter((item) => !(item._id === req.params.id && item.user === req.user.id));
    store.write(state);
    return res.json({ msg: 'Deleted' });
  }

  await TimeLog.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ msg: 'Deleted' });
});

module.exports = router;
