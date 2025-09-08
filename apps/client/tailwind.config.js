/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dragon-primary': '#4a9eff',
        'dragon-secondary': '#ff6b6b',
        'dragon-dark': '#1a1a2e',
        'dragon-light': '#f0f3ff',
        'dragon-grass': '#7cb342',
        'dragon-water': '#42a5f5',
        'dragon-sand': '#ffb74d',
        'dragon-stone': '#757575',
        'dragon-forest': '#2e7d32'
      },
      fontFamily: {
        'game': ['Segoe UI', 'system-ui', 'sans-serif']
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      }
    },
  },
  plugins: [],
}