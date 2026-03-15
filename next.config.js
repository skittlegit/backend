/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable pages/public folder features since this is API-only
  reactStrictMode: false,
};

module.exports = nextConfig;
