/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // public/data/* 為靜態資產，不納入 Serverless function trace
  outputFileTracingExcludes: {
    '*': ['./public/data/**'],
  },

  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
