function getBranding() {
  return {
    companyName: process.env.COMPANY_NAME || "SBU Export Coordination Hub",
    supportEmail: process.env.SUPPORT_EMAIL || "support@sbu.rw",
    appUrl: process.env.APP_URL || "http://localhost:5173",
    logoUrl: process.env.EMAIL_LOGO_URL || "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=240&q=60",
    airplaneImageUrl: process.env.EMAIL_AIRPLANE_IMAGE_URL || "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=60"
  };
}

function buildBrandedEmail({ title, greeting, bodyHtml, footerNote }) {
  const brand = getBranding();

  const htmlContent = `
  <div style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#123;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:95%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d9e5f6;">
            <tr>
              <td style="background:linear-gradient(120deg,#0f4ea7,#1c78da);padding:16px 22px;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${brand.logoUrl}" alt="${brand.companyName} logo" width="48" height="48" style="display:block;border-radius:8px;border:2px solid rgba(255,255,255,.45);object-fit:cover;" />
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <div style="font-size:17px;font-weight:700;line-height:1.2;">${brand.companyName}</div>
                      <div style="font-size:12px;opacity:.9;">Cargo Booking Notification</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <img src="${brand.airplaneImageUrl}" alt="Airplane" style="display:block;width:100%;height:170px;object-fit:cover;" />
              </td>
            </tr>
            <tr>
              <td style="padding:22px;">
                <h2 style="margin:0 0 12px 0;font-size:22px;color:#0f2c63;">${title}</h2>
                <p style="margin:0 0 14px 0;font-size:14px;color:#35517e;">${greeting}</p>
                ${bodyHtml}
                <div style="margin-top:18px;padding:12px 14px;border-radius:10px;background:#f2f8ff;border:1px solid #d8e7fa;color:#32557f;font-size:13px;">
                  ${footerNote || `If you need help, contact our admin/support team at ${brand.supportEmail}.`}
                </div>
                <p style="margin:16px 0 0 0;font-size:12px;color:#6b84a8;">Open dashboard: <a href="${brand.appUrl}" style="color:#0f5fd0;">${brand.appUrl}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  return { htmlContent };
}

function bookingReceivedEmail(model) {
  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#517199;">Booking ID</td><td style="padding:6px 0;font-weight:700;color:#123a71;">#${model.bookingId}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Airline</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.airlineName}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Flight Date</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.flightDate}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Destination</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.destination}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Skids</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.skids}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Weight (kg)</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.kg}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Commodity</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.commodity}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Status</td><td style="padding:6px 0;font-weight:700;color:#0a8f49;">Pending airline review</td></tr>
    </table>`;

  return buildBrandedEmail({
    title: "Booking Received Successfully",
    greeting: `Hello ${model.name}, your cargo booking has been received and is now in review.`,
    bodyHtml
  });
}

function bookingCancelledEmail(model) {
  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:14px;color:#35517e;">Your booking has been cancelled successfully and released back to public capacity.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#517199;">Booking ID</td><td style="padding:6px 0;font-weight:700;color:#123a71;">#${model.bookingId}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Flight Date</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.flightDate}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Destination</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.destination}</td></tr>
    </table>`;

  return buildBrandedEmail({
    title: "Booking Cancelled",
    greeting: `Hello ${model.name},`,
    bodyHtml
  });
}

function accountLockedEmail(model) {
  const reasonBlock = model.reason
    ? `<p style="margin:0 0 10px 0;font-size:14px;color:#35517e;"><strong>Reason:</strong> ${model.reason}</p>`
    : "";

  const adminMessageBlock = model.adminMessage
    ? `<p style="margin:0 0 12px 0;font-size:14px;color:#35517e;"><strong>Admin message:</strong> ${model.adminMessage}</p>`
    : "";

  const contactBlock = model.supportContact
    ? `<tr><td style="padding:6px 0;color:#517199;">Support Contact</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.supportContact}</td></tr>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:14px;color:#35517e;">Your account is currently locked by an administrator.</p>
    <p style="margin:0 0 12px 0;font-size:14px;color:#35517e;">Please contact admin support to restore access.</p>
    ${reasonBlock}
    ${adminMessageBlock}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#517199;">User</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.name}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Email</td><td style="padding:6px 0;font-weight:700;color:#123a71;">${model.email}</td></tr>
      <tr><td style="padding:6px 0;color:#517199;">Action</td><td style="padding:6px 0;font-weight:700;color:#b54646;">Account locked</td></tr>
      ${contactBlock}
    </table>`;

  return buildBrandedEmail({
    title: "Account Access Restricted",
    greeting: `Hello ${model.name},`,
    bodyHtml,
    footerNote: `Please contact admin at ${model.supportEmail || getBranding().supportEmail} for assistance with unlocking your account.`
  });
}

module.exports = {
  bookingReceivedEmail,
  bookingCancelledEmail,
  accountLockedEmail
};
