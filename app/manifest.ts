import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hustlemania",
    short_name: "Hustlemania",
    description: "14-day goal sprints",
    start_url: "/sprints",
    display: "standalone",
    background_color: "#f7fbfd",
    theme_color: "#f7fbfd",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
