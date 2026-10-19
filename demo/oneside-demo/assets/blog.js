/* 工作与时日 — blog interactions, no dependencies. */
(() => {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const articles = window.WORK_DAYS_ARTICLES || {};
  const byId = (id, scope = document) => scope.querySelector(id);

  /* ——— Page ready / intro ——— */
  const markReady = () => root.classList.add("is-ready");
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(markReady);
  }
  window.setTimeout(markReady, 700);

  /* ——— Current year ——— */
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  /* ——— Work / Days mode, paper / night reading ——— */
  const themeToggle = byId("[data-theme-toggle]");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const skyWash = byId("[data-sky-wash]");
  const modeKicker = byId("[data-mode-kicker]");
  const modeNote = byId("[data-mode-note]");
  const modeMark = byId("[data-mode-mark]");
  const modeMarkEn = byId("[data-mode-mark-en]");
  let switching = false;
  let switchTimer = 0;
  let washTimer = 0;

  const applyModeCopy = (isNight) => {
    if (modeKicker) {
      modeKicker.textContent = isNight
        ? "夜色、阅读与一些很小的日子"
        : "设计、判断与缓慢发生的事";
    }
    if (modeNote) {
      modeNote.textContent = isNight ? "夜里，时间慢下来。" : "今天也慢慢来。";
    }
    if (modeMark) modeMark.textContent = isNight ? "时日" : "工作";
    if (modeMarkEn) modeMarkEn.textContent = isNight ? "D" : "W";
  };

  const applyTheme = (theme, { persist = true } = {}) => {
    const isNight = theme === "night";

    root.dataset.theme = isNight ? "night" : "day";
    applyModeCopy(isNight);

    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(isNight));
      themeToggle.setAttribute(
        "aria-label",
        isNight ? "切换到工作模式（开灯）" : "切换到时日模式（关灯）"
      );
    }
    if (themeMeta) {
      themeMeta.setAttribute("content", isNight ? "#171812" : "#f2eee5");
    }

    if (persist) {
      try {
        localStorage.setItem("workdays-theme", isNight ? "night" : "day");
      } catch (error) {
        /* storage can be unavailable */
      }
    }
  };

  const switchTheme = () => {
    if (switching) return;
    const nextTheme = root.dataset.theme === "night" ? "day" : "night";

    if (reducedMotion || !skyWash) {
      applyTheme(nextTheme);
      return;
    }

    switching = true;
    window.clearTimeout(switchTimer);
    window.clearTimeout(washTimer);

    const origin = themeToggle?.querySelector(".theme-orb") || themeToggle;
    if (origin) {
      const rect = origin.getBoundingClientRect();
      const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
      const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
      skyWash.style.setProperty("--wash-x", `${x.toFixed(2)}%`);
      skyWash.style.setProperty("--wash-y", `${y.toFixed(2)}%`);
    }

    skyWash.style.setProperty(
      "--wash-bg",
      nextTheme === "night" ? "#171812" : "#f2eee5"
    );
    skyWash.classList.remove("is-running");
    void skyWash.offsetWidth;
    skyWash.classList.add("is-running");

    switchTimer = window.setTimeout(() => {
      applyTheme(nextTheme);
    }, 680);

    washTimer = window.setTimeout(() => {
      skyWash.classList.remove("is-running");
      switching = false;
    }, 1250);
  };

  applyTheme(root.dataset.theme === "night" ? "night" : "day", {
    persist: false
  });

  themeToggle?.addEventListener("click", switchTheme);

  /* ——— Hangzhou time, date and day progress ——— */
  const clockNodes = [...document.querySelectorAll("[data-clock]")];
  const clockTimeNodes = [...document.querySelectorAll("[data-clock-time]")];
  const dateNode = byId("[data-date]");
  const dayStatusNode = byId("[data-day-status]");
  const timeZone = "Asia/Shanghai";
  let timeFormatter;
  let dateFormatter;

  try {
    timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    dateFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });
  } catch (error) {
    timeFormatter = null;
    dateFormatter = null;
  }

  const updateTime = () => {
    const now = new Date();
    let hour = now.getHours();
    let minute = now.getMinutes();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    let weekday = "";

    if (timeFormatter) {
      const timeParts = timeFormatter.formatToParts(now);
      hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? hour);
      minute = Number(timeParts.find((part) => part.type === "minute")?.value ?? minute);
    }

    if (dateFormatter) {
      const dateParts = dateFormatter.formatToParts(now);
      year = dateParts.find((part) => part.type === "year")?.value ?? year;
      month = dateParts.find((part) => part.type === "month")?.value ?? month;
      day = dateParts.find((part) => part.type === "day")?.value ?? day;
      weekday = dateParts.find((part) => part.type === "weekday")?.value ?? "";
    }

    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const time = `${hh}:${mm}`;
    const mmPadded = String(month).padStart(2, "0");
    const ddPadded = String(day).padStart(2, "0");
    const ratio = (hour * 60 + minute) / 1440;
    const percent = Math.round(ratio * 100);

    clockNodes.forEach((node) => {
      node.textContent = `杭州 ${time}`;
    });
    clockTimeNodes.forEach((node) => {
      node.textContent = time;
    });
    if (dateNode) {
      dateNode.textContent = `${year}.${mmPadded}.${ddPadded}${weekday ? ` / ${weekday}` : ""}`;
    }
    if (dayStatusNode) {
      dayStatusNode.textContent = `杭州 ${time} · 一天已过 ${percent}%`;
    }
    root.style.setProperty("--day-progress", `${ratio * 360}deg`);
    root.style.setProperty("--day-angle", `${ratio * 360}deg`);
  };

  updateTime();
  window.setInterval(updateTime, 30000);

  /* ——— Scroll reveal with a fail-safe ——— */
  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  if (revealItems.length && !reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, instance) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          instance.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
    );
    revealItems.forEach((item) => observer.observe(item));

    window.setTimeout(() => {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      observer.disconnect();
    }, 2400);
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  /* ——— Thin page progress + quiet sticky header ——— */
  const pageProgress = byId("[data-scroll-progress]");
  const header = byId(".site-header");
  let scrollFrame = 0;

  const updateScroll = () => {
    scrollFrame = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
    if (pageProgress) pageProgress.style.transform = `scaleX(${progress})`;
    if (header) header.classList.toggle("is-compact", window.scrollY > 72);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    },
    { passive: true }
  );
  updateScroll();

  /* ——— Article hover preview ——— */
  const preview = byId("[data-article-preview]");
  if (preview) {
    const previewRows = [...document.querySelectorAll("[data-preview]")];
    const fields = {
      index: byId("[data-preview-field='index']", preview),
      category: byId("[data-preview-field='category']", preview),
      title: byId("[data-preview-field='title']", preview),
      excerpt: byId("[data-preview-field='excerpt']", preview),
      meta: byId("[data-preview-field='meta']", preview)
    };
    let previewTimer = 0;
    let previewToken = 0;

    const renderPreview = (project) => {
      fields.index.textContent = project.index;
      fields.category.textContent = `${project.category} / ${project.en}`;
      fields.title.textContent = project.title;
      fields.excerpt.textContent = project.excerpt;
      fields.meta.textContent = `${project.date} · ${project.read}`;
    };

    const setPreview = (articleId, immediate = false) => {
      const project = articles[articleId];
      if (!project) return;
      const token = (previewToken += 1);
      window.clearTimeout(previewTimer);

      const commit = () => {
        if (token !== previewToken) return;
        renderPreview(project);
        preview.classList.remove("is-changing");
      };

      if (immediate || reducedMotion) {
        commit();
      } else {
        preview.classList.add("is-changing");
        previewTimer = window.setTimeout(commit, 150);
      }
    };

    previewRows.forEach((row) => {
      const update = () => setPreview(row.dataset.preview);
      row.addEventListener("pointerenter", update);
      row.addEventListener("focus", update);
    });

    const initial = previewRows[0]?.dataset.preview || "three-parts";
    setPreview(initial, true);
  }

  /* ——— Reading sheet ——— */
  const sheet = byId("[data-reading-sheet]");
  if (sheet) {
    const scrollArea = byId("[data-reading-scroll]", sheet);
    const progressBar = byId("[data-reading-progress]", sheet);
    const body = byId("[data-read-body]", sheet);
    const readFields = [...sheet.querySelectorAll("[data-read-field]")];
    let closing = false;
    let lastTrigger = null;

    const renderBody = (blocks) => {
      body.replaceChildren();
      blocks.forEach((block) => {
        let node;
        if (block.type === "quote") {
          node = document.createElement("blockquote");
        } else if (block.type === "h3") {
          node = document.createElement("h3");
        } else {
          node = document.createElement("p");
        }
        node.textContent = block.text;
        body.append(node);
      });
    };

    const updateReadingProgress = () => {
      if (!scrollArea || !progressBar) return;
      const max = scrollArea.scrollHeight - scrollArea.clientHeight;
      const ratio = max > 0 ? Math.min(Math.max(scrollArea.scrollTop / max, 0), 1) : 0;
      progressBar.style.transform = `scaleX(${ratio})`;
    };

    const openArticle = (articleId, trigger) => {
      const article = articles[articleId];
      if (!article || sheet.open) return;

      lastTrigger = trigger || null;
      readFields.forEach((field) => {
        field.textContent = article[field.dataset.readField] || "";
      });
      renderBody(article.blocks);
      scrollArea.scrollTop = 0;
      updateReadingProgress();
      closing = false;
      sheet.classList.remove("is-closing");

      sheet.showModal();
      document.body.classList.add("has-dialog");
      requestAnimationFrame(() => {
        sheet.classList.add("is-open");
        updateReadingProgress();
      });
    };

    const closeArticle = () => {
      if (!sheet.open || closing) return;
      closing = true;
      sheet.classList.add("is-closing");

      const finish = () => {
        sheet.close();
        sheet.classList.remove("is-open", "is-closing");
        document.body.classList.remove("has-dialog");
        closing = false;
        if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
      };

      if (reducedMotion) finish();
      else window.setTimeout(finish, 320);
    };

    document.querySelectorAll("[data-article]").forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        openArticle(trigger.dataset.article, trigger);
      });
    });

    sheet.querySelectorAll("[data-reading-close]").forEach((button) => {
      button.addEventListener("click", closeArticle);
    });

    sheet.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeArticle();
    });

    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) closeArticle();
    });

    scrollArea.addEventListener("scroll", updateReadingProgress, { passive: true });
    window.addEventListener("resize", updateReadingProgress);
  }

  /* ——— Letter form ——— */
  const letterForm = byId("[data-letter-form]");
  if (letterForm) {
    const input = byId("#letter-email", letterForm);
    const note = byId("[data-form-note]", letterForm);
    const button = letterForm.querySelector("button[type='submit']");

    if (input && note && button) {
      const setNote = (message, isError = false) => {
        note.textContent = message;
        note.classList.toggle("is-error", isError);
      };

      letterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!input.value.trim() || !input.checkValidity()) {
          setNote("请填写一个有效的邮箱地址。", true);
          input.focus();
          return;
        }

        letterForm.classList.add("is-sent");
        input.disabled = true;
        button.disabled = true;
        button.textContent = "已订阅";
        setNote("已记下。下一封信见。");
      });

      input.addEventListener("input", () => {
        if (note.classList.contains("is-error")) setNote("一月一封，随时可以退订。");
      });
    }
  }
})();
