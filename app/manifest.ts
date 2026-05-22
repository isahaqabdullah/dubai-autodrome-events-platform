import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dubai Autodrome Events",
    short_name: "Autodrome",
    description: "Dubai Autodrome event registration",
    start_url: "/events",
    display: "standalone",
    background_color: "#0c1723",
    theme_color: "#0c1723",
    icons: [
      {
        src: "/icon1.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
