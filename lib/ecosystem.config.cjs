// ecosystem.config.cjs — PM2 process manager config (auto-restart / watchdog).
// ---------------------------------------------------------------------------
// PM2 keeps the server alive: it restarts the process automatically on any
// crash AND whenever the built-in watchdog calls process.exit(1) because the
// data feed went dead. Together they give you "always-on" behaviour.
//
// USAGE (on the cloud server, once):
//   npm i -g pm2
//   pm2 start ecosystem.config.cjs
//   pm2 save               # remember the process list
//   pm2 startup            # run the printed command -> auto-start on reboot
//
// Handy:
//   pm2 logs apex-server   # live logs
//   pm2 restart apex-server
//   pm2 status
// ---------------------------------------------------------------------------

module.exports = {
  apps: [
    {
      name: 'apex-server',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,          // restart on crash or watchdog exit(1)
      max_restarts: 100,          // within min_uptime window
      min_uptime: '10s',
      restart_delay: 3000,        // wait 3s between restarts (avoid hot loops)
      exp_backoff_restart_delay: 200,
      max_memory_restart: '500M', // restart if it leaks past 500 MB
      kill_timeout: 5000,
      watch: false,               // do NOT restart on file changes in prod
      time: true,                 // timestamp every log line
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Optional overrides (uncomment / edit as needed):
        // BINANCE_HOSTS: 'https://data-api.binance.vision,https://api.binance.com',
        // WATCH_STALE_MS: 45000,   // force-refresh if no fresh price for this long
        // WATCH_DEAD_MS: 180000,   // exit(1) for restart if dead past this long
      },
    },
  ],
};
