const express = require('express');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TimeLog = require('../models/TimeLog');
const Invoice = require('../models/Invoice');
const auth = require('../middleware/auth');
const store = require('../devStore');
const router = express.Router();

// Load sample data for the authenticated user
router.post('/', auth, async (req, res) => {
  if (req.useDevStore) {
    const state = store.read();
    const clientCount = state.clients.filter((client) => client.user === req.user.id).length;
    if (clientCount > 0) return res.status(400).json({ msg: 'Sample data can only be loaded into an empty account.' });

    const now = new Date();
    const client = {
      _id: store.id(),
      user: req.user.id,
      name: 'Acme Corp',
      email: 'acme@example.com',
      phone: '1234567890',
      company: 'Acme Corp',
      defaultHourlyRate: 75,
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    };
    const websiteProject = {
      _id: store.id(),
      user: req.user.id,
      client: client._id,
      name: 'Website Redesign',
      status: 'active',
      budget: 6000,
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    };
    const retainerProject = {
      _id: store.id(),
      user: req.user.id,
      client: client._id,
      name: 'Growth Retainer',
      status: 'completed',
      budget: 3200,
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    };
    const tasks = [
      { _id: store.id(), user: req.user.id, project: websiteProject._id, title: 'Design Mockups', dueDate: new Date(now.getTime() + 2 * 86400000).toISOString(), completed: false, createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), user: req.user.id, project: websiteProject._id, title: 'Frontend Implementation', dueDate: new Date(now.getTime() + 5 * 86400000).toISOString(), completed: false, createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), user: req.user.id, project: retainerProject._id, title: 'Launch analytics dashboard', dueDate: new Date(now.getTime() - 5 * 86400000).toISOString(), completed: true, createdAt: store.nowIso(), updatedAt: store.nowIso() },
    ];
    const timeLogs = [
      { _id: store.id(), user: req.user.id, project: websiteProject._id, startTime: new Date(now.getFullYear(), now.getMonth() - 2, 12, 10).toISOString(), endTime: new Date(now.getFullYear(), now.getMonth() - 2, 12, 13).toISOString(), duration: 180, description: 'Discovery workshop and sitemap planning', manual: true, billed: true, createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), user: req.user.id, project: retainerProject._id, startTime: new Date(now.getFullYear(), now.getMonth() - 1, 8, 9).toISOString(), endTime: new Date(now.getFullYear(), now.getMonth() - 1, 8, 11, 30).toISOString(), duration: 150, description: 'Retention campaign landing page updates', manual: true, billed: true, createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), user: req.user.id, project: websiteProject._id, startTime: new Date(now.getTime() - 3 * 86400000).toISOString(), endTime: new Date(now.getTime() - 3 * 86400000 + 2 * 3600000).toISOString(), duration: 120, description: 'Responsive component build-out', manual: false, billed: false, createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), user: req.user.id, project: websiteProject._id, startTime: new Date(now.getTime() - 1 * 86400000).toISOString(), endTime: new Date(now.getTime() - 1 * 86400000 + 90 * 60000).toISOString(), duration: 90, description: 'QA pass and client revisions', manual: true, billed: false, createdAt: store.nowIso(), updatedAt: store.nowIso() },
    ];
    const invoices = [
      { _id: store.id(), client: client._id, user: req.user.id, date: new Date(now.getFullYear(), now.getMonth() - 2, 13).toISOString(), timeLogs: [timeLogs[0]._id], total: 225, totalMinutes: 180, totalHours: 3, status: 'paid', createdAt: store.nowIso(), updatedAt: store.nowIso() },
      { _id: store.id(), client: client._id, user: req.user.id, date: new Date(now.getFullYear(), now.getMonth() - 1, 9).toISOString(), timeLogs: [timeLogs[1]._id], total: 187.5, totalMinutes: 150, totalHours: 2.5, status: 'pending', createdAt: store.nowIso(), updatedAt: store.nowIso() },
    ];

    state.clients.push(client);
    state.projects.push(websiteProject, retainerProject);
    state.tasks.push(...tasks);
    state.timelogs.push(...timeLogs);
    state.invoices.push(...invoices);
    store.write(state);
    return res.json({ msg: 'Sample data loaded with dashboard-ready revenue history.' });
  }

  // Only allow if user has no clients
  const clientCount = await Client.countDocuments({ user: req.user.id });
  if (clientCount > 0) return res.status(400).json({ msg: 'Sample data can only be loaded into an empty account.' });

  const now = new Date();

  const client = await Client.create({
    user: req.user.id,
    name: 'Acme Corp',
    email: 'acme@example.com',
    phone: '1234567890',
    company: 'Acme Corp',
    defaultHourlyRate: 75,
  });

  const [websiteProject, retainerProject] = await Project.create([
    {
      user: req.user.id,
      client: client._id,
      name: 'Website Redesign',
      status: 'active',
      budget: 6000,
    },
    {
      user: req.user.id,
      client: client._id,
      name: 'Growth Retainer',
      status: 'completed',
      budget: 3200,
    },
  ]);

  await Task.create([
    { user: req.user.id, project: websiteProject._id, title: 'Design Mockups', dueDate: new Date(now.getTime() + 2 * 86400000), completed: false },
    { user: req.user.id, project: websiteProject._id, title: 'Frontend Implementation', dueDate: new Date(now.getTime() + 5 * 86400000), completed: false },
    { user: req.user.id, project: retainerProject._id, title: 'Launch analytics dashboard', dueDate: new Date(now.getTime() - 5 * 86400000), completed: true },
  ]);

  const timeLogs = await TimeLog.create([
    {
      user: req.user.id,
      project: websiteProject._id,
      startTime: new Date(now.getFullYear(), now.getMonth() - 2, 12, 10),
      endTime: new Date(now.getFullYear(), now.getMonth() - 2, 12, 13),
      duration: 180,
      description: 'Discovery workshop and sitemap planning',
      manual: true,
      billed: true,
    },
    {
      user: req.user.id,
      project: retainerProject._id,
      startTime: new Date(now.getFullYear(), now.getMonth() - 1, 8, 9),
      endTime: new Date(now.getFullYear(), now.getMonth() - 1, 8, 11, 30),
      duration: 150,
      description: 'Retention campaign landing page updates',
      manual: true,
      billed: true,
    },
    {
      user: req.user.id,
      project: websiteProject._id,
      startTime: new Date(now.getTime() - 3 * 86400000),
      endTime: new Date(now.getTime() - 3 * 86400000 + 2 * 3600000),
      duration: 120,
      description: 'Responsive component build-out',
      manual: false,
      billed: false,
    },
    {
      user: req.user.id,
      project: websiteProject._id,
      startTime: new Date(now.getTime() - 1 * 86400000),
      endTime: new Date(now.getTime() - 1 * 86400000 + 90 * 60000),
      duration: 90,
      description: 'QA pass and client revisions',
      manual: true,
      billed: false,
    },
  ]);

  await Invoice.create([
    {
      client: client._id,
      user: req.user.id,
      date: new Date(now.getFullYear(), now.getMonth() - 2, 13),
      timeLogs: [timeLogs[0]._id],
      total: 225,
      totalMinutes: 180,
      totalHours: 3,
      status: 'paid',
    },
    {
      client: client._id,
      user: req.user.id,
      date: new Date(now.getFullYear(), now.getMonth() - 1, 9),
      timeLogs: [timeLogs[1]._id],
      total: 187.5,
      totalMinutes: 150,
      totalHours: 2.5,
      status: 'pending',
    },
  ]);

  res.json({ msg: 'Sample data loaded with dashboard-ready revenue history.' });
});

module.exports = router;
