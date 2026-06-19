/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf2f8',
          100: '#fce7f3',
          200: '#f9c0d8',
          300: '#f472b6',
          400: '#e0448a',
          500: '#C0186A',
          600: '#C0186A',
          700: '#a01458',
          800: '#831047',
          900: '#5B2D8E',
          950: '#4A2070',
        },
        purple: {
          ub: '#5B2D8E',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-ub': 'linear-gradient(135deg, #5B2D8E, #C0186A)',
        'gradient-ub-hover': 'linear-gradient(135deg, #4A2070, #A01458)',
      }
    },
  },
  plugins: [],
}
