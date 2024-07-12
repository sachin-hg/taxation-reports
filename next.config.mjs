/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Set the desired size limit here
    },
  }
};

export default nextConfig;
