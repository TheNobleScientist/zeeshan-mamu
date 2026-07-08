import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Global State
let activeShow = null;
let activeImages = [];
let currentImageIndex = 0;

/* ==========================================================================
   MANDATORY FIRESTORE CONNECTION TEST
   ========================================================================== */
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Client is offline.");
    }
  }
}

/* ==========================================================================
   DATA LOADING & GROUPING
   ========================================================================== */
async function loadPortfolio() {
  const root = document.getElementById("portfolio-root");
  
  try {
    // 1. Fetch shows ordered by year desc, then createdAt desc
    const showsRef = collection(db, "shows");
    const q = query(showsRef, orderBy("year", "desc"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      root.innerHTML = `
        <div class="empty-state">
          <p>No exhibitions uploaded yet.</p>
        </div>
      `;
      return;
    }

    // 2. Clear loading state
    root.innerHTML = "";

    // 3. Group by year automatically in JS memory
    const groupedShows = {};
    querySnapshot.forEach((docSnap) => {
      const showData = { id: docSnap.id, ...docSnap.data() };
      const year = showData.year;
      if (!groupedShows[year]) {
        groupedShows[year] = [];
      }
      groupedShows[year].push(showData);
    });

    // 4. Render Grouped Year Sections
    const sortedYears = Object.keys(groupedShows).sort((a, b) => b - a);
    
    sortedYears.forEach((year) => {
      const section = document.createElement("section");
      section.className = "year-section";
      
      section.innerHTML = `
        <h2 class="year-title">${year}</h2>
        <div class="shows-grid" id="grid-${year}"></div>
      `;
      
      root.appendChild(section);
      
      const grid = document.getElementById(`grid-${year}`);
      
      groupedShows[year].forEach((show) => {
        const card = document.createElement("button");
        card.className = "show-card reveal";
        card.type = "button";
        card.setAttribute("aria-label", `View exhibition ${show.title}`);
        
        card.innerHTML = `
          <div class="image-container">
            <img class="show-cover" src="${show.coverUrl}" alt="Cover photo of ${show.title}" loading="lazy" referrerPolicy="no-referrer">
          </div>
          <div class="show-meta">
            <span class="badge">${show.type} Show</span>
            <span class="show-year-label">${show.year}</span>
          </div>
          <h3 class="show-title">${show.title}</h3>
        `;
        
        // Setup clicking trigger for the Lightbox
        card.addEventListener("click", () => openLightbox(show));
        
        grid.appendChild(card);
      });
    });

    // 5. Setup Scroll Reveal Animations via Intersection Observer
    setupScrollReveals();

  } catch (error) {
    console.error("Error loading portfolio: ", error);
    root.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--error);">Error loading exhibitions. Please try again later.</p>
      </div>
    `;
  }
}

/* ==========================================================================
   SCROLL REVEAL ANIMATIONS
   ========================================================================== */
function setupScrollReveals() {
  const reveals = document.querySelectorAll(".reveal");
  
  // High-performance IntersectionObserver configuration
  const observerOptions = {
    root: null, // viewport
    rootMargin: "0px 0px -80px 0px", // triggers slightly before entry for fluid feel
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, self) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        self.unobserve(entry.target); // Stop watching after reveal
      }
    });
  }, observerOptions);

  reveals.forEach((element) => observer.observe(element));
}

/* ==========================================================================
   INTERACTIVE FULL-SCREEN LIGHTBOX
   ========================================================================== */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const seriesInfo = document.getElementById("lightbox-series-info");
const imageName = document.getElementById("lightbox-image-name");
const counter = document.getElementById("lightbox-counter");

function openLightbox(show) {
  if (!show.images || show.images.length === 0) return;
  
  activeShow = show;
  activeImages = show.images;
  currentImageIndex = 0;
  
  // Show lightbox overlay
  lightbox.classList.add("active");
  document.body.style.overflow = "hidden"; // lock page scroll
  
  // Load initial image details
  updateLightboxImage();
}

function updateLightboxImage() {
  const activeImage = activeImages[currentImageIndex];
  
  // Remove loaded class to trigger fresh fade transition
  lightboxImg.classList.remove("loaded");
  
  // Pre-set src and trigger load event
  lightboxImg.src = activeImage.url;
  lightboxImg.alt = `${activeShow.title} - ${activeImage.name}`;
  
  lightboxImg.onload = () => {
    lightboxImg.classList.add("loaded");
  };

  // Update text metadata
  seriesInfo.textContent = `SERIES: ${activeShow.title} (${activeShow.year} • ${activeShow.type} SHOW)`.toUpperCase();
  imageName.textContent = cleanFilename(activeImage.name);
  counter.textContent = `${currentImageIndex + 1} of ${activeImages.length}`;
}

function cleanFilename(name) {
  if (!name) return "";
  // Strip common file extensions and replace underscores/dashes with spaces
  return name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
}

function closeLightbox() {
  lightbox.classList.remove("active");
  document.body.style.overflow = ""; // restore page scroll
  activeShow = null;
  activeImages = [];
  currentImageIndex = 0;
}

function nextImage() {
  if (activeImages.length <= 1) return;
  currentImageIndex = (currentImageIndex + 1) % activeImages.length;
  updateLightboxImage();
}

function prevImage() {
  if (activeImages.length <= 1) return;
  currentImageIndex = (currentImageIndex - 1 + activeImages.length) % activeImages.length;
  updateLightboxImage();
}

/* ==========================================================================
   EVENT INITIALIZATIONS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // 1. Initial connection test
  testConnection();
  
  // 2. Fetch data
  loadPortfolio();
  
  // 3. Setup Close, Prev, Next buttons
  document.getElementById("lightbox-close-btn").addEventListener("click", closeLightbox);
  document.getElementById("lightbox-prev-btn").addEventListener("click", prevImage);
  document.getElementById("lightbox-next-btn").addEventListener("click", nextImage);

  // Close lightbox clicking on backdrop (outside the image container)
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.classList.contains("lightbox-stage") || e.target.classList.contains("lightbox-image-wrapper")) {
      closeLightbox();
    }
  });

  // 4. Keyboard Shortcuts support (Escape to close, arrows for nav)
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("active")) return;
    
    if (e.key === "Escape") {
      closeLightbox();
    } else if (e.key === "ArrowRight") {
      nextImage();
    } else if (e.key === "ArrowLeft") {
      prevImage();
    }
  });

  // 5. Load Lucide Icons for our elements
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
