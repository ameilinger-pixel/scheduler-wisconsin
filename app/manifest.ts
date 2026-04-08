import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ephraim cottage — who’s there when",
    short_name: "Ephraim cottage",
    description: "See when family is at the cottage and add your own dates in a few taps.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f2",
    theme_color: "#0d9488",
    orientation: "portrait-primary",
  };
}
