# Who Posted This? 🎲

A real-time party trivia game. Guess who made the post!

---

## Setup Guide (one-time, ~15 minutes)

### Step 1 — Create a free Supabase project

1. Go to **https://supabase.com** and sign up (free)
2. Click **"New project"**
3. Give it a name (e.g. `who-posted-this`), set a database password, pick any region
4. Wait ~2 minutes for it to provision

### Step 2 — Set up the database tables

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase-setup.sql` from this folder and paste the entire contents
4. Click **"Run"**
5. You should see "Success. No rows returned."

### Step 3 — Enable real-time

1. In Supabase, go to **Database → Replication** (left sidebar)
2. Under "Tables", find `games` → toggle it ON
3. Find `reveals` → toggle it ON

### Step 4 — Get your API keys

1. In Supabase, go to **Settings → API** (left sidebar)
2. Copy the **Project URL** (looks like `https://abcxyz.supabase.co`)
3. Copy the **anon / public** key (long string starting with `eyJ...`)

### Step 5 — Create a GitHub repository

1. Go to **https://github.com** and sign up / log in
2. Click **"New repository"**
3. Name it `who-posted-this`, make it **Public**, click Create
4. Follow GitHub's instructions to push this folder:

```bash
cd who-posted-this        # this project folder
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/who-posted-this.git
git push -u origin main
```

### Step 6 — Deploy to Netlify

1. Go to **https://netlify.com** and sign up (free) — use your GitHub account
2. Click **"Add new site" → "Import an existing project"**
3. Choose **GitHub** → select your `who-posted-this` repo
4. Build settings should auto-detect. If not, set:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **"Deploy site"** — it'll fail at first (env vars missing), that's OK

### Step 7 — Add environment variables to Netlify

1. In Netlify, go to your site → **Site configuration → Environment variables**
2. Click **"Add a variable"** and add:
   - Key: `VITE_SUPABASE_URL` → Value: your Supabase Project URL
   - Key: `VITE_SUPABASE_ANON_KEY` → Value: your Supabase anon key
3. Go to **Deploys → "Trigger deploy" → "Deploy site"**

### Step 8 — You're live! 🎉

Netlify gives you a URL like `https://sparkly-unicorn-abc123.netlify.app`

- **You** go to that URL → Host Dashboard → Create a game
- **Players** get a link like `https://sparkly-unicorn-abc123.netlify.app/?game=ABC123&role=player`
- You can set a custom domain in Netlify settings if you want something cleaner

---

## Local development (optional)

```bash
npm install
cp .env.example .env        # then fill in your Supabase keys
npm run dev                  # opens at http://localhost:5173
```

---

## How to play

1. **Host** creates a game, adds questions (with optional images), hits Publish
2. **Host** copies the share link and sends it to players (text, group chat, QR code, etc.)
3. Players open the link on their phones — no account needed
4. **Host** hits Start when everyone has joined
5. Questions appear on everyone's phone simultaneously
6. Players tap to answer — the host sees who's answered in real time
7. Host can reveal a bonus image after each question, then advance
8. Final scores shown at the end

---

## Tech stack

- **React + Vite** — frontend
- **Supabase** — real-time Postgres database (free tier: 500MB, unlimited requests)
- **Netlify** — hosting (free tier: 100GB bandwidth/month)
