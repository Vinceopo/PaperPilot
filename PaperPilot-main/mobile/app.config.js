/** Extends app.json. EAS builds set PAPERPILOT_API_URL (see eas.json); local dev keeps the LAN apiUrl. */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.PAPERPILOT_API_URL || config.extra?.apiUrl,
  },
});
