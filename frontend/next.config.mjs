/** @type {import('next').NextConfig} */
const backend = process.env.NEXT_PUBLIC_BACKEND_HTTP || "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/backend/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

export default nextConfig;
