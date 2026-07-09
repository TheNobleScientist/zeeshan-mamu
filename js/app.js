import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, query, orderBy, doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase App with Fast Offline Caching
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

// Global State
let activeShow = null;
let activeImages = [];
let currentImageIndex = 0;
let allShows = [];

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

    // 2. Populate allShows in-memory
    allShows = [];
    querySnapshot.forEach((docSnap) => {
      allShows.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 3. Make Search Controls Visible
    const controls = document.getElementById("portfolio-controls");
    if (controls) {
      controls.style.display = "block";
      controls.classList.add("visible");
    }

    // 4. Render Initial List
    renderShows(allShows);

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
   SHOWS RENDERING ENGINE
   ========================================================================== */
function renderShows(showsList) {
  const root = document.getElementById("portfolio-root");
  root.innerHTML = "";

  if (showsList.length === 0) {
    root.innerHTML = `
      <div class="no-results">
        <h3>No exhibitions found</h3>
        <p>Try refining your search by entering a different title or year.</p>
      </div>
    `;
    return;
  }

  // 1. Group by year automatically in JS memory
  const groupedShows = {};
  showsList.forEach((show) => {
    const year = show.year;
    if (!groupedShows[year]) {
      groupedShows[year] = [];
    }
    groupedShows[year].push(show);
  });

  // 2. Render Year Navigation Bar (if there are multiple years)
  const sortedYears = Object.keys(groupedShows).sort((a, b) => b - a);
  
  if (sortedYears.length > 1) {
    const yearNav = document.createElement("div");
    yearNav.className = "year-nav-bar reveal visible";
    yearNav.innerHTML = `
      <span class="year-nav-label">Years</span>
      <div class="year-nav-links">
        ${sortedYears.map((year, index) => `
          <button type="button" class="year-nav-btn ${index === 0 ? 'active' : ''}" data-year="${year}">
            ${year}
          </button>
        `).join("")}
      </div>
    `;
    root.appendChild(yearNav);

    // Attach smooth scroll handler
    yearNav.querySelectorAll(".year-nav-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const selectedYear = e.currentTarget.getAttribute("data-year");
        const targetSection = document.getElementById(`section-${selectedYear}`);
        if (targetSection) {
          yearNav.querySelectorAll(".year-nav-btn").forEach(b => b.classList.remove("active"));
          e.currentTarget.classList.add("active");
          
          targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  // 3. Render Grouped Year Sections
  sortedYears.forEach((year) => {
    const section = document.createElement("section");
    section.className = "year-section";
    section.id = `section-${year}`;
    
    section.innerHTML = `
      <h2 class="year-title">${year}</h2>
      <div class="shows-grid" id="grid-${year}"></div>
    `;
    
    root.appendChild(section);
    
    const grid = document.getElementById(`grid-${year}`);
    
    groupedShows[year].forEach((show) => {
      const card = document.createElement("button");
      card.className = "show-card reveal visible";
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

  // 4. Setup Active Year Intersection Observer for automated scroll highlighting
  if (sortedYears.length > 1) {
    const navButtons = document.querySelectorAll(".year-nav-btn");
    const sectionObserverOptions = {
      root: null,
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0
    };

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const activeId = entry.target.id;
          const activeYear = activeId.replace("section-", "");
          
          navButtons.forEach((btn) => {
            if (btn.getAttribute("data-year") === activeYear) {
              btn.classList.add("active");
            } else {
              btn.classList.remove("active");
            }
          });
        }
      });
    }, sectionObserverOptions);

    sortedYears.forEach((year) => {
      const sect = document.getElementById(`section-${year}`);
      if (sect) {
        sectionObserver.observe(sect);
      }
    });
  }

  // 5. Setup Scroll Reveal Animations via Intersection Observer
  setupScrollReveals();
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

  // 6. Client-Side Real-Time Exhibition Search & Filter
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");

  if (searchInput && clearSearchBtn) {
    searchInput.addEventListener("input", (e) => {
      const queryText = e.target.value.toLowerCase().trim();
      
      // Toggle clear search button visibility
      if (queryText.length > 0) {
        clearSearchBtn.style.display = "flex";
      } else {
        clearSearchBtn.style.display = "none";
      }

      // Filter shows by title, year, or type (Solo/Group)
      const filtered = allShows.filter(show => {
        const titleMatch = show.title && show.title.toLowerCase().includes(queryText);
        const yearMatch = show.year && String(show.year).toLowerCase().includes(queryText);
        const typeMatch = show.type && show.type.toLowerCase().includes(queryText);
        return titleMatch || yearMatch || typeMatch;
      });

      renderShows(filtered);
    });

    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchBtn.style.display = "none";
      searchInput.focus();
      renderShows(allShows);
    });
  }
});
