/* Shared, dependency-free interactions for the ONESIDE directions. */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Current year in footer meta */
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  /* Quiet scroll reveals */
  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  if (revealItems.length && !reducedMotion && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealItems.forEach((item) => revealObserver.observe(item));

    // Fail-safe: never leave content hidden if observation is interrupted.
    window.setTimeout(() => {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      revealObserver.disconnect();
    }, 2400);
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  /* Direction A — floating project peek */
  const peek = document.querySelector("[data-project-peek]");
  if (peek && finePointer) {
    let activeRow = null;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const placePeek = () => {
      frame = 0;
      if (!activeRow) return;
      const width = 258;
      const gap = 26;
      const x =
        pointerX + width + gap > window.innerWidth
          ? pointerX - width - gap
          : pointerX + gap;
      const y = Math.min(
        Math.max(pointerY - 190, 16),
        window.innerHeight - 342
      );
      peek.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };

    document.querySelectorAll("[data-peek]").forEach((row) => {
      row.addEventListener("pointerenter", (event) => {
        activeRow = row;
        pointerX = event.clientX;
        pointerY = event.clientY;
        peek.dataset.visual = row.dataset.peek;
        peek.classList.add("is-on");
        if (!frame) frame = requestAnimationFrame(placePeek);
      });

      row.addEventListener("pointermove", (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!frame) frame = requestAnimationFrame(placePeek);
      });

      row.addEventListener("pointerleave", () => {
        activeRow = null;
        peek.classList.remove("is-on");
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      });
    });
  }

  /* Project dialog, shared by all directions */
  const dialog = document.querySelector("[data-project-dialog]");
  if (dialog && window.ONESIDE_PROJECTS) {
    const visual = dialog.querySelector("[data-dialog-visual]");
    const fields = [...dialog.querySelectorAll("[data-field]")];
    let opener = null;

    const openProject = (projectId, trigger) => {
      const project = window.ONESIDE_PROJECTS[projectId];
      if (!project) return;
      opener = trigger || null;
      fields.forEach((field) => {
        const key = field.dataset.field;
        field.textContent = project[key] || "";
      });
      if (visual) visual.dataset.visual = projectId;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
        document.body.classList.add("has-dialog");
      }
    };

    const closeDialog = () => {
      if (dialog.open) dialog.close();
    };

    document.querySelectorAll("[data-project]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        openProject(trigger.dataset.project, trigger);
      });
    });

    dialog.querySelectorAll("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", closeDialog);
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("has-dialog");
      if (opener && typeof opener.focus === "function") opener.focus();
    });
  }

  /* Direction C — a very small amount of pointer parallax */
  const parallaxRoot = document.querySelector("[data-parallax-root]");
  if (parallaxRoot && finePointer && !reducedMotion) {
    const layers = [...parallaxRoot.querySelectorAll("[data-parallax]")];
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.055;
      currentY += (targetY - currentY) * 0.055;
      layers.forEach((layer) => {
        const depth = Number(layer.dataset.parallax) || 0;
        layer.style.transform = `translate3d(${currentX * depth}px, ${currentY * depth}px, 0)`;
      });
      if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
        frame = requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    };

    parallaxRoot.addEventListener("pointermove", (event) => {
      const rect = parallaxRoot.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width - 0.5;
      targetY = (event.clientY - rect.top) / rect.height - 0.5;
      if (!frame) frame = requestAnimationFrame(render);
    });

    parallaxRoot.addEventListener("pointerleave", () => {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = requestAnimationFrame(render);
    });
  }
})();
