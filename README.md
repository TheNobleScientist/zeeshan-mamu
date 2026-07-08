# Artist Portfolio CMS - Firebase Setup & Deployment Guide

This project is a static, high-performance artist portfolio website with a built-in admin panel (CMS) for uploading exhibitions as image folders. It uses vanilla HTML5, custom editorial CSS, and the Firebase modular SDK (v10) with no build steps or complex frameworks.

---

## 1. Firebase Project Setup

### Enable Email/Password Authentication
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. In the left-hand menu, navigate to **Build** > **Authentication** and click **Get Started**.
4. Go to the **Sign-in method** tab.
5. Click **Add new provider**, choose **Email/Password**, toggle **Enable** to active, and click **Save**.

### Create the Admin User
To prevent arbitrary public registrations, there is no sign-up form in the app. You must manually register the admin user:
1. Under the **Users** tab of the Authentication page, click **Add user**.
2. Enter the administrator's email: `muhammadzainb@gmail.com`
3. Enter a strong password and click **Add user**.
4. Ensure the email is marked as verified or complete the user creation process.

---

## 2. Database & Storage Provisioning

### Enable Cloud Firestore
1. Navigate to **Build** > **Firestore Database**.
2. Click **Create database**.
3. Select your database location (e.g., `us-central1` or other region matching your config).
4. Select **Start in test mode** or **Start in production mode**.
5. Once created, deploy the provided `firestore.rules` to secure the data.

### Enable Firebase Storage
1. Navigate to **Build** > **Storage**.
2. Click **Get Started**.
3. Select **Start in test mode** or **Start in production mode** and choose your bucket location.
4. Click **Done** to provision the cloud storage bucket.
5. Deploy the provided `storage.rules` to secure the image files.

---

## 3. Deploying Security Rules

These rules secure your database and storage, allowing public read-access while locking write/delete actions strictly to authenticated sessions from `muhammadzainb@gmail.com`.

### Deploying Firestore Rules
Using the Firebase CLI in your terminal:
```bash
firebase deploy --only firestore:rules
```

### Deploying Storage Rules
Using the Firebase CLI:
```bash
firebase deploy --only storage:rules
```

---

## 4. Hosting Deployment

This application is ready to be hosted on Firebase Hosting:

### Initialize Hosting
If you haven't initialized Firebase in this folder yet, run:
```bash
firebase init hosting
```
- Select your existing Firebase project.
- Specify `dist` (or `.` if deploying directly without Vite bundling) as your public directory.
- Configure as a single-page app: **No** (since we have multiple distinct pages `index.html` and `admin.html`).
- Set up automatic builds and deploys with GitHub: **Optional**.

### Deployment Command
To deploy your static pages to Firebase Hosting, run:
```bash
firebase deploy --only hosting
```

---

## 5. Local Development
We use **Vite** as a dev server in this environment. It handles routing and module serving seamlessly.

To start the dev server:
```bash
npm run dev
```

To build optimized assets for production:
```bash
npm run build
```
The output will compile into the `dist/` folder, which is the perfect target folder for your Firebase Hosting `public` field in `firebase.json`.
