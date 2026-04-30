const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const TimeLog = require('../models/TimeLog');
const Client = require('../models/Client');
const User = require('../models/User');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const Project = require('../models/Project');
const store = require('../devStore');
const { sendDatabaseUnavailable } = require('../utils/databaseErrors');
const router = express.Router();

const parseDateBoundary = (value, boundary) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (boundary === 'start') {
    date.setUTCHours(0, 0, 0, 0);
  } else {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
};

const buildPdfUrl = (invoiceId) => `/api/invoices/${invoiceId}/pdf`;

const generateInvoicePdfBuffer = ({ invoice, invoiceClient, logs, hourlyRate, totalHours, total }) => {
  const invoiceId = String(invoice._id);
  const doc = new PDFDocument({ margin: 72, size: 'A4' });
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  doc.fontSize(24).fillColor('#1a1a1a').text('INVOICE', 72, 72, { align: 'center', width: 468 });
  doc.fontSize(10).fillColor('#666').text(`Invoice ID: ${invoiceId}`, 72, 110);
  doc.fontSize(10).text(`Date: ${new Date(invoice.date || invoice.createdAt || Date.now()).toLocaleDateString('en-GB')}`, 72, 125);
  doc.fontSize(10).text(`Hourly Rate: $${hourlyRate.toFixed(2)}`, 72, 140);

  doc.fontSize(12).fillColor('#333').text('Billed To:', 72, 170).underline(72, 170, 200, 1);
  doc.fontSize(11).text(invoiceClient.name, 72, 190);
  if (invoiceClient.company) doc.text(invoiceClient.company, 72, 205);
  doc.fontSize(10).fillColor('#007bff').text(invoiceClient.email || '', 72, 225);
  doc.text(invoiceClient.phone || '', 72, 240);

  const tableTop = 300;
  const tableLeft = 72;
  const colWidths = { date: 80, desc: 220, hours: 70, amount: 90 };
  const tableWidth = 460;
  const rowHeight = 22;

  doc
    .fillColor('#f8f9fa')
    .rect(tableLeft, tableTop, tableWidth, rowHeight).fill()
    .strokeColor('#dee2e6').lineWidth(1).rect(tableLeft, tableTop, tableWidth, rowHeight).stroke();

  doc.font('Helvetica-Bold').fontSize(11)
    .fillColor('#495057')
    .text('Date', tableLeft + 10, tableTop + 6)
    .text('Description', tableLeft + colWidths.date + 10, tableTop + 6)
    .text('Hours', tableLeft + colWidths.date + colWidths.desc + 10, tableTop + 6)
    .text('Amount', tableLeft + colWidths.date + colWidths.desc + colWidths.hours + 10, tableTop + 6);

  doc.strokeColor('#dee2e6').lineWidth(1)
    .moveTo(tableLeft, tableTop + rowHeight).lineTo(tableLeft + tableWidth, tableTop + rowHeight).stroke();

  let rowY = tableTop + rowHeight;
  logs.forEach((log, index) => {
    const hours = (Number(log.duration) || 0) / 60;
    const amount = hours * hourlyRate;
    const evenRow = index % 2 === 0;

    if (evenRow) {
      doc.fillColor('#f8f9fa').rect(tableLeft, rowY, tableWidth, rowHeight).fill();
    }
    doc.strokeColor('#dee2e6').lineWidth(0.5)
      .rect(tableLeft, rowY, tableWidth, rowHeight).stroke();

    const description = log.description || '-';
    doc.font('Helvetica').fontSize(10).fillColor('#212529')
      .text(new Date(log.startTime).toLocaleDateString('en-GB'), tableLeft + 10, rowY + 4)
      .text(description.substring(0, 25) + (description.length > 25 ? '...' : ''),
        tableLeft + colWidths.date + 10, rowY + 4, { width: colWidths.desc - 20 })
      .text(hours.toFixed(2), tableLeft + colWidths.date + colWidths.desc + 10, rowY + 4, { align: 'right', width: colWidths.hours })
      .text(`$${amount.toFixed(2)}`, tableLeft + colWidths.date + colWidths.desc + colWidths.hours + 10, rowY + 4, { align: 'right' });

    rowY += rowHeight;
  });

  doc.moveTo(tableLeft, rowY).lineTo(tableLeft + tableWidth, rowY).lineWidth(1.5).stroke();

  const totalY = rowY + 40;
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
    .text(`Total Hours: ${totalHours.toFixed(2)}`, tableLeft + tableWidth - 250, totalY)
    .text(`Total Amount: $${total.toFixed(2)}`, tableLeft + tableWidth - 250, totalY + 20);

  doc.fontSize(9).fillColor('#666')
    .text('Thank you for your business!', tableLeft, 750, { align: 'center', width: tableWidth });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
};

const getDevInvoicePdfContext = (invoice, state, userId) => {
  const invoiceClient = state.clients.find((client) => client._id === invoice.client && client.user === userId);
  if (!invoiceClient) {
    return null;
  }

  const logs = invoice.timeLogs
    .map((id) => state.timelogs.find((log) => log._id === id && log.user === userId))
    .filter(Boolean)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (!logs.length) {
    return null;
  }

  const totalHours = Number(invoice.totalHours) || logs.reduce((sum, log) => sum + (Number(log.duration) || 0), 0) / 60;
  const total = Number(invoice.total) || 0;
  const hourlyRate = totalHours > 0
    ? total / totalHours
    : Number(invoiceClient.defaultHourlyRate) || 0;

  return { invoiceClient, logs, totalHours, total, hourlyRate };
};

const getMongoInvoicePdfContext = async (invoiceId, userId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, user: userId }).lean();
  if (!invoice) {
    return null;
  }

  const invoiceClient = await Client.findOne({ _id: invoice.client, user: userId }).lean();
  if (!invoiceClient) {
    return null;
  }

  const logs = await TimeLog.find({
    _id: { $in: invoice.timeLogs || [] },
    user: userId,
  }).sort({ startTime: 1 }).lean();

  if (!logs.length) {
    return null;
  }

  const totalHours = Number(invoice.totalHours) || logs.reduce((sum, log) => sum + (Number(log.duration) || 0), 0) / 60;
  const total = Number(invoice.total) || 0;
  const hourlyRate = totalHours > 0
    ? total / totalHours
    : Number(invoiceClient.defaultHourlyRate) || 0;

  return { invoice, invoiceClient, logs, totalHours, total, hourlyRate };
};

// Create invoice
router.post('/', auth, async (req, res) => {
  try {
    const { client, timeLogIds = [], startDate, endDate } = req.body;
    if (!client) {
      return res.status(400).json({ msg: 'A client is required to create an invoice.' });
    }

    if (!mongoose.isValidObjectId(client)) {
      return res.status(400).json({ msg: 'Client ID is invalid.' });
    }

    if (req.useDevStore) {
      const state = store.read();
      const account = state.users.find((user) => user._id === req.user.id);
      if (!account) {
        return res.status(401).json({ msg: 'User account not found.' });
      }
      if (account.tier !== 'pro') {
        return res.status(403).json({ msg: 'PDF invoicing is available on the Pro plan only.' });
      }
      const invoiceClient = state.clients.find((item) => item._id === client && item.user === req.user.id);
      if (!invoiceClient) {
        return res.status(404).json({ msg: 'Client not found.' });
      }
      const clientProjectIds = state.projects
        .filter((project) => project.user === req.user.id && project.client === client)
        .map((project) => project._id);
      if (!clientProjectIds.length) {
        return res.status(400).json({ msg: 'This client has no projects available to invoice.' });
      }

      const parsedStartDate = parseDateBoundary(startDate, 'start');
      const parsedEndDate = parseDateBoundary(endDate, 'end');
      const logs = state.timelogs
        .filter((log) => (
          timeLogIds.includes(log._id)
          && !log.billed
          && log.user === req.user.id
          && clientProjectIds.includes(log.project)
        ))
        .filter((log) => {
          const logDate = new Date(log.startTime);
          if (parsedStartDate && logDate < parsedStartDate) return false;
          if (parsedEndDate && logDate > parsedEndDate) return false;
          return true;
        })
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      if (!logs.length) {
        return res.status(400).json({ msg: 'No unbilled time logs found for that client and date range.' });
      }

      const hourlyRate = Number(invoiceClient.defaultHourlyRate) || 0;
      const totalMinutes = logs.reduce((sum, log) => sum + (Number(log.duration) || 0), 0);
      const totalHours = totalMinutes / 60;
      const total = logs.reduce((sum, log) => sum + (((Number(log.duration) || 0) / 60) * hourlyRate), 0);
      const invoice = {
        _id: store.id(),
        client,
        user: req.user.id,
        date: store.nowIso(),
        startDate: parsedStartDate?.toISOString() || null,
        endDate: parsedEndDate?.toISOString() || null,
        timeLogs: logs.map((log) => log._id),
        total,
        totalMinutes,
        totalHours,
        pdfUrl: '',
        status: 'pending',
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      invoice.pdfUrl = buildPdfUrl(invoice._id);
      state.invoices.push(invoice);
      logs.forEach((log) => {
        log.billed = true;
        log.updatedAt = store.nowIso();
      });
      store.write(state);
      return res.json(store.populateInvoice(invoice, state));
    }

    const account = await User.findById(req.user.id).lean();
    if (!account) {
      return res.status(401).json({ msg: 'User account not found.' });
    }
    // PDF invoicing requires Pro tier
    if (account.tier !== 'pro') {
      return res.status(403).json({ msg: 'PDF invoicing is available on the Pro plan only.' });
    }

    const invoiceClient = await Client.findOne({ _id: client, user: req.user.id });
    if (!invoiceClient) {
      return res.status(404).json({ msg: 'Client not found.' });
    }

    const projectRecords = await Project.find({ user: req.user.id, client }).select('_id name').lean();
    const clientProjectIds = projectRecords.map((project) => project._id);
    if (!clientProjectIds.length) {
      return res.status(400).json({ msg: 'This client has no projects available to invoice.' });
    }

    const filters = {
      _id: { $in: timeLogIds },
      billed: false,
      user: req.user.id,
      project: { $in: clientProjectIds },
    };

    const parsedStartDate = parseDateBoundary(startDate, 'start');
    const parsedEndDate = parseDateBoundary(endDate, 'end');
    if (parsedStartDate || parsedEndDate) {
      filters.startTime = {};
      if (parsedStartDate) filters.startTime.$gte = parsedStartDate;
      if (parsedEndDate) filters.startTime.$lte = parsedEndDate;
    }

    const logs = await TimeLog.find(filters).sort({ startTime: 1 }).lean();
    if (!logs.length) {
      return res.status(400).json({ msg: 'No unbilled time logs found for that client and date range.' });
    }

    const hourlyRate = Number(invoiceClient.defaultHourlyRate) || 0;
    const totalMinutes = logs.reduce((sum, log) => sum + (Number(log.duration) || 0), 0);
    const totalHours = totalMinutes / 60;
    const total = logs.reduce((sum, log) => {
      const hours = (Number(log.duration) || 0) / 60;
      return sum + (hours * hourlyRate);
    }, 0);

    const invoice = new Invoice({
      client,
      user: req.user.id,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      timeLogs: logs.map((log) => log._id),
      total,
      totalMinutes,
      totalHours,
    });
    await invoice.save();

    await TimeLog.updateMany(
      { _id: { $in: logs.map((log) => log._id) }, user: req.user.id },
      { billed: true }
    );

    invoice.pdfUrl = buildPdfUrl(invoice._id);
    await invoice.save();

    res.json(await Invoice.findById(invoice._id).populate('client').populate('timeLogs'));
  } catch (err) {
    return sendDatabaseUnavailable(res, err, 'Unable to create invoice.');
  }
});

router.get('/:id/pdf', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ msg: 'Invoice ID is invalid.' });
    }

    if (req.useDevStore) {
      const state = store.read();
      const invoice = state.invoices.find((item) => item._id === req.params.id && item.user === req.user.id);
      if (!invoice) {
        return res.status(404).json({ msg: 'Invoice not found.' });
      }

      const pdfContext = getDevInvoicePdfContext(invoice, state, req.user.id);
      if (!pdfContext) {
        return res.status(400).json({ msg: 'Invoice PDF data is incomplete.' });
      }

      const pdfBuffer = await generateInvoicePdfBuffer({
        invoice,
        invoiceClient: pdfContext.invoiceClient,
        logs: pdfContext.logs,
        hourlyRate: pdfContext.hourlyRate,
        totalHours: pdfContext.totalHours,
        total: pdfContext.total,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice._id}.pdf"`);
      return res.send(pdfBuffer);
    }

    const pdfContext = await getMongoInvoicePdfContext(req.params.id, req.user.id);
    if (!pdfContext) {
      return res.status(404).json({ msg: 'Invoice not found.' });
    }

    const pdfBuffer = await generateInvoicePdfBuffer({
      invoice: pdfContext.invoice,
      invoiceClient: pdfContext.invoiceClient,
      logs: pdfContext.logs,
      hourlyRate: pdfContext.hourlyRate,
      totalHours: pdfContext.totalHours,
      total: pdfContext.total,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${pdfContext.invoice._id}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return sendDatabaseUnavailable(res, err, 'Unable to generate invoice PDF.');
  }
});

// Get all invoices for user
router.get('/', auth, async (req, res) => {
  try {
    if (req.useDevStore) {
      const state = store.read();
      const invoices = state.invoices
        .filter((invoice) => invoice.user === req.user.id)
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
        .map((invoice) => ({
          ...store.populateInvoice(invoice, state),
          pdfUrl: buildPdfUrl(invoice._id),
        }));
      return res.json(invoices);
    }

    const invoices = await Invoice.find({ user: req.user.id })
      .sort({ createdAt: -1, date: -1 })
      .populate('client')
      .populate('timeLogs');
    const hydratedInvoices = invoices.map((invoice) => {
      const json = invoice.toObject();
      return {
        ...json,
        pdfUrl: buildPdfUrl(json._id),
      };
    });
    res.json(hydratedInvoices);
  } catch (err) {
    return sendDatabaseUnavailable(res, err, 'Unable to load invoices.');
  }
});

module.exports = router;
