import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/poker-preflop-trainer/',
  plugins: [react()],
})
