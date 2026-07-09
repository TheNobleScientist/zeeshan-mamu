import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase App with Fast Offline Caching
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contact-form");
  const contactSubmitBtn = document.getElementById("contact-submit-btn");
  const contactError = document.getElementById("contact-error");
  const contactSuccessState = document.getElementById("contact-success-state");
  const resetContactBtn = document.getElementById("reset-contact-btn");

  // Load Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Reset UI state
      contactError.style.display = "none";
      contactError.textContent = "";
      contactSubmitBtn.disabled = true;
      contactSubmitBtn.innerHTML = `<i data-lucide="loader-2" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i> Sending...`;
      if (window.lucide) {
        window.lucide.createIcons();
      }

      const name = document.getElementById("contact-name").value.trim();
      const email = document.getElementById("contact-email").value.trim();
      const subject = document.getElementById("contact-subject").value.trim();
      const message = document.getElementById("contact-message").value.trim();

      try {
        // Save to Firestore
        await addDoc(collection(db, "contact_messages"), {
          name,
          email,
          subject,
          message,
          createdAt: serverTimestamp()
        });

        // Hide form and show success state
        contactForm.style.display = "none";
        contactSuccessState.style.display = "block";
      } catch (error) {
        console.error("Failed to send contact message: ", error);
        contactError.textContent = "Unable to deliver your message at this time. Please try again or email us directly at info@muhammadzeeshan.art.";
        contactError.style.display = "block";
        contactSubmitBtn.disabled = false;
        contactSubmitBtn.innerHTML = `<i data-lucide="send" style="width: 16px; height: 16px;"></i> Send Message`;
        if (window.lucide) {
          window.lucide.createIcons();
        }
      }
    });
  }

  if (resetContactBtn) {
    resetContactBtn.addEventListener("click", () => {
      if (contactForm) {
        contactForm.reset();
        contactForm.style.display = "block";
      }
      contactSuccessState.style.display = "none";
      if (contactSubmitBtn) {
        contactSubmitBtn.disabled = false;
        contactSubmitBtn.innerHTML = `<i data-lucide="send" style="width: 16px; height: 16px;"></i> Send Message`;
      }
      if (window.lucide) {
        window.lucide.createIcons();
      }
    });
  }
});
