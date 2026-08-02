// Build-time config used by the Sentry Vercel integration to upload source
// maps and set release info. Environment variables come from Vercel.
module.exports = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
};
