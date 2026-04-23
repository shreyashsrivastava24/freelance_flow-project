const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const dataDir = path.join(__dirname, '.data');
const dataFile = path.join(dataDir, 'dev-db.json');

const emptyState = {
  users: [],
  clients: [],
  projects: [],
  tasks: [],
  timelogs: [],
  invoices: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const ensureState = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(emptyState, null, 2));
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { ...clone(emptyState), ...parsed };
  } catch {
    fs.writeFileSync(dataFile, JSON.stringify(emptyState, null, 2));
    return clone(emptyState);
  }
};

const saveState = (state) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
};

const createId = () => new mongoose.Types.ObjectId().toString();

const nowIso = () => new Date().toISOString();

const withoutPassword = (user) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
};

const populateClient = (project, state) => ({
  ...project,
  client: state.clients.find((client) => client._id === project.client) || null,
});

const populateProject = (item, state) => ({
  ...item,
  project: state.projects.find((project) => project._id === item.project) || null,
});

const populateInvoice = (invoice, state) => ({
  ...invoice,
  client: state.clients.find((client) => client._id === invoice.client) || null,
  timeLogs: invoice.timeLogs
    .map((id) => state.timelogs.find((log) => log._id === id))
    .filter(Boolean),
});

const store = {
  read: () => ensureState(),
  write: saveState,
  id: createId,
  nowIso,
  withoutPassword,
  populateClient,
  populateProject,
  populateInvoice,
};

module.exports = store;
