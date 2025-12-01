(function ($) {
  const galleryRow = document.getElementById("galleryRow");
  if (!galleryRow) return;

  const exts = ["jpg","png","jpeg","webp"];
  const PER_PAGE = 9; // change number of cards per page
  const paginationContainerId = "galleryPagination";

  // internal cache: index -> src (string) or null (not found)
  const cache = new Map();

  // current page state
  let currentPage = 1;
  const totalPages = (typeof TOTAL === "number" && TOTAL > 0) ? Math.max(1, Math.ceil(TOTAL / PER_PAGE)) : 1;

  function loadImagesForPage(page) {
    const startIndex = (page - 1) * PER_PAGE + 1;
    const endIndex = Math.min(TOTAL, page * PER_PAGE);
    const promises = [];

    for (let i = startIndex; i <= endIndex; i++) {
      if (cache.has(i)) {
        // already known (no need to probe)
        promises.push(Promise.resolve({ index: i, src: cache.get(i) }));
      } else {
        // probe and cache
        promises.push(detectImageForIndex(i).then(src => ({ index: i, src })));
      }
    }

    return Promise.all(promises);
  }

  function detectImageForIndex(i) {
    return new Promise(resolve => {
      let resolved = false;
      (function tryExt(pos) {
        if (pos >= exts.length) {
          if (!resolved) {
            cache.set(i, null);
            resolved = true;
            resolve(null);
          }
          return;
        }
        const ext = exts[pos];
        const url = `${FOLDER}/${i}.${ext}`;
        const img = new Image();
        img.onload = function () {
          if (!resolved) {
            cache.set(i, url);
            resolved = true;
            resolve(url);
          }
        };
        img.onerror = function () {
          tryExt(pos + 1);
        };
        img.src = url;
      })(0);
    });
  }

  function renderPage(page) {
    currentPage = page;
    setPaginationStateLoading(true);

    // clear grid and show loader
    galleryRow.innerHTML = '<div class="col-12 py-4 text-center text-muted">Loading images…</div>';

    loadImagesForPage(page).then(results => {
      // results is array of {index, src}
      galleryRow.innerHTML = ""; // clear loader

      const frag = document.createDocumentFragment();
      let foundAny = false;
      results.forEach(item => {
        if (item && item.src) {
          foundAny = true;
          const wrapper = document.createElement("div");
          wrapper.className = "col-12 col-sm-6 col-md-4 col-lg-4";
          wrapper.innerHTML = cardHTML(item.src, item.index);
          attachCardHandlers(wrapper);
          frag.appendChild(wrapper);
        }
      });

      if (!foundAny) {
        const noCol = document.createElement("div");
        noCol.className = "col-12 text-center py-4";
        noCol.innerHTML = '<div class="text-muted">No images found on this page.</div>';
        frag.appendChild(noCol);
      }

      galleryRow.appendChild(frag);
      initMagnific(); // re-init (delegation) after DOM inserted
    }).catch(err => {
      console.error("Error loading page images:", err);
      galleryRow.innerHTML = '<div class="col-12 text-danger">Error loading images.</div>';
    }).finally(() => {
      setPaginationStateLoading(false);
      updatePaginationUI();
    });
  }

  function cardHTML(src, i) {
    return `
      <article class="card g-card" tabindex="0" aria-labelledby="title${i}">
        <div class="g-media">
          <div class="ratio-box">
            <img src="${src}" loading="lazy" alt="">
          </div>
          <div class="g-actions">
            <a href="${src}" class="popup-image btn btn-light shadow-sm" title="">
              <i class="fa-solid fa-magnifying-glass-plus"></i>
            </a>
          </div>
        </div>
      </article>
    `;
  }

  // initialize Magnific Popup (delegation so dynamic content works)
  function initMagnific() {
    // destroy previous instance by removing plugin data if exists (safe re-init)
    try {
      $(galleryRow).off('click.magnific');
    } catch (e) {}

    // init
    $(galleryRow).magnificPopup({
      delegate: 'a.popup-image',
      type: 'image',
      gallery: {
        enabled: true,
        navigateByImgClick: true,
        tPrev: 'Previous (Left arrow)',
        tNext: 'Next (Right arrow)'
      },
      mainClass: 'mfp-fade',
      removalDelay: 300
    });
  }

  // PAGINATION UI
  function ensurePaginationControls() {
    let pag = document.getElementById(paginationContainerId);
    if (!pag) {
      pag = document.createElement("div");
      pag.id = paginationContainerId;
      pag.className = "d-flex justify-content-center align-items-center gap-2 my-3";
      // insert after galleryRow
      galleryRow.parentNode.insertBefore(pag, galleryRow.nextSibling);
    }
    renderPaginationButtons(pag);
  }

  function renderPaginationButtons(container) {
    container.innerHTML = "";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "btn btn-outline-secondary btn-sm";
    prev.textContent = "Prev";
    prev.disabled = (currentPage <= 1);
    prev.addEventListener("click", () => goToPage(currentPage - 1));
    container.appendChild(prev);

    // show page numbers (simple windowed display)
    const maxButtons = 7;
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

    for (let p = start; p <= end; p++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm " + (p === currentPage ? "btn-primary" : "btn-outline-secondary");
      btn.textContent = p;
      btn.addEventListener("click", () => goToPage(p));
      container.appendChild(btn);
    }

    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn btn-outline-secondary btn-sm";
    next.textContent = "Next";
    next.disabled = (currentPage >= totalPages);
    next.addEventListener("click", () => goToPage(currentPage + 1));
    container.appendChild(next);
  }

  function updatePaginationUI() {
    const pag = document.getElementById(paginationContainerId);
    if (pag) renderPaginationButtons(pag);
  }

  function setPaginationStateLoading(isLoading) {
    const pag = document.getElementById(paginationContainerId);
    if (!pag) return;
    // disable all buttons while loading
    Array.from(pag.querySelectorAll("button")).forEach(btn => {
      btn.disabled = isLoading || btn.disabled;
    });
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    // if same page, do nothing
    if (page === currentPage) return;
    // render
    renderPage(page);
    // scroll to gallery top for better UX
    galleryRow.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function attachCardHandlers(colElement) {
    // keyboard: Enter opens
    const card = colElement.querySelector('.g-card');
    if (card) {
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const anchor = colElement.querySelector('a.popup-image');
          if (anchor) anchor.click();
        }
      });
    }
  }

  // kick things off
  $(function () {
    ensurePaginationControls();
    renderPage(currentPage);
  });

})(jQuery);
