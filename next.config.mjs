/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  api: {
    bodyParser: {
      sizeLimit: '30mb', // Set the desired size limit here
    },
  }
};

export default nextConfig;
