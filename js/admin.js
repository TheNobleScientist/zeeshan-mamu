import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, query, orderBy, serverTimestamp, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Global list of active exhibitions to manage UI state
let existingExhibitions = [];

/* ==========================================================================
   MANDATORY FIRESTORE CONNECTION TEST & ERROR HANDLERS
   ========================================================================== */
const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Client is offline.");
    }
  }
}

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "bypassed_local_admin",
      email: "zeeshan",
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/* ==========================================================================
   SECURE LOCAL AUTHENTICATION
   ========================================================================== */
const loginContainer = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const adminEmailDisplay = document.getElementById("admin-user-email");
const loginError = document.getElementById("login-error");

function checkAuthSession() {
  const isAuth = localStorage.getItem("zee_admin_authenticated") === "true";
  if (isAuth) {
    loginContainer.style.display = "none";
    adminPanel.style.display = "block";
    adminEmailDisplay.textContent = "zeeshan";
    loadAdminShows(); // load existing lists
  } else {
    loginContainer.style.display = "block";
    adminPanel.style.display = "none";
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Check session on page load
checkAuthSession();

/* ==========================================================================
   SIGN IN TRIGGER
   ========================================================================== */
const loginForm = document.getElementById("login-form");
const loginSubmitBtn = document.getElementById("login-submit-btn");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginError.style.display = "none";
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Signing In...";

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  if (username === "zeeshan" && password === "aambal") {
    localStorage.setItem("zee_admin_authenticated", "true");
    checkAuthSession();
  } else {
    loginError.textContent = "Invalid username or password. Please try again.";
    loginError.style.display = "block";
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = "Sign In";
  }
});

/* ==========================================================================
   LOG OUT TRIGGER
   ========================================================================== */
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("zee_admin_authenticated");
  loginForm.reset();
  loginError.style.display = "none";
  loginSubmitBtn.disabled = false;
  loginSubmitBtn.textContent = "Sign In";
  checkAuthSession();
});

/* ==========================================================================
   FILE INPUT DIRECTORY HANDLING
   ========================================================================== */
const fileInput = document.getElementById("image-folder");
const fileDropArea = document.getElementById("file-drop-area");
const filesSummaryText = document.getElementById("files-summary-text");

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []).filter(file => file.type.startsWith("image/"));
  
  if (files.length > 0) {
    filesSummaryText.textContent = `✓ ${files.length} images selected.`;
    filesSummaryText.style.display = "block";
  } else {
    filesSummaryText.textContent = "No valid images found.";
    filesSummaryText.style.display = "block";
    fileInput.value = ""; // clear
  }
});

// Setup drag & drop styles
fileDropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDropArea.classList.add("drag-over");
});

fileDropArea.addEventListener("dragleave", () => {
  fileDropArea.classList.remove("drag-over");
});

fileDropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDropArea.classList.remove("drag-over");
  
  const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("image/"));
  if (files.length > 0) {
    // Setting files programmatically to file input
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    
    filesSummaryText.textContent = `✓ ${files.length} images dropped.`;
    filesSummaryText.style.display = "block";
  }
});

/* ==========================================================================
   STORAGE DESTINATION CONFIGURATION (Hardcoded Cloudflare R2 Credentials)
   ========================================================================== */
const R2_ENDPOINT = "https://1678eee8f73791d4a58d197f01f089d8.r2.cloudflarestorage.com";
const R2_BUCKET = "zeeshan-mamu";
const R2_ACCESS_KEY = "e6f8046a1c8221e1d0a9c534b3125d52";
const R2_SECRET_KEY = "91a1a2226a13451545a99896256d526895e85648ea4f4eb9b45b3a781dff9c46";
const R2_PUBLIC_URL = "https://pub-d13bf540ee3045a392647f8e648281d4.r2.dev";

/* ==========================================================================
   SERIES UPLOADS CMS ENGINE (Sequential Promise Chaining)
   ========================================================================== */
const uploadForm = document.getElementById("upload-form");
const uploadError = document.getElementById("upload-error");
const uploadSuccess = document.getElementById("upload-success");
const progressContainer = document.getElementById("upload-progress-container");
const progressFill = document.getElementById("upload-progress-fill");
const progressText = document.getElementById("upload-progress-text");
const progressPercentage = document.getElementById("upload-progress-percentage");
const uploadSubmitBtn = document.getElementById("upload-submit-btn");

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Reset states
  uploadError.style.display = "none";
  uploadSuccess.style.display = "none";
  
  const files = Array.from(fileInput.files || []).filter(file => file.type.startsWith("image/"));
  if (files.length === 0) {
    uploadError.textContent = "Please select or drop valid images.";
    uploadError.style.display = "block";
    return;
  }

  const title = document.getElementById("show-name").value.trim();
  const year = parseInt(document.getElementById("show-year").value.trim(), 10);
  const type = document.querySelector('input[name="show-type"]:checked').value;
  
  // Lock Submit UI
  uploadSubmitBtn.disabled = true;
  uploadSubmitBtn.innerHTML = `<i data-lucide="loader-2" style="width: 16px; height: 16px; margin-right: 0.5rem; display: inline-block; vertical-align: middle; animation: spin 1s linear infinite;"></i> Uploading...`;
  if (window.lucide) window.lucide.createIcons();

  progressContainer.style.display = "block";
  progressFill.style.width = "0%";
  progressPercentage.textContent = "0%";
  progressText.textContent = `Preparing to upload ${files.length} images...`;
  
  const slugifiedTitle = slugify(title);
  const timestamp = Date.now();
  const uploadedImages = [];

  try {
    const totalFiles = files.length;
    
    // Initialize S3 Client once
    const s3Client = new S3Client({
      endpoint: R2_ENDPOINT,
      region: "auto",
      credentials: {
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY,
      },
    });

    // Upload files sequentially to avoid UI stalls and Firestore lockouts
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const safeFilename = cleanFilenameForStorage(file.name);
      
      // R2 storage path key: shows/${year}/${slugifiedTitle}-${timestamp}/${safeFilename}
      const fileKey = `shows/${year}/${slugifiedTitle}-${timestamp}/${safeFilename}`;
      
      const uploader = new Upload({
        client: s3Client,
        params: {
          Bucket: R2_BUCKET,
          Key: fileKey,
          Body: file,
          ContentType: file.type,
        },
      });

      uploader.on("httpUploadProgress", (progress) => {
        if (progress.loaded && progress.total) {
          const filePercent = Math.round((progress.loaded / progress.total) * 100);
          let aggregatePercent = Math.round(((i / totalFiles) * 100) + (filePercent / totalFiles));
          aggregatePercent = Math.max(0, Math.min(100, aggregatePercent));

          progressFill.style.width = `${aggregatePercent}%`;
          progressPercentage.textContent = `${aggregatePercent}%`;
          progressText.textContent = `Uploading file ${i + 1} of ${totalFiles}: ${file.name} (${filePercent}%)`;
        }
      });

      await uploader.done();
      
      const finalUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${fileKey}`;
      uploadedImages.push({
        url: finalUrl,
        path: fileKey,
        name: file.name
      });
    }

    // Double-check we have uploaded images
    if (uploadedImages.length === 0) {
      throw new Error("No files were uploaded successfully.");
    }

    // Update progress to indicate database phase
    progressFill.style.width = "95%";
    progressPercentage.textContent = "95%";
    progressText.textContent = "Saving exhibition metadata to database...";

    // Build the collection document fields
    const showPayload = {
      title,
      year,
      type,
      coverUrl: uploadedImages[0].url, // coverUrl is the first uploaded image's URL
      images: uploadedImages,
      createdAt: serverTimestamp()
    };

    // Save metadata to Firestore shows collection
    const collectionPath = "shows";
    try {
      await addDoc(collection(db, collectionPath), showPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, collectionPath);
    }

    // Set progress to complete before hiding
    progressFill.style.width = "100%";
    progressPercentage.textContent = "100%";
    progressText.textContent = "Upload complete!";

    // Delay form reset and progress hiding slightly so the user sees the 100% completion state
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Success state
    uploadSuccess.textContent = `Success! Exhibition "${title}" uploaded containing ${uploadedImages.length} images.`;
    uploadSuccess.style.display = "block";
    
    // Reset Form
    uploadForm.reset();
    filesSummaryText.style.display = "none";
    progressContainer.style.display = "none";
    
    // Refresh Shows lists
    loadAdminShows();

  } catch (err) {
    console.error("Exhibition Upload Failure: ", err);
    let errorMessage = err.message || String(err);
    
    // Provide diagnostic help for common Firebase and Storage errors
    if (errorMessage.includes("storage/unauthorized") || errorMessage.includes("permission-denied") || errorMessage.includes("Permission denied")) {
      errorMessage = "Permission Denied. Please make sure you are signed in as muhammadzainb@gmail.com and your Firebase Storage rules allow writing. If you recently modified firestore.rules or storage.rules, ensure they are deployed correctly.";
    } else if (errorMessage.includes("storage/retry-limit-exceeded")) {
      errorMessage = "Upload Timeout: The upload took too long or was interrupted. Check your network connection.";
    } else if (errorMessage.includes("storage/project-not-found") || errorMessage.includes("bucket") || errorMessage.includes("storage/unknown")) {
      errorMessage = "Storage Service Error. Ensure Firebase Storage has been enabled/created in your Firebase Console (Build > Storage > Get Started) and the bucket matches your config.";
    }
    
    uploadError.textContent = `Upload Failed: ${errorMessage}`;
    uploadError.style.display = "block";
    progressContainer.style.display = "none";
  } finally {
    // Reset buttons UI
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtn.innerHTML = `<i data-lucide="upload-cloud" style="width: 16px; height: 16px; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></i> Upload Series`;
    if (window.lucide) window.lucide.createIcons();
  }
});

/* ==========================================================================
   LOAD EXISTING EXHIBITIONS LIST
   ========================================================================== */
const adminShowsList = document.getElementById("admin-shows-list");
const deleteError = document.getElementById("delete-error");
const deleteSuccess = document.getElementById("delete-success");

async function loadAdminShows() {
  deleteError.style.display = "none";
  deleteSuccess.style.display = "none";

  const collectionPath = "shows";
  try {
    const q = query(collection(db, collectionPath), orderBy("year", "desc"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    existingExhibitions = [];
    adminShowsList.innerHTML = "";

    if (querySnapshot.empty) {
      adminShowsList.innerHTML = `
        <div class="empty-state">
          <p>No active exhibitions yet. Use the upload panel to get started.</p>
        </div>
      `;
      return;
    }

    querySnapshot.forEach((docSnap) => {
      existingExhibitions.push({ id: docSnap.id, ...docSnap.data() });
    });

    existingExhibitions.forEach((show) => {
      const row = document.createElement("div");
      row.className = "show-item-row";
      
      row.innerHTML = `
        <div class="show-item-left">
          <img class="show-item-thumb" src="${show.coverUrl}" alt="Thumbnail for ${show.title}" loading="lazy" referrerPolicy="no-referrer">
          <div class="show-item-details">
            <span class="show-item-title">${show.title}</span>
            <div class="show-item-meta">
              <span>${show.year}</span>
              <span>•</span>
              <span>${show.type} SHOW</span>
              <span>•</span>
              <span>${show.images ? show.images.length : 0} image(s)</span>
            </div>
          </div>
        </div>
        <button class="btn btn-danger delete-btn" data-id="${show.id}">
          <i data-lucide="trash-2" style="width: 13px; height: 13px; margin-right: 0.35rem; display: inline-block; vertical-align: middle;"></i>
          Delete
        </button>
      `;
      
      // Attach single item delete click handler
      row.querySelector(".delete-btn").addEventListener("click", () => triggerExhibitionDelete(show));
      
      adminShowsList.appendChild(row);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }

  } catch (err) {
    console.error("Error fetching existing shows: ", err);
    adminShowsList.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--error);">Error loading exhibitions. Check permissions.</p>
      </div>
    `;
  }
}

/* ==========================================================================
   DELETE EXHIBITION AND REMOVE STORAGE FILES (Atomic Sync cleanups)
   ========================================================================== */
async function triggerExhibitionDelete(show) {
  const isConfirmed = confirm(`Are you sure you want to permanently delete "${show.title}" (${show.year})?\nThis will remove the Firestore entry and delete ALL ${show.images.length} images from Storage.`);
  
  if (!isConfirmed) return;

  deleteError.style.display = "none";
  deleteSuccess.style.display = "none";
  
  // Disable row's delete button to prevent double-click race conditions
  const deleteBtn = document.querySelector(`.delete-btn[data-id="${show.id}"]`);
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";
  }

  try {
    // 1. Delete associated images from Cloudflare R2 Storage
    if (show.images && show.images.length > 0) {
      const deletePromises = show.images.map(async (image) => {
        try {
          if (image.path) {
            const s3Client = new S3Client({
              endpoint: R2_ENDPOINT,
              region: "auto",
              credentials: {
                accessKeyId: R2_ACCESS_KEY,
                secretAccessKey: R2_SECRET_KEY,
              },
            });
            await s3Client.send(new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: image.path
            }));
            console.log(`Deleted file from Cloudflare R2: ${image.path}`);
          }
        } catch (storageErr) {
          // Log but continue if some file is already missing
          console.warn(`Could not delete storage file from R2 at ${image.path}: `, storageErr);
        }
      });
      await Promise.all(deletePromises);
    }

    // 2. Delete Firestore Document entry
    const docPath = `shows/${show.id}`;
    try {
      await deleteDoc(doc(db, "shows", show.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }

    // Success and update listing
    deleteSuccess.textContent = `Successfully deleted exhibition "${show.title}".`;
    deleteSuccess.style.display = "block";
    loadAdminShows();

  } catch (err) {
    console.error("Delete failure: ", err);
    deleteError.textContent = `Could not delete exhibition: ${err.message || err}`;
    deleteError.style.display = "block";
    
    // Reset row delete button state
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = `<i data-lucide="trash-2" style="width: 13px; height: 13px; margin-right: 0.35rem; display: inline-block; vertical-align: middle;"></i> Delete`;
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

/* ==========================================================================
   UTILITY HELPERS
   ========================================================================== */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Replace spaces with -
    .replace(/[^\w\-]+/g, "")       // Remove all non-word chars
    .replace(/\-\-+/g, "-");        // Replace multiple - with single -
}

function cleanFilenameForStorage(name) {
  if (!name) return "unnamed_file";
  // Remove spaces, replace with underscores, keep alphanumeric/extensions
  return name.trim().replace(/\s+/g, "_").replace(/[^\w\.\-]/g, "");
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  testConnection();
});
