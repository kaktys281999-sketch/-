/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // компактный самодостаточный сервер для Docker (node server.js)
  output: "standalone",
};

module.exports = nextConfig;
