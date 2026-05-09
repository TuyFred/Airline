const https = require("https");

function sendBrevoEmail(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.brevo.com",
      port: 443,
      path: "/v3/smtp/email",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "api-key": process.env.BREVO_API_KEY || ""
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          reject(new Error(`Brevo request failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getBrevoSender() {
  return {
    name: process.env.BREVO_SENDER_NAME || "SBU Export Coordination Hub",
    email: process.env.BREVO_SENDER_EMAIL || "no-reply@sbu.rw"
  };
}

module.exports = { sendBrevoEmail, getBrevoSender };