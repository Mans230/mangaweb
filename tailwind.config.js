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
        display: ['"IBM Plex Sans Arabic"', '"Barlow Condensed"', "ui-sans-serif", "system-ui", "sans-serif"],
        condensed: ['"Barlow Condensed"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Zeko spec: حواف حادة 2px في كل مكان — الأفاتار فقط دائري (rounded-full)
      borderRadius: {
        none: "0px",
        DEFAULT: "2px",
        xs: "2px",
        sm: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
        "3xl": "2px",
        full: "9999px",
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
