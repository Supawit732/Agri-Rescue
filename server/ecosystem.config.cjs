// pm2 process config for the university deploy.
// dotenv is loaded by the app itself from server/.env (see src/db/pool.ts and
// src/server.ts), so no env_file / env block is needed here — just make sure
// server/.env exists before starting.
module.exports = {
  apps: [
    {
      name: 'agri-rescue',
      cwd: '/app/agri-rescue/server',
      script: 'dist/server.js',
      // Fallback if `npm run build` fails on the server (no compiled dist/):
      //   script: 'node_modules/.bin/tsx',
      //   args: 'src/server.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
