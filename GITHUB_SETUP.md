# Push to GitHub

Your project is ready to push. Follow these steps:

## 1. Create a new repository on GitHub

1. Go to https://github.com/new
2. Enter a repository name (e.g. `skin-analysis-app`)
3. Choose **Public**
4. **Do NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **Create repository**

## 2. Add remote and push

Replace `YOUR_USERNAME` with your GitHub username and `REPO_NAME` with your repo name:

```powershell
cd "c:\Users\ajahangir\Pictures\BU"
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

Example if your username is `ajahangir` and repo is `skin-analysis-app`:
```powershell
git remote add origin https://github.com/ajahangir/skin-analysis-app.git
git branch -M main
git push -u origin main
```

## What's included

- **backend/** - FastAPI skin analysis API + web UI (AILab Skin Analysis Pro)
- **skin_analysis.py** - Standalone analysis script
- **.gitignore** - Excludes .env, 00000/ (sample images), __pycache__, etc.
