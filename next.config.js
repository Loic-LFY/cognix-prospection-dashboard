/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Silence the build warning for server-side modules
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only modules on the client
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('better-sqlite3');
      }
    }
    return config;
  },
};

module.exports = nextConfig;
