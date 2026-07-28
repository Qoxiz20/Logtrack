/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        depot: {
          900: "#131A22", // near-black navy, main dark surface
          800: "#1C2733",
          700: "#2B3A4A",
          100: "#EDEFF1",
        },
        route: {
          DEFAULT: "#3E7CB1", // steady blue, primary actions
          light: "#DCEAF6",
        },
        flag: {
          DEFAULT: "#D9822B", // amber, for error/status flags
          light: "#FBE8D2",
        },
        bonus: {
          DEFAULT: "#2F9E5B", // green, reward earned
          light: "#DFF3E7",
        },
        paper: "#F6F4F0",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
