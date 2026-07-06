

const hamburger = document.getElementById("hamburger");
const rnav = document.getElementById("rnav");

if(hamburger && rnav)
  {
    function closeMenu()
      {
        rnav.classList.remove("active");
        hamburger.classList.remove("open");
      }

    hamburger.addEventListener("click", (e) =>
      {
        e.stopPropagation();
        rnav.classList.toggle("active");
        hamburger.classList.toggle("open");
      });

    rnav.addEventListener("click", (e) =>
      {
        e.stopPropagation(); // keep open when clicking inside menu
      });

    document.addEventListener("click", () =>
          {
            if(rnav.classList.contains("active"))
              {
                closeMenu();
              }
          });
  }


// Home page stats info

const counters = document.querySelectorAll(".counter");
let statsDataReady = false;
let statsAnimated = false;

 
function animateCounter(el)
  {
    const target = Number(el.dataset.target || 0);
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 60));

    const timer = setInterval(() =>
      {
        current += step;
        if (current >= target)
          {
            el.textContent = target;
            clearInterval(timer);
          }
        else
          {
            el.textContent = current;
          }
      }, 20);
  }


let statsDelayStarted = false;

function tryAnimateStatsOnScreen()
  {
    if(statsAnimated || !statsDataReady || statsDelayStarted) return;

    const statsSection = document.querySelector(".stats");
    if(!statsSection) return;

    const rect = statsSection.getBoundingClientRect();

    // Start animation when stats section is visible
    if(rect.top < window.innerHeight - 100)
      {
        statsDelayStarted = true;

        setTimeout(() =>
          {
            if (statsAnimated) return;
            statsAnimated = true;
            counters.forEach((el) => animateCounter(el));
          }, 450); 
     
      }
  }



fetch("/php/home_page.php")
    .then((response) => response.json())
    .then((data) => {
                      const ids = {"total-donors": data.total_donors ?? 0,
                                        "available-donors": data.available_donors ?? 0,
                                        "total-donations": data.total_donations ?? 0,
                                        "last-7-days-registered-donors": data.registered_last_7_days ?? 0
                                  };
                      Object.entries(ids).forEach(([id, value]) =>
                        {
                          const el = document.getElementById(id);
                          if(!el) return;
                          el.textContent = "0";
                          el.dataset.target = String(value);
                        });

                        statsDataReady = true;
                        tryAnimateStatsOnScreen();
                    })

    .catch((error) => {
                        console.error("Failed to Load Stats:", error);
                      });
                            

window.addEventListener("scroll", tryAnimateStatsOnScreen);
window.addEventListener("resize", tryAnimateStatsOnScreen);
      
 
                      
                      
fetch("/php/server.php",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "action=get_top_donors"
  }
  )
  .then((response) => response.json())
  .then((donors) =>
    {
      const container = document.getElementById("top-donors-list");

      if(!container) return;

      container.innerHTML = "";

      if (!Array.isArray(donors) || donors.length === 0)
        {
          container.innerHTML = "<p>No Top Donors yet.</p>";
          return;
        }

      donors.slice(0, 5).forEach((donor, idx) =>
        {
          const card = document.createElement("div");
          card.className = "donor-card";

          if(idx === 0) card.classList.add("gold");
          else if(idx === 1) card.classList.add("silver");
          else if(idx === 2) card.classList.add("bronze");

          const initials = (donor.name ?? "U")
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const rankBadge =
            idx === 0 ? "🥇" :
            idx === 1 ? "🥈" :
            idx === 2 ? "🥉" :
            String(idx + 1);

          const photo = (donor.donor_photo ?? "").trim();
          
          card.innerHTML = `
            <div class="donor-rank">${rankBadge}</div>
            <div class="donor-avatar">${photo ? `<img src = "${photo}" alt = "${donor.name ?? "Donor"}">` : initials}</div>
            <h3>${donor.name ?? "Unknown"}</h3>
            <span class="blood-tag">${donor.blood_group ?? "-"}</span>
            <p>${donor.total_donations ?? 0} Donations</p>
          `;
          
          container.appendChild(card);
        });
        
    })
    
    .catch((error) => 
      {
         console.error("Failed to Load Top Donors:", error);

        const container = document.getElementById("top-donors-list");
        if (container) container.innerHTML = "<p>Failed to load top donors.</p>";

      });




  