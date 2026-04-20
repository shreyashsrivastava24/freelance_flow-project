const express = require('express');
const Invoice = require('../models/Invoice');
const TimeLog = require('../models/TimeLog');
const Client = require('../models/Client');
const User = require('../models/User');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Project = require('../models/Project');
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

// Create invoice
router.post('/', auth, async (req, res) => {
  try {
    const { client, timeLogIds = [], startDate, endDate } = req.body;
    if (!client) {
      return res.status(400).json({ msg: 'A client is required to create an invoice.' });
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

    const invoicesDir = path.join(__dirname, '../invoices');
    fs.mkdirSync(invoicesDir, { recursive: true });
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const pdfPath = path.join(invoicesDir, `invoice_${invoice._id}.pdf`);
    doc.pipe(fs.createWriteStream(pdfPath));

    // Header
    doc.fontSize(24).fillColor('#1a1a1a').text('INVOICE', 72, 72, { align: 'center', width: 468 });
    doc.fontSize(10).fillColor('#666').text(`Invoice ID: ${invoice._id}`, 72, 110);
    doc.fontSize(10).text(`Date: ${new Date(invoice.date).toLocaleDateString('en-GB')}`, 72, 125);
    doc.fontSize(10).text(`Hourly Rate: $${hourlyRate.toFixed(2)}`, 72, 140);

    // Billed To
    doc.fontSize(12).fillColor('#333').text('Billed To:', 72, 170).underline(72, 170, 200, 1);
    doc.fontSize(11).text(invoiceClient.name, 72, 190);
    if (invoiceClient.company) doc.text(invoiceClient.company, 72, 205);
    doc.fontSize(10).fillColor('#007bff').text(invoiceClient.email || '', 72, 225);
    doc.text(invoiceClient.phone || '', 72, 240);

    // Table setup
    const tableTop = 300;
    const tableLeft = 72;
    const colWidths = { date: 80, desc: 220, hours: 70, amount: 90 };
    const tableWidth = 460;
    const rowHeight = 22;

    // Table header
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

    // Header underline
    doc.strokeColor('#dee2e6').lineWidth(1)
      .moveTo(tableLeft, tableTop + rowHeight).lineTo(tableLeft + tableWidth, tableTop + rowHeight).stroke();

    // Table rows
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

      doc.font('Helvetica').fontSize(10).fillColor('#212529')
        .text(new Date(log.startTime).toLocaleDateString('en-GB'), tableLeft + 10, rowY + 4)
        .text(log.description?.substring(0, 25) + (log.description?.length > 25 ? '...' : '') || '-', 
              tableLeft + colWidths.date + 10, rowY + 4, { width: colWidths.desc - 20 })
        .text(hours.toFixed(2), tableLeft + colWidths.date + colWidths.desc + 10, rowY + 4, { align: 'right', width: colWidths.hours })
        .text(`$${amount.toFixed(2)}`, tableLeft + colWidths.date + colWidths.desc + colWidths.hours + 10, rowY + 4, { align: 'right' });

      rowY += rowHeight;
    });

    // Table bottom line
    doc.moveTo(tableLeft, rowY).lineTo(tableLeft + tableWidth, rowY).lineWidth(1.5).stroke();

    // Totals (right aligned)
    const totalY = rowY + 40;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
      .text(`Total Hours: ${totalHours.toFixed(2)}`, tableLeft + tableWidth - 250, totalY)
      .text(`Total Amount: $${total.toFixed(2)}`, tableLeft + tableWidth - 250, totalY + 20);

    // Footer
    doc.fontSize(9).fillColor('#666')
      .text('Thank you for your business!', tableLeft, 750, { align: 'center', width: tableWidth });

    doc.end();
    invoice.pdfUrl = `/invoices/invoice_${invoice._id}.pdf`;
    await invoice.save();

    res.json(await Invoice.findById(invoice._id).populate('client').populate('timeLogs'));
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to create invoice.' });
  }
});

// Get all invoices for user
router.get('/', auth, async (req, res) => {
  try {
    const invoices = await Invoice.find({ user: req.user.id })
      .sort({ createdAt: -1, date: -1 })
      .populate('client')
      .populate('timeLogs');
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Unable to load invoices.' });
  }
});

module.exports = router;
