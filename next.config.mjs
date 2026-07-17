/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      // MediaPipe's WASM backend and the camera stream both behave best when the
      // document is cross-origin isolated; Permissions-Policy must explicitly
      // allow the camera or getUserMedia is rejected inside embedded contexts.
      source: '/(.*)',
      headers: [
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), xr-spatial-tracking=(self)' },
      ],
    },
  ],
};

export default nextConfig;
