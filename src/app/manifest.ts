import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Body · Your training space",
    short_name: "Body",
    description: "Your personal training space.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#325b44",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
