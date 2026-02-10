/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/schema', '@repo/database'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
