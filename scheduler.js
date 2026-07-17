// This local-only queue lets us finish and test the scheduling interface safely.
// It will move to secure cloud storage before Instagram publishing is enabled.
const DRAFTS_KEY = "instagram_generator_scheduler_drafts_v1";
const form = document.querySelector("#scheduleForm");
const account = document.querySelector("#draftAccount");
const scheduledAt = document.querySelector("#draftScheduledAt");
const caption = document.querySelector("#draftCaption");
const hashtags = document.querySelector("#draftHashtags");
const queueCount = document.querySelector("#queueCount");
const emptyQueue = document.querySelector("#emptyQueue");
const scheduledList = document.querySelector("#scheduledList");

function getDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function accountLabel(value) {
  return {
    pawsitive_husky: "Pawsitive husky",
    corporate_donkey: "The corporate donkey",
    mooing_aunty: "The mooing aunty"
  }[value] || value;
}

function formatScheduledTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function renderDrafts() {
  const drafts = getDrafts().sort((first, second) => new Date(first.scheduledAt) - new Date(second.scheduledAt));
  queueCount.textContent = `${drafts.length} ${drafts.length === 1 ? "post" : "posts"}`;
  emptyQueue.hidden = drafts.length > 0;
  scheduledList.innerHTML = drafts.map((draft) => `
    <article class="scheduled-post">
      <div>
        <span class="post-status">Local draft</span>
        <h3>${accountLabel(draft.account)}</h3>
        <p class="scheduled-time">${formatScheduledTime(draft.scheduledAt)}</p>
        ${draft.caption ? `<p class="post-caption"></p>` : ""}
      </div>
      <button class="remove-draft-button" type="button" data-draft-id="${draft.id}">Remove</button>
    </article>
  `).join("");
  drafts.forEach((draft) => {
    const text = scheduledList.querySelector(`[data-draft-id="${draft.id}"]`)?.closest(".scheduled-post")?.querySelector(".post-caption");
    if (text) text.textContent = draft.caption;
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const drafts = getDrafts();
  drafts.push({
    id: crypto.randomUUID(),
    account: account.value,
    scheduledAt: new Date(scheduledAt.value).toISOString(),
    caption: caption.value.trim(),
    hashtags: hashtags.value.trim(),
    status: "draft",
    createdAt: Date.now()
  });
  saveDrafts(drafts);
  form.reset();
  renderDrafts();
});

scheduledList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-draft-id]");
  if (!button) return;
  saveDrafts(getDrafts().filter((draft) => draft.id !== button.dataset.draftId));
  renderDrafts();
});

renderDrafts();
