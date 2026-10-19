// PM2 process config — CommonJS (.cjs) required because the project uses
// "type": "module" in package.json.
// Usage:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 reload lead-gen-server --update-env
module.exports = {
  apps: [
    {
      name: 'lead-gen-server',
      script: 'index.js',
      cwd: '/root/apps/lead-gen/server',
      interpreter: 'node',
      autorestart: true,
      watch: false,
      // Was 512M — steady-state memory during an active scrape/enrich
      // cycle runs ~630-665MB (confirmed from PM2's own restart log), so
      // the old ceiling was restarting the process roughly every 30
      // minutes, which happened to match the campaigns' own cron
      // interval closely enough that it was killing pipeline runs
      // mid-flight before they could insert a single lead or log
      // completion — every campaign, every cycle, 0 completed runs.
      // 1536M gives real headroom above observed usage; server has
      // 7.7GB free, so this is not tight. Doesn't fix whatever is
      // actually growing memory each cycle — just stops it from cutting
      // off every run before it finishes.
      max_memory_restart: '1536M',

      // Production env — activated with --env production
      env_production: {
        NODE_ENV: 'production',
        PORT: '3002',
        DB_TYPE: 'sqlite',
        LOG_LEVEL: 'info',
        // Update this to your public domain
        ALLOWED_ORIGINS: 'https://buildwithkulshresth.com,http://buildwithkulshresth.com',
        // Auth credentials — override these with strong values
        AUTH_USERNAME: 'admin',
        AUTH_PASSWORD: 'admin',
        JWT_SECRET: 'change-me-to-a-long-random-string',
      },

      // Local dev env (default)
      env: {
        NODE_ENV: 'development',
        PORT: '3001',
        DB_TYPE: 'sqlite',
        LOG_LEVEL: 'debug',
        ALLOWED_ORIGINS: 'http://localhost:3000',
        AUTH_USERNAME: 'admin',
        AUTH_PASSWORD: 'admin',
        JWT_SECRET: 'leadgen-dev-secret',
      },
    },
  ],
};
