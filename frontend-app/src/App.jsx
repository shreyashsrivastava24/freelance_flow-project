import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import './index.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const defaultAuthForm = { email: '', password: '', name: '' };
const defaultClientForm = { name: '', email: '', phone: '', company: '', defaultHourlyRate: '' };
const defaultProjectForm = { client: '', name: '', status: 'active', budget: '' };
const defaultTaskForm = { project: '', title: '', dueDate: '' };
const defaultTimeLogForm = { project: '', description: '', duration: '', date: '' };

const navigation = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clients', label: 'Clients' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'timelogs', label: 'Time Logs' },
  { id: 'invoices', label: 'Invoices' },
];

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const fallbackText = rawText && !rawText.trim().startsWith('<') ? rawText.trim() : '';
    throw new Error(data.msg || data.message || fallbackText || `Request failed (${response.status}).`);
  }
  return data;
};

function App() {
  const [view, setView] = useState('dashboard');
  const [mode, setMode] = useState('signin');
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null') || {});
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [clientForm, setClientForm] = useState(defaultClientForm);
  const [projectForm, setProjectForm] = useState(defaultProjectForm);
  const [taskForm, setTaskForm] = useState(defaultTaskForm);
  const [timeLogForm, setTimeLogForm] = useState(defaultTimeLogForm);
  const [selectedInvoiceClient, setSelectedInvoiceClient] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [timelogs, setTimelogs] = useState([]);

  // Timer state
  const [timerProject, setTimerProject] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const timerRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  // Load timer from localStorage on mount
  useEffect(() => {
    const savedStart = localStorage.getItem('timerStart');
    const savedProject = localStorage.getItem('timerProject');
    if (savedStart && savedProject) {
      setStartTime(new Date(savedStart));
      setTimerProject(savedProject);
      setIsRunning(true);
      setElapsed(Date.now() - new Date(savedStart).getTime());
      // Resume interval
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(savedStart).getTime());
      }, 1000);
    }
  }, []);

  // Save to localStorage when starting
  const startTimer = (projectId) => {
    const now = new Date();
    setStartTime(now);
    setTimerProject(projectId);
    setIsRunning(true);
    setElapsed(0);
    localStorage.setItem('timerStart', now.toISOString());
    localStorage.setItem('timerProject', projectId);
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - now.getTime());
    }, 1000);
  };

  const stopTimer = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
    localStorage.removeItem('timerStart');
    localStorage.removeItem('timerProject');
    const duration = Math.round(elapsed / 60000); // minutes
    if (duration > 0) {
      // Open modal or auto log with confirmation
      const description = prompt('Add description for this session:', 'Timer session');
      if (description !== null) {
        await fetchJson(`${API}/timelogs`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            project: timerProject,
            duration,
            description,
            manual: false,
            startTime: new Date(Date.now() - elapsed).toISOString(),
            endTime: new Date().toISOString(),
          }),
        });
        fetchAllData(token);
        setSuccess('Time logged from timer!');
      }
    }
    setElapsed(0);
  };

  const authHeaders = useMemo(() => (
    token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' }
  ), [token]);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project._id, project])),
    [projects],
  );

  const dashboardStats = useMemo(() => {
    const totalMinutes = timelogs.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    const invoiceMinutes = invoices.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    return {
      clients: clients.length,
      activeProjects: projects.filter((project) => project.status === 'active').length,
      pendingTasks: tasks.filter((task) => !task.completed).length,
      trackedHours: (totalMinutes / 60).toFixed(1),
      invoiceMinutes,
    };
  }, [clients, invoices, projects, tasks, timelogs]);

  const unbilledTimeLogs = useMemo(
    () => timelogs.filter((item) => !item.billed),
    [timelogs],
  );

  const revenuePulse = useMemo(() => {
    if (!invoices.length) return 'No invoices yet';
    const latest = invoices[0];
    return `Latest invoice ${formatShortId(latest._id)} for ${latest.client?.name || 'a client'}`;
  }, [invoices]);

  const chartData = useMemo(() => {
    const data = invoices.slice(0, 10).reverse().map(inv => ({
      name: formatShortId(inv._id),
      revenue: inv.total || 0,
      hours: inv.totalHours || 0
    }));
    return data.length ? data : [{name: 'No Data', revenue: 0, hours: 0}];
  }, [invoices]);

  const resetAlerts = () => {
    setError('');
    setSuccess('');
  };

  const handleFieldChange = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  const fetchAllData = useCallback(async (activeToken) => {
    if (!activeToken) return;
    setBootstrapping(true);
    try {
      const requestHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
      };
      const endpointResults = await Promise.allSettled([
        fetchJson(`${API}/clients`, { headers: requestHeaders }),
        fetchJson(`${API}/projects`, { headers: requestHeaders }),
        fetchJson(`${API}/tasks`, { headers: requestHeaders }),
        fetchJson(`${API}/invoices`, { headers: requestHeaders }),
        fetchJson(`${API}/timelogs`, { headers: requestHeaders }),
      ]);
      const [clientResult, projectResult, taskResult, invoiceResult, timelogResult] = endpointResults;
      const failures = endpointResults
        .map((result, index) => ({ result, label: ['clients', 'projects', 'tasks', 'invoices', 'time logs'][index] }))
        .filter(({ result }) => result.status === 'rejected');

      const clientData = clientResult.status === 'fulfilled' ? clientResult.value : [];
      const projectData = projectResult.status === 'fulfilled' ? projectResult.value : [];
      const taskData = taskResult.status === 'fulfilled' ? taskResult.value : [];
      const invoiceData = invoiceResult.status === 'fulfilled' ? invoiceResult.value : [];
      const timelogData = timelogResult.status === 'fulfilled' ? timelogResult.value : [];

      setClients(clientData);
      setProjects(projectData);
      setTasks(taskData);
      setInvoices(invoiceData);
      setTimelogs(timelogData);
      setSelectedInvoiceClient((current) => (
        clientData.some((client) => client._id === current) ? current : clientData[0]?._id || ''
      ));
      setProjectForm((current) => ({
        ...current,
        client: clientData.some((client) => client._id === current.client) ? current.client : clientData[0]?._id || '',
      }));
      setTaskForm((current) => ({
        ...current,
        project: projectData.some((project) => project._id === current.project) ? current.project : projectData[0]?._id || '',
      }));
      setTimeLogForm((current) => ({
        ...current,
        project: projectData.some((project) => project._id === current.project) ? current.project : projectData[0]?._id || '',
      }));
      if (failures.length) {
        const [{ label, result }] = failures;
        throw new Error(`Unable to refresh ${label}: ${result.reason.message}`);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const timeoutId = window.setTimeout(() => {
      fetchAllData(token);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchAllData, token]);

  const handleAuth = async (event) => {
    event.preventDefault();
    resetAlerts();
    setLoading(true);
    try {
      const endpoint = mode === 'signin' ? 'login' : 'register';
      const payload = mode === 'signin'
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const data = await fetchJson(`${API}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (mode === 'signin') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setAuthForm(defaultAuthForm);
        setSuccess('Welcome back. Your workspace is ready.');
      } else {
        setMode('signin');
        setAuthForm({ ...defaultAuthForm, email: authForm.email });
        setSuccess('Account created. Sign in to enter your workspace.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async ({ event, endpoint, payload, onSuccess }) => {
    event.preventDefault();
    resetAlerts();
    setLoading(true);
    try {
      await fetchJson(`${API}/${endpoint}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (onSuccess) onSuccess();
      try {
        await fetchAllData(token);
      } catch {
        setSuccess('Saved successfully, but the dashboard refresh hit a follow-up error.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addClient = async (event) => {
    await handleCreate({
      event,
      endpoint: 'clients',
      payload: {
        ...clientForm,
        defaultHourlyRate: Number(clientForm.defaultHourlyRate) || 0,
      },
      onSuccess: () => {
        setClientForm(defaultClientForm);
        setSuccess('Client added to your pipeline.');
      },
    });
  };

  const addProject = async (event) => {
    await handleCreate({
      event,
      endpoint: 'projects',
      payload: {
        ...projectForm,
        budget: Number(projectForm.budget) || 0,
      },
      onSuccess: () => {
        setProjectForm({
          ...defaultProjectForm,
          client: clients[0]?._id || '',
        });
        setSuccess('Project created and ready for delivery.');
      },
    });
  };

  const addTask = async (event) => {
    await handleCreate({
      event,
      endpoint: 'tasks',
      payload: taskForm,
      onSuccess: () => {
        setTaskForm({
          ...defaultTaskForm,
          project: projects[0]?._id || '',
        });
        setSuccess('Task added to the execution board.');
      },
    });
  };

  const addTimeLog = async (event) => {
    if (!timeLogForm.project) {
      event.preventDefault();
      resetAlerts();
      setError('Select a project before creating a time log.');
      return;
    }
    if (!timeLogForm.date) {
      event.preventDefault();
      resetAlerts();
      setError('Choose a date for the time log.');
      return;
    }
    if ((Number(timeLogForm.duration) || 0) <= 0) {
      event.preventDefault();
      resetAlerts();
      setError('Enter minutes greater than 0.');
      return;
    }
    // Only send YYYY-MM-DD (strip time part)
    const normalizedDate = normalizeDateInput(timeLogForm.date);
    if (!normalizedDate) {
      event.preventDefault();
      resetAlerts();
      setError('Use a valid date like 2026-04-17.');
      return;
    }
    await handleCreate({
      event,
      endpoint: 'timelogs',
      payload: {
        ...timeLogForm,
        date: normalizedDate, // send only YYYY-MM-DD
        duration: Number(timeLogForm.duration) || 0,
      },
      onSuccess: () => {
        setTimeLogForm({
          ...defaultTimeLogForm,
          project: projects[0]?._id || '',
        });
        setSuccess('Time captured successfully.');
      },
    });
  };

  const toggleTask = async (task) => {
    resetAlerts();
    try {
      await fetchJson(`${API}/tasks/${task._id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ completed: !task.completed }),
      });
      await fetchAllData(token);
    } catch (err) {
      setError(err.message);
    }
  };

  const createInvoice = async () => {
    resetAlerts();
    if (!selectedInvoiceClient) {
      setError('Select a client before generating an invoice.');
      return;
    }
    if (!unbilledTimeLogs.length) {
      setError('There are no unbilled time logs yet.');
      return;
    }
    setLoading(true);
    try {
      await fetchJson(`${API}/invoices`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          client: selectedInvoiceClient,
          timeLogIds: unbilledTimeLogs.map((item) => item._id),
        }),
      });
      await fetchAllData(token);
      setSuccess('Invoice created from your unbilled work.');
      setView('invoices');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSampleData = async () => {
    resetAlerts();
    setLoading(true);
    try {
      const data = await fetchJson(`${API}/sample-data`, {
        method: 'POST',
        headers: authHeaders,
      });
      await fetchAllData(token);
      setSuccess(data.msg || 'Sample data loaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('timerStart');
    localStorage.removeItem('timerProject');
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsRunning(false);
    setTimerProject('');
    setStartTime(null);
    setElapsed(0);
    setToken(null);
    setUser({});
    setClients([]);
    setProjects([]);
    setTasks([]);
    setInvoices([]);
    setTimelogs([]);
    setSelectedInvoiceClient('');
    setView('dashboard');
    resetAlerts();
  };

  const toggleTier = async () => {
    resetAlerts();
    try {
      const data = await fetchJson(`${API}/auth/toggle-tier`, {
        method: 'POST',
        headers: authHeaders,
      });
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      setSuccess(`Switched to ${data.user.tier.toUpperCase()} tier.`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-backdrop auth-backdrop-left" />
        <div className="auth-backdrop auth-backdrop-right" />
        <section className="auth-hero">
          <div className="badge">Freelance operating system</div>
          <h1>FreelanceFlow turns your client work into a polished business.</h1>
          <p>
            Track projects, time, invoices, and momentum from one sharp workspace
            designed to feel more premium than a spreadsheet stack.
          </p>
          <div className="hero-metrics">
            <MetricCard value="6" label="core workflows unified" />
            <MetricCard value="24/7" label="business visibility" />
            <MetricCard value="1" label="dashboard to run it all" />
          </div>
        </section>

        <section className="auth-panel">
          <div className="panel-topline">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</div>
          <h2>{mode === 'signin' ? 'Sign in to your studio' : 'Start building your freelance engine'}</h2>
          <p className="panel-copy">
            A cleaner pipeline for clients, delivery, and invoicing without the busy-work.
          </p>
          <div className="segmented-control">
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => setMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>
          <form className="auth-form" onSubmit={handleAuth}>
            {mode === 'register' && (
              <label className="field">
                <span>Name</span>
                <input
                  name="name"
                  placeholder="Your full name"
                  value={authForm.name}
                  onChange={handleFieldChange(setAuthForm)}
                  required
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={authForm.email}
                onChange={handleFieldChange(setAuthForm)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                placeholder="Your secure password"
                value={authForm.password}
                onChange={handleFieldChange(setAuthForm)}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Enter Dashboard' : 'Create Account'}
            </button>
          </form>
          <Alerts error={error} success={success} />
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">FF</div>
          <div className="sidebar-title">FreelanceFlow</div>
          <p className="sidebar-copy">An elegant command center for modern freelance work.</p>
        </div>
        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="mini-panel">
            <span className="eyebrow">
              Tier Level
              <span className={`tier-badge tier-${user.tier || 'free'}`}>
                {user.tier || 'Free'}
              </span>
            </span>
            <button type="button" className="secondary-button" style={{ marginTop: '10px', width: '100%', fontSize: '0.85rem' }} onClick={toggleTier}>
              Toggle to {user.tier === 'pro' ? 'Free' : 'Pro'}
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">Workspace overview</div>
            <h1>{getViewTitle(view)}</h1>
            <p className="topbar-copy">
              Welcome, {user.name || user.email}. Keep your pipeline moving and your delivery polished.
            </p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary-button" onClick={loadSampleData} disabled={loading}>
              Load Sample Data
            </button>
            {user.tier !== 'pro' ? (
              <button type="button" className="primary-button" disabled title="Pro Plan Required">
                Pro Feature: Invoice
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={createInvoice} disabled={loading || !clients.length}>
                Create Invoice
              </button>
            )}
          </div>
        </header>

        <Alerts error={error} success={success} />

        {bootstrapping ? (
          <section className="content-card">
            <div className="empty-state">
              <h3>Loading your workspace...</h3>
              <p>Pulling together clients, projects, tasks, time logs, and invoices.</p>
            </div>
          </section>
        ) : (
          <main className="content-grid">
            {view === 'dashboard' && (
              <>
                <section className="hero-panel">
                  <div>
                    <div className="eyebrow">Business cockpit</div>
                    <h2>See capacity, delivery, and billing at a glance.</h2>
                    <p>
                      Your team of one should still feel like a studio. This dashboard surfaces workload,
                      tracked time, and invoicing momentum without the clutter.
                    </p>
                  </div>
                  <div className="hero-orb" />
                </section>

                <section className="stats-grid">
                  <StatCard label="Clients" value={dashboardStats.clients} accent="sunrise" />
                  <StatCard label="Active Projects" value={dashboardStats.activeProjects} accent="teal" />
                  <StatCard label="Pending Tasks" value={dashboardStats.pendingTasks} accent="coral" />
                  <StatCard label="Tracked Hours" value={dashboardStats.trackedHours} accent="gold" />
                </section>

                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Highlights</span>
                      <h3>What needs your attention next</h3>
                    </div>
                  </div>
                  <div className="spotlight-grid">
                    <InsightCard
                      title="Projects waiting on structure"
                      value={projects.filter((project) => project.status === 'on_hold').length}
                      detail="On-hold projects ready for a follow-up or new plan."
                    />
                    <InsightCard
                      title="Unbilled work"
                      value={`${(unbilledTimeLogs.reduce((sum, item) => sum + (item.duration || 0), 0) / 60).toFixed(1)}h`}
                      detail="Captured time available to convert into an invoice."
                    />
                    <InsightCard
                      title="Completed tasks"
                      value={tasks.filter((task) => task.completed).length}
                      detail="Execution already moved across the finish line."
                    />
                  </div>
                </section>

                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Financials</span>
                      <h3>Monthly Revenue Pipeline</h3>
                    </div>
                  </div>
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="name" stroke="var(--text-soft)" tick={{fill: 'var(--text-muted)'}} />
                        <YAxis stroke="var(--text-soft)" tick={{fill: 'var(--text-muted)'}} tickFormatter={(value) => `$${value}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--panel-strong)', border: '1px solid var(--line)', borderRadius: '12px', color: '#fff' }}
                          itemStyle={{ color: 'var(--sunrise)' }}
                        />
                        <Bar dataKey="revenue" fill="var(--sunrise)" radius={[4, 4, 0, 0]} name="Revenue ($)">
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'var(--sunrise)' : 'var(--gold)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Recent activity</span>
                      <h3>Latest time logs</h3>
                    </div>
                  </div>
                  <div className="activity-list">
                    {timelogs.slice(0, 5).map((log) => (
                      <div key={log._id} className="activity-item">
                        <div>
                          <strong>{projectMap.get(log.project?._id || log.project)?.name || log.project?.name || 'General work'}</strong>
                          <p>{log.description || 'Focused project work logged.'}</p>
                        </div>
                        <div className="activity-meta">
                          <span>{formatDate(log.startTime)}</span>
                          <strong>{((log.duration || 0) / 60).toFixed(1)}h</strong>
                        </div>
                      </div>
                    ))}
                    {!timelogs.length && <EmptyState title="No time logs yet" copy="Add your first session to bring this dashboard to life." />}
                  </div>
                </section>
              </>
            )}

            {view === 'clients' && (
              <>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Client intake</span>
                      <h3>Add a new client</h3>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={addClient}>
                    <Field label="Name" name="name" value={clientForm.name} onChange={handleFieldChange(setClientForm)} required />
                    <Field label="Email" name="email" type="email" value={clientForm.email} onChange={handleFieldChange(setClientForm)} />
                    <Field label="Phone" name="phone" value={clientForm.phone} onChange={handleFieldChange(setClientForm)} />
                    <Field label="Company" name="company" value={clientForm.company} onChange={handleFieldChange(setClientForm)} />
                    <Field
                      label="Hourly Rate"
                      name="defaultHourlyRate"
                      type="number"
                      value={clientForm.defaultHourlyRate}
                      onChange={handleFieldChange(setClientForm)}
                    />
                    {user.tier !== 'pro' && clients.length >= 2 ? (
                      <div className="alert alert-error" style={{ gridColumn: '1 / -1' }}>
                        Free tier limit reached. Max 2 clients allowed. Upgrade to Pro for unlimited clients.
                      </div>
                    ) : (
                      <button className="primary-button form-submit" type="submit" disabled={loading}>
                        Add Client
                      </button>
                    )}
                  </form>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Portfolio</span>
                      <h3>Your client roster</h3>
                    </div>
                  </div>
                  <div className="record-grid">
                    {clients.map((client) => (
                      <article key={client._id} className="record-card">
                        <div className="record-header">
                          <div>
                            <h4>{client.name}</h4>
                            <p>{client.company || 'Independent client'}</p>
                          </div>
                          <span className="pill">{formatCurrency(client.defaultHourlyRate || 0)}/hr</span>
                        </div>
                        <div className="record-meta">
                          <span>{client.email || 'No email added'}</span>
                          <span>{client.phone || 'No phone added'}</span>
                        </div>
                      </article>
                    ))}
                    {!clients.length && <EmptyState title="No clients yet" copy="Add your first client to start shaping the pipeline." />}
                  </div>
                </section>
              </>
            )}

            {view === 'projects' && (
              <>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Delivery pipeline</span>
                      <h3>Create a project</h3>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={addProject}>
                    <SelectField
                      label="Client"
                      name="client"
                      value={projectForm.client}
                      onChange={handleFieldChange(setProjectForm)}
                      options={clients.map((client) => ({ value: client._id, label: client.name }))}
                      required
                    />
                    <Field label="Project Name" name="name" value={projectForm.name} onChange={handleFieldChange(setProjectForm)} required />
                    <SelectField
                      label="Status"
                      name="status"
                      value={projectForm.status}
                      onChange={handleFieldChange(setProjectForm)}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'on_hold', label: 'On Hold' },
                      ]}
                    />
                    <Field label="Budget" name="budget" type="number" value={projectForm.budget} onChange={handleFieldChange(setProjectForm)} />
                    <button className="primary-button form-submit" type="submit" disabled={loading || !clients.length}>
                      Add Project
                    </button>
                  </form>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Current work</span>
                      <h3>Project board</h3>
                    </div>
                  </div>
                  <div className="record-grid">
                    {projects.map((project) => (
                      <article key={project._id} className="record-card">
                        <div className="record-header">
                          <div>
                            <h4>{project.name}</h4>
                            <p>{project.client?.name || 'No client assigned'}</p>
                          </div>
                          <span className={`pill status-${project.status}`}>{formatStatus(project.status)}</span>
                        </div>
                        <div className="record-meta">
                          <span>Budget {formatCurrency(project.budget || 0)}</span>
                          <span>{tasks.filter((task) => task.project?._id === project._id || task.project === project._id).length} tasks</span>
                        </div>
                      </article>
                    ))}
                    {!projects.length && <EmptyState title="No projects yet" copy="Create your first project once a client is on board." />}
                  </div>
                </section>
              </>
            )}

            {view === 'tasks' && (
              <>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Execution</span>
                      <h3>Add a task</h3>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={addTask}>
                    <SelectField
                      label="Project"
                      name="project"
                      value={taskForm.project}
                      onChange={handleFieldChange(setTaskForm)}
                      options={projects.map((project) => ({ value: project._id, label: project.name }))}
                      required
                    />
                    <Field label="Task Title" name="title" value={taskForm.title} onChange={handleFieldChange(setTaskForm)} required />
                    <Field label="Due Date" name="dueDate" type="date" value={taskForm.dueDate} onChange={handleFieldChange(setTaskForm)} />
                    <button className="primary-button form-submit" type="submit" disabled={loading || !projects.length}>
                      Add Task
                    </button>
                  </form>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Task list</span>
                      <h3>Execution board</h3>
                    </div>
                  </div>
                  <div className="task-list">
                    {tasks.map((task) => (
                      <label key={task._id} className={task.completed ? 'task-item complete' : 'task-item'}>
                        <input type="checkbox" checked={task.completed} onChange={() => toggleTask(task)} />
                        <div>
                          <strong>{task.title}</strong>
                          <p>
                            {task.project?.name || 'No project'}
                            {' - '}
                            Due {task.dueDate ? formatDate(task.dueDate) : 'anytime'}
                          </p>
                        </div>
                      </label>
                    ))}
                    {!tasks.length && <EmptyState title="No tasks yet" copy="Add a task to turn project scope into action." />}
                  </div>
                </section>
              </>
            )}

            {view === 'timelogs' && (
              <>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Time tracking</span>
                      <h3>Log focused work</h3>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={addTimeLog}>
                    <SelectField
                      label="Project"
                      name="project"
                      value={timeLogForm.project}
                      onChange={handleFieldChange(setTimeLogForm)}
                      options={projects.map((project) => ({ value: project._id, label: project.name }))}
                      required
                    />
                    <Field
                      label="Description"
                      name="description"
                      value={timeLogForm.description}
                      onChange={handleFieldChange(setTimeLogForm)}
                      placeholder="What did you work on?"
                    />
                    <Field
                      label="Minutes"
                      name="duration"
                      type="number"
                      value={timeLogForm.duration}
                      onChange={handleFieldChange(setTimeLogForm)}
                      required
                    />
                    <Field label="Date" name="date" type="date" value={timeLogForm.date} onChange={handleFieldChange(setTimeLogForm)} required />
                    <button className="primary-button form-submit" type="submit" disabled={loading || !projects.length}>
                      Add Time Log
                    </button>
                  </form>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Captured sessions</span>
                      <h3>Time ledger</h3>
                    </div>
                  </div>
                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Project</th>
                          <th>Description</th>
                          <th>Hours</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timelogs.map((log) => (
                          <tr key={log._id}>
                            <td>{formatDate(log.startTime)}</td>
                            <td>{log.project?.name || 'No project'}</td>
                            <td>{log.description || 'Focused work session'}</td>
                            <td>{((log.duration || 0) / 60).toFixed(1)}</td>
                            <td>{log.billed ? 'Billed' : 'Unbilled'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!timelogs.length && <EmptyState title="No time logs yet" copy="Log your first block of work to start tracking delivery value." />}
                  </div>
                </section>
              </>
            )}

            {view === 'invoices' && (
              <>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Billing</span>
                      <h3>Create invoice from unbilled work</h3>
                    </div>
                  </div>
                  <div className="billing-actions">
                    <SelectField
                      label="Invoice Client"
                      name="invoiceClient"
                      value={selectedInvoiceClient}
                      onChange={(event) => setSelectedInvoiceClient(event.target.value)}
                      options={clients.map((client) => ({ value: client._id, label: client.name }))}
                    />
                    <div className="mini-panel">
                      <span className="eyebrow">Ready to bill</span>
                      <strong>{unbilledTimeLogs.length} time logs</strong>
                      <p>{(unbilledTimeLogs.reduce((sum, item) => sum + (item.duration || 0), 0) / 60).toFixed(1)} hours available</p>
                    </div>
                    {user.tier !== 'pro' ? (
                      <div className="alert alert-error">
                        PDF Invoicing is only available on the Pro plan.
                      </div>
                    ) : (
                      <button type="button" className="primary-button" onClick={createInvoice} disabled={loading || !clients.length}>
                        Generate Invoice
                      </button>
                    )}
                  </div>
                </section>
                <section className="content-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Invoice history</span>
                      <h3>Billing archive</h3>
                    </div>
                  </div>
                  <div className="record-grid">
                    {invoices.map((invoice) => (
                      <article key={invoice._id} className="record-card">
                        <div className="record-header">
                          <div>
                            <h4>{formatShortId(invoice._id)}</h4>
                            <p>{invoice.client?.name || 'No client'}</p>
                          </div>
                          <span className="pill">{invoice.total || 0} mins</span>
                        </div>
                        <div className="record-meta">
                          <span>{formatDate(invoice.createdAt || invoice.date)}</span>
                          <span>{invoice.status || 'pending'}</span>
                          {invoice.pdfUrl && (
                            <a href={`${API.replace('/api', '')}${invoice.pdfUrl}`} download target="_blank" className="pdf-download" rel="noopener noreferrer">
                              📄 Download PDF
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                    {!invoices.length && <EmptyState title="No invoices yet" copy="Generate your first invoice from tracked work when you are ready." />}
                  </div>
                </section>
              </>
            )}
          </main>
        )}
      </div>

      {isRunning && (
        <div className="stopwatch-floating">
          <div className="timer-info">
            <strong>{projectMap.get(timerProject)?.name || 'Timer Active'}</strong>
            <span>Working Session</span>
          </div>
          <div className="timer-display">
            {String(Math.floor(elapsed / 60000)).padStart(2, '0')}:
            {String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}
          </div>
          <div className="stopwatch-actions">
            <button className="stop-button" onClick={stopTimer}>Stop & Log</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Alerts({ error, success }) {
  if (!error && !success) return null;
  return (
    <div className="alerts">
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  const isRequired = Boolean(props.required);
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>
        <option value="" disabled={isRequired}>
          {options.length ? 'Select an option' : 'No options available'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <article className={`stat-card accent-${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InsightCard({ title, value, detail }) {
  return (
    <article className="insight-card">
      <span className="eyebrow">Focus</span>
      <strong>{value}</strong>
      <h4>{title}</h4>
      <p>{detail}</p>
    </article>
  );
}

function MetricCard({ value, label }) {
  return (
    <div className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, copy }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

function getViewTitle(view) {
  return navigation.find((item) => item.id === view)?.label || 'Dashboard';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatShortId(value) {
  return value ? `INV-${value.slice(-6).toUpperCase()}` : 'Invoice';
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDateInput(value) {
  if (!value) return '';
  // Accept YYYY-MM-DD or DD-MM-YYYY, always output YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split('-');
    return `${year}-${month}-${day}`;
  }
  // Try to parse as date input type (may be locale dependent)
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

export default App;
