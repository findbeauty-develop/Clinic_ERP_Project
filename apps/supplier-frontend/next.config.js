/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production build'da console.log'larni olib tashlash
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // error va warn'larni saqlash (muhim loglar)
    } : false,
  },
};

module.exports = nextConfig;

