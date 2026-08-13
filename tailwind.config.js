/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12161C",
        paper: "#F4F5F7",
        accent: "#00B8A9",
        accentDark: "#00877D",
        warn: "#D97706",
        danger: "#DC2626",
        info: "#2563EB",
        ok: "#16A34A",
      },
      fontFamily: {
        disp: ["'Space Grotesk'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
