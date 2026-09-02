/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        navy: {
          DEFAULT: "#0F1B2D",
          mid: "#16233A",
          deep: "#0B1422",
        },
        accent: {
          DEFAULT: "#1BC9A0",
          hover: "#16B38E",
          muted: "#E6F9F4",
        },
      },
      transitionDuration: {
        180: "180ms",
      },
    },
  },
  plugins: [],
};
