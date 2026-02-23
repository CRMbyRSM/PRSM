# PRSM Release Checklist

Every release **must** ship all four packages. No exceptions.

## Required Artifacts

| File | Platform |
|------|----------|
| `PRSM-{version}-linux-x86_64.AppImage` | Linux |
| `PRSM-Setup-{version}.exe` | Windows (installer) |
| `PRSM-Portable-{version}.exe` | Windows (portable) |
| `PRSM-{version}-android.apk` | Android |

---

## Release Steps

### 1. Bump the version

```bash
# Edit package.json — update "version" field
# e.g. "version": "1.12.0"
```

### 2. Build everything

```bash
export ANDROID_HOME=/home/riktanius/android-sdk
export ANDROID_SDK_ROOT=/home/riktanius/android-sdk

npm run build:release
```

> **First time on a new machine?** Run `npx cap add android` before building if the `android/` directory doesn't exist.

### 3. Verify artifacts

```bash
ls -lh release/ | grep -E "AppImage|Setup|Portable|android"
```

You should see all four files with the new version number.

### 4. Commit and push

```bash
git add -A
git commit -m "v{version} — <brief description>"
git push origin main
```

### 5. Create GitHub release

```bash
gh release create v{version} --repo CRMbyRSM/PRSM \
  --title "v{version}" \
  --notes "## What's New in v{version}
..."
```

### 6. Upload all artifacts

```bash
gh release upload v{version} \
  "release/PRSM-{version}-linux-x86_64.AppImage" \
  "release/PRSM-{version}-android.apk" \
  "release/PRSM-Setup-{version}.exe" \
  "release/PRSM-Portable-{version}.exe" \
  --repo CRMbyRSM/PRSM
```

### 7. Verify on GitHub

Check [Releases](https://github.com/CRMbyRSM/PRSM/releases) — confirm all 4 assets are attached.

---

## Environment Setup (Linux build host)

```bash
# Android SDK
export ANDROID_HOME=/home/riktanius/android-sdk
export ANDROID_SDK_ROOT=/home/riktanius/android-sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin

# Windows cross-compile (if not installed)
sudo apt install nsis wine
```

---

## ⚠️ Common Mistakes

- **Never** use `npm run build` alone for a release — it only builds Linux
- **Never** skip the Android APK — all four artifacts are required
- **Always** bump the version in `package.json` before building
- **Always** use `npx cap add android` on first run if `android/` is missing
