## Android APK — Final Mobile V2

- Built with EAS `preview` profile (`android.buildType=apk`)
- API: `https://paperpilotph.vercel.app/api`
- App version **0.2.3**, versionCode **18**
- Signed with Expo-managed release keystore (same as prior EAS builds)
- Git: `mobile-main` @ `52ad7ea` — Final Mobile V2

### What's in this build
- **Plan upload limits:** Free 15 MB · Premium 45 MB · Pro 120 MB
- **Oversize modal:** blocked before upload with “Upload limit reached” messaging
- **Picker hints** show the current plan’s max size
- Keeps existing mobile design and Final Mobile UX (skeleton loading, scan usage, tracing, manuscripts)

### Tests before build
- `vitest` — **43/43 passed**
- Node syntax check on changed files — OK

### Install
Uninstall the previous PaperPilot APK if Android blocks the update, then install this APK.

Built: 2026-11-19
