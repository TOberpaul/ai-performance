const { resolve } = require('node:path');

const colors = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted',
  'muted-foreground', 'accent', 'accent-foreground', 'border', 'input', 'ring',
  'destructive', 'destructive-foreground',
];

module.exports = {
  content: ['app.jsx', 'components/**/*.{jsx,tsx}'].map((path) => resolve(__dirname, path).replace(/\\/g, '/')),
  theme: {
    extend: {
      colors: Object.fromEntries(colors.map((name) => [name, `hsl(var(--${name}) / <alpha-value>)`])),
    },
  },
};
