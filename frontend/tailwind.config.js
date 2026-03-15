/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        baby: {
          mint: "#4ADE80",
          sky: "#60A5FA",
          peach: "#FB923C",
          lavender: "#A78BFA",
          cream: "#FEF3C7",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
