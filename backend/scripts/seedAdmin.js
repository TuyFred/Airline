require('dotenv').config();

const { ensureAdminUser } = require('../services/adminBootstrap');

function parseArg(name) {
  const key = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(key));
  return match ? match.slice(key.length).trim() : '';
}

async function run() {
  try {
    const emailArg = parseArg('email');
    const passwordArg = parseArg('password');
    const fullNameArg = parseArg('name');

    if (emailArg) process.env.ADMIN_EMAIL = emailArg;
    if (passwordArg) process.env.ADMIN_PASSWORD = passwordArg;
    if (fullNameArg) process.env.ADMIN_FULL_NAME = fullNameArg;

    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.error('Missing admin credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, or pass --email and --password.');
      process.exit(1);
    }

    await ensureAdminUser();
    console.log('Admin seed completed.');
    process.exit(0);
  } catch (error) {
    console.error('Admin seed failed:', error.message);
    process.exit(1);
  }
}

run();
