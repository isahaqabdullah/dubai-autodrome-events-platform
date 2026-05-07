import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function nextConfig(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next/dev" : ".next",
    poweredByHeader: false,
    typedRoutes: true,
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            {
              key: "Referrer-Policy",
              value: "same-origin"
            },
            {
              key: "X-Content-Type-Options",
              value: "nosniff"
            }
          ]
        }
      ];
    }
  };
}
