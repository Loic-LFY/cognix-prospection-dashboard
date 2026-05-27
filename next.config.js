/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence the build warning for server-side modules
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('better-sqlite3');
      }
    }
    return config;
  },
};

module.exports = nextConfig;
