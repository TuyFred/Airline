const { query } = require("../config/db");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");

async function sendSupportEmail(req, res, next) {
  try {
    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({ message: "BREVO_API_KEY is not configured" });
    }

    const { subject, issue, companyName, flightDate, issueDescription, contactNumber, emailMessage } = req.body;

    const users = await query(
      `SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.BREVO_GMAIL_TO;
    const sender = getBrevoSender();

    if (!supportEmail) {
      return res.status(500).json({ message: "Set SUPPORT_EMAIL (or BREVO_GMAIL_TO) to your Gmail support inbox" });
    }

    const resolvedSubject = subject || "I hope this message finds you well.";
    const textContent = emailMessage || `I hope this message finds you well.\n\nI am writing to request assistance regarding ${issue || "system support"}.\n\nPlease find my details below:\n• Name: ${user.full_name}\n• Exporter/Company Name: ${companyName || "[Company Name]"}\n• Flight/Date (if applicable): ${flightDate || "[Details]"}\n• Issue Description: ${issueDescription || issue || "[Explain briefly but clearly]"}\n\nI would appreciate your support in resolving this matter as soon as possible.\n\nThank you for your time and assistance.\n\nKind regards,\n${user.full_name}\n${contactNumber || "[Your Contact Number]"}`;

    await sendBrevoEmail({
      sender,
      to: [{
        email: supportEmail,
        name: "SBU Support"
      }],
      replyTo: {
        email: user.email,
        name: user.full_name
      },
      subject: resolvedSubject,
      textContent
    });

    return res.json({ message: "Support email sent successfully" });
  } catch (error) {
    return next(error);
  }
}

async function sendPublicSupportEmail(req, res, next) {
  try {
    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({ message: "BREVO_API_KEY is not configured" });
    }

    const {
      subject,
      issue,
      companyName,
      flightDate,
      issueDescription,
      contactNumber,
      fullName,
      email,
      emailMessage
    } = req.body;

    const supportEmail = process.env.SUPPORT_EMAIL || process.env.BREVO_GMAIL_TO;
    const sender = getBrevoSender();

    if (!supportEmail) {
      return res.status(500).json({ message: "Set SUPPORT_EMAIL (or BREVO_GMAIL_TO) to your Gmail support inbox" });
    }

    const guestName = fullName || "Website Visitor";
    const guestEmail = email || sender.email;
    const resolvedSubject = subject || "I hope this message finds you well.";
    const textContent = emailMessage || `I hope this message finds you well.\n\nI am writing to request assistance regarding ${issue || "system support"}.\n\nPlease find my details below:\n• Name: ${guestName}\n• Exporter/Company Name: ${companyName || "[Company Name]"}\n• Flight/Date (if applicable): ${flightDate || "[Details]"}\n• Issue Description: ${issueDescription || issue || "[Explain briefly but clearly]"}\n\nI would appreciate your support in resolving this matter as soon as possible.\n\nThank you for your time and assistance.\n\nKind regards,\n${guestName}\n${contactNumber || "[Your Contact Number]"}`;

    await sendBrevoEmail({
      sender,
      to: [{
        email: supportEmail,
        name: "SBU Admin Support"
      }],
      replyTo: {
        email: guestEmail,
        name: guestName
      },
      subject: resolvedSubject,
      textContent
    });

    return res.json({ message: "Support email sent to admin successfully" });
  } catch (error) {
    return next(error);
  }
}

async function sendAdminEmailToUser(req, res, next) {
  try {
    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({ message: "BREVO_API_KEY is not configured" });
    }

    const { recipientEmail, subject, issueDescription } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ message: "recipientEmail is required" });
    }

    const targets = await query(
      `SELECT id, full_name, email, role FROM users WHERE email = ? LIMIT 1`,
      [recipientEmail]
    );

    if (!targets.length) {
      return res.status(404).json({ message: "Recipient user not found" });
    }

    const target = targets[0];
    const sender = getBrevoSender();
    const resolvedSubject = subject || `Admin Support Update for ${target.full_name}`;
    const textContent = `Hello ${target.full_name},\n\n${issueDescription || "This is an update from SBU admin."}\n\nSent by:\n${req.user.full_name} (${req.user.email})\nRole: ${req.user.role}\n\nKind regards,\nSBU Export Coordination Hub`;

    await sendBrevoEmail({
      sender,
      to: [{
        email: target.email,
        name: target.full_name
      }],
      replyTo: {
        email: req.user.email,
        name: req.user.full_name
      },
      subject: resolvedSubject,
      textContent
    });

    return res.json({ message: `Email sent to ${target.full_name}` });
  } catch (error) {
    return next(error);
  }
}

module.exports = { sendSupportEmail, sendPublicSupportEmail, sendAdminEmailToUser };
