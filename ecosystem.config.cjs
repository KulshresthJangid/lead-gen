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
      max_memory_restart: '512M',

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
