import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/subjects': 'http://127.0.0.1:8000',
      '/timetable': 'http://127.0.0.1:8000',
      '/attendance': 'http://127.0.0.1:8000',
      '/analytics': 'http://127.0.0.1:8000',
      '/leave_plans': 'http://127.0.0.1:8000',
      '/user': 'http://127.0.0.1:8000',
      '/reports': 'http://127.0.0.1:8000',
      '/state': 'http://127.0.0.1:8000',
      '/semesters': 'http://127.0.0.1:8000',
      '/sessions': 'http://127.0.0.1:8000',
    }
  }
});
