/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--border-glow)",
        background: "var(--bg)",
        foreground: "var(--text)",
        primary: {
          DEFAULT: "var(--primary)",
          soft: "var(--primary-soft)",
          foreground: "#ffffff",
        },
        lavender: "var(--lavender)",
        accent: {
          DEFAULT: "var(--accent)",
          2: "var(--accent-2)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--bg-2)",
          foreground: "var(--text)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        muted: {
          DEFAULT: "var(--bg-2)",
          foreground: "var(--text-2)",
        },
        popover: {
          DEFAULT: "var(--surface-strong)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text)",
        },
        sidebar: {
          DEFAULT: "var(--surface-strong)",
          foreground: "var(--text)",
          primary: "var(--primary)",
          "primary-foreground": "#ffffff",
          accent: "var(--bg-2)",
          "accent-foreground": "var(--text)",
          border: "var(--border)",
          ring: "var(--border-glow)",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Noto Kufi Arabic"', '"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "20px",
        lg: "14px",
        md: "12px",
        sm: "8px",
        xs: "6px",
      },
      transitionTimingFunction: {
        "expo-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
