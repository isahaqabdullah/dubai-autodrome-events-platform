import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-open-sans)", "Open Sans", "sans-serif"],
        title: ["var(--font-title)", "Gotham Ultra", "Arial Black", "sans-serif"]
      },
      colors: {
        ink: "#0C1723",
        mist: "#EEF4F8",
        aurora: "#D7F4E2",
        ember: "#F9825C",
        gold: "#F4B860",
        slate: "#58728C"
      },
      boxShadow: {
        soft: "0 20px 60px rgba(12, 23, 35, 0.12)"
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(circle at top left, rgba(244, 184, 96, 0.18), transparent 30%), radial-gradient(circle at top right, rgba(249, 130, 92, 0.16), transparent 26%), linear-gradient(180deg, #f5fbff 0%, #eef4f8 100%)"
      }
    }
  },
  plugins: []
};

export default config;
