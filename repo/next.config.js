/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=(), camera=()'
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig
