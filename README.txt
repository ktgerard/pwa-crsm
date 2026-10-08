Cut Room Supply Manager v0.1

Supabase project:
wmlzhagkjhuunnadgcbm

Included:
- Authenticated sign-in
- Master Supply List with supplier tabs and search
- Monthly Count in presentation-group order
- Min/Max suggested-order calculation
- Draft count save/resume
- Completed inventory sessions
- PWA manifest + service worker

Before deployment:
1. In Supabase Authentication, create/confirm the user account you will use.
2. Host these files over HTTPS (GitHub Pages is fine).
3. Sign in with the Supabase Auth email/password.
4. Test Master Supply List.
5. Start a test count, save several quantities, reload the page, and confirm the draft resumes.
6. Do not use "Complete Count" for production until the test behaves correctly.

Security:
config.js contains only the browser-safe publishable key supplied for this project.
Never place a service-role key or database password in this PWA.

v0.2 target:
Review suggested order -> manual override -> group by vendor -> generate/print order -> order history.
